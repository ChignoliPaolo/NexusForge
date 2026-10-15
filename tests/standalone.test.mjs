import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { projectRoot } from '../server/config.mjs';

const body = path => readFileSync(resolve(projectRoot, path), 'utf8').replace(/^import .+;\r?\n/gm, '').replace(/^export /gm, '');

test('standalone uses the same engine and approval service with a verifiable audit', async () => {
  const storage = new Map();
  const context = createContext({ crypto: webcrypto, TextEncoder, Response, performance, structuredClone, setTimeout: () => {}, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  runInContext(['const randomUUID = () => crypto.randomUUID();', ...['server/scenarios.mjs', 'server/engine.mjs', 'server/evidence.mjs', 'server/samples.mjs', 'server/decision.mjs', 'server/evaluation.mjs', 'server/service.mjs', 'frontend/standalone.js'].map(body)].join('\n'), context);
  const bootstrap = await (await context.fetch('/api/bootstrap')).json();
  assert.equal(bootstrap.scenarios.length, 3);
  const investigation = await (await context.fetch('/api/investigations', { body: JSON.stringify({ scenarioId: 'pressure' }) })).json();
  const order = await (await context.fetch('/api/approve', { body: JSON.stringify({ investigationId: investigation.id, planId: 'targeted', reviewer: 'Standalone Tester', checks: [true, true, true] }) })).json();
  assert.equal(order.status, 'demo_approved');
  const audit = await (await context.fetch('/api/audit')).json();
  assert.equal(audit.integrity.valid, true);
  assert.equal(audit.events.length, 2);
  assert.ok(storage.get('nexusforge-standalone-v3').includes(order.id));
  const live = await context.fetch('/api/investigations', { body: JSON.stringify({ scenarioId: 'pressure', mode: 'live' }) });
  assert.equal(live.status, 503);
  assert.match((await live.json()).error, /offline-only/);
  const sample = bootstrap.sampleCases.find(item => item.id === 'pressure-leak');
  const evidence = await (await context.fetch('/api/cases', { body: JSON.stringify({ name: 'Offline upload', csv: sample.csv, document: sample.document, provenance: 'synthetic' }) })).json();
  const simulateCase = async constraints => (await context.fetch('/api/simulate', { body: JSON.stringify({ caseId: evidence.id, constraints }) })).json();
  assert.equal((await simulateCase({})).recommendedId, 'inspect');
  assert.equal((await simulateCase({ testResult: 'leak_confirmed' })).recommendedId, 'targeted');
  assert.equal((await simulateCase({ testResult: 'leak_confirmed', stock: 0 })).recommendedId, 'inspect');
  const evaluation = await (await context.fetch('/api/evaluation')).json();
  assert.equal(evaluation.passed, evaluation.total);
});
