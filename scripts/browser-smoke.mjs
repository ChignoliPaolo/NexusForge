import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
import { readConfig, projectRoot } from '../server/config.mjs';

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'nexus-browser-'));
const output = resolve(projectRoot, 'artifacts');
mkdirSync(output, { recursive: true });
const { server, store } = createApp(readConfig({ NEXUS_DB_PATH: ':memory:', NEXUS_ALLOWED_HOSTS: 'nexusforge.test' }));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-gpu', '--disable-crash-reporter', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let nextId = 0;
let buffer = '';
let stderr = '';
let session;
let exited = false;
const pending = new Map();
const errors = [];
chrome.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-6000); });
chrome.on('exit', (code, signal) => {
  exited = true;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(`Chrome exited (${code ?? signal}). ${stderr.slice(-2000)}`)); }
  pending.clear();
});
chrome.on('error', error => { exited = true; for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); });

function send(method, params = {}, sessionId = session) {
  return new Promise((resolve, reject) => {
    if (exited) return reject(new Error(`Chrome is not running. ${stderr.slice(-2000)}`));
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}. ${stderr.slice(-1000)}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}

function localRequest(path, request) {
  return new Promise(resolve => {
    const incoming = Readable.from([Buffer.from(request.postData || '')]);
    Object.assign(incoming, { method: request.method, url: path, headers: Object.fromEntries(Object.entries({ host: 'nexusforge.test', ...request.headers }).map(([key, value]) => [key.toLowerCase(), value])), socket: { remoteAddress: '127.0.0.1' } });
    const response = { headersSent: false, writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; }, end(body) { resolve({ status: this.status, headers: this.headers, body: Buffer.isBuffer(body) ? body : Buffer.from(body) }); } };
    server.emit('request', incoming, response);
  });
}

async function event(message) {
  if (message.method === 'Fetch.requestPaused') {
    const request = message.params.request;
    const url = new URL(request.url);
    try {
      const response = await localRequest(url.pathname + url.search, request);
      await send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: response.status, responseHeaders: Object.entries(response.headers).map(([name, value]) => ({ name, value })), body: response.body.toString('base64') }, message.sessionId);
    } catch (error) { errors.push(error.message); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && message.params.entry.source !== 'network') errors.push(message.params.entry.text);
}

chrome.stdio[4].on('data', data => {
  buffer += data.toString();
  let separator;
  while ((separator = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, separator));
    buffer = buffer.slice(separator + 1);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) continue;
      clearTimeout(entry.timer); pending.delete(message.id);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    } else event(message).catch(error => errors.push(error.message));
  }
});

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function until(expression, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(output, name), Buffer.from(result.data, 'base64'));
}

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  session = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://nexusforge.test/*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://nexusforge.test/' });
  await until(`document.querySelector('#factory-canvas') !== null`, 'initial application render');
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Desktop overflow');
  await screenshot('01-mission-control.png');
  await evaluate(`location.hash = 'intake'`);
  await until(`document.querySelector('#intake-form') !== null`, 'evidence studio');
  await screenshot('02-evidence-studio.png');
  await evaluate(`location.hash = 'futures'`);
  await until(`document.querySelector('#diagnostic-result') !== null`, 'active diagnosis');
  const initialChoice = await evaluate(`document.querySelector('.plan-card.recommended h3').textContent`);
  await evaluate(`document.querySelector('#diagnostic-result').value='leak_confirmed'; document.querySelector('#diagnostic-result').dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`document.querySelector('.plan-card.recommended h3').textContent !== ${JSON.stringify(initialChoice)}`, 'confirmed evidence changes decision');
  await evaluate(`document.querySelector('#stock-input').value=0; document.querySelector('#stock-input').dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`document.querySelector('[data-action="review-plan"][data-id="targeted"]') === null`, 'inventory blocks repair');
  await evaluate(`document.querySelector('#stock-input').value=15; document.querySelector('#stock-input').dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`document.querySelector('[data-action="review-plan"][data-id="targeted"]') !== null`, 'inventory restores eligibility');
  await screenshot('03-active-diagnosis.png');
  await evaluate(`location.hash = 'overview'`);
  await until(`document.querySelector('[data-action="investigate"]') !== null`, 'overview with confirmed case');
  await click('[data-action="investigate"]');
  await until(`document.querySelector('.insight-result') !== null`, 'completed investigation');
  await screenshot('04-investigation.png');
  await click('.intelligence-actions [data-action="futures"]');
  await until(`document.querySelector('#delay-slider') !== null`, 'counterfactual lab');
  const before = await evaluate(`document.querySelector('.plan-cost').textContent`);
  await evaluate(`document.querySelector('#delay-slider').value = 10; document.querySelector('#delay-slider').dispatchEvent(new Event('input', {bubbles:true}));`);
  await until(`document.querySelector('.plan-cost').textContent !== ${JSON.stringify(before)}`, 'counterfactual recalculation');
  await screenshot('05-counterfactual-lab.png');
  await click('[data-action="review-plan"]');
  await until(`document.querySelector('#approval-form') !== null`, 'human review gate');
  await evaluate(`document.querySelector('#reviewer').value='Demo Reviewer'; document.querySelectorAll('.review-checks input').forEach(input=>input.checked=true); document.querySelector('#approval-form').requestSubmit();`);
  await until(`document.querySelector('.receipt-modal') !== null`, 'approval receipt');
  assert.match(await evaluate(`document.querySelector('.receipt-modal').textContent`), /No ERP call/);
  await screenshot('06-human-approved.png');
  await click('[data-action="go-orders"]');
  await until(`document.querySelector('tbody tr') !== null`, 'persisted work order');
  await evaluate(`location.hash = 'audit'`);
  await until(`document.querySelector('.audit-row') !== null`, 'audit trail');
  assert.match(await evaluate(`document.querySelector('main').textContent`), /Hash chain verified/);
  await evaluate(`location.hash = 'overview'`);
  await until(`document.querySelector('#factory-canvas') !== null`, 'overview');
  await click('[data-action="scenario"]');
  await click('[data-action="select-scenario"][data-id="thermal"]');
  await until(`document.querySelector('.signal-reading').textContent.includes('78')`, 'thermal scenario');
  await click('[data-action="scenario"]');
  await click('[data-action="select-scenario"][data-id="energy"]');
  await until(`document.querySelector('.signal-reading').textContent.includes('86')`, 'energy scenario');
  await evaluate(`location.hash = 'settings'`);
  await until(`document.querySelector('.mode-options') !== null`, 'settings');
  await click('[data-action="mode"][data-value="live"]');
  await evaluate(`location.hash = 'overview'`);
  await until(`document.querySelector('[data-action="investigate"]') !== null`, 'overview');
  await click('[data-action="investigate"]');
  await until(`document.querySelector('.inline-error') !== null`, 'honest missing-provider failure');
  assert.equal(await evaluate(`document.querySelector('.insight-result') === null`), true);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`location.hash = 'overview'`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile overflow');
  await screenshot('07-mobile.png');
  await evaluate(`location.hash = 'futures'`);
  await until(`document.querySelector('.plan-grid') !== null`, 'mobile lab');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile lab overflow');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Browser smoke passed: desktop/mobile, evidence studio, active diagnosis, inventory veto, 3 scenarios, recalculation, investigation, approval, persistence, audit, provider failure.');
  console.log(`Screenshots: ${output}`);
} finally {
  store.close();
  chrome.kill('SIGTERM');
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1000).unref();
}
