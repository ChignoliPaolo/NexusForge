import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../server/index.mjs';
import { readConfig } from '../server/config.mjs';
import { getSample } from '../server/samples.mjs';

export function requestApp(server, path, { method = 'GET', body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const request = Readable.from([Buffer.from(raw ?? (body === undefined ? '' : JSON.stringify(body)))]);
    Object.assign(request, { method, url: path, headers: { host: 'localhost:8000', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const response = { headersSent: false, writeHead(status, values) { this.status = status; this.headers = values; this.headersSent = true; }, end(value) { resolve({ status: this.status, headers: this.headers, text: String(value), json: () => JSON.parse(String(value)) }); } };
    request.on('error', reject);
    server.emit('request', request, response);
  });
}

function fixture(context) {
  const config = readConfig({ NEXUS_DB_PATH: ':memory:' });
  const app = createApp(config);
  context.after(() => app.store.close());
  return app;
}

test('health and bootstrap endpoints disclose demo mode without exposing configuration secrets', async context => {
  const { server } = fixture(context);
  const health = await requestApp(server, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json().mode, 'demo-first');
  const bootstrap = await requestApp(server, '/api/bootstrap');
  assert.equal(bootstrap.json().scenarios.length, 3);
  assert.match(bootstrap.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('private files and traversal are not served', async context => {
  const { server } = fixture(context);
  for (const path of ['/.env', '/server/config.mjs', '/runtime/nexus.sqlite', '/../../.env', '/api/unknown', '/%2e%2e/.env']) assert.equal((await requestApp(server, path)).status, 404);
});

test('rejects foreign origins, invalid JSON, oversized input and unsupported media types', async context => {
  const { server } = fixture(context);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', body: {}, headers: { origin: 'https://evil.example.test' } })).status, 403);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', raw: '{broken' })).status, 400);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', body: [] })).status, 400);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', raw: 'a'.repeat(262145) })).status, 413);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', body: {}, headers: { 'content-type': 'text/plain' } })).status, 415);
});

test('real application handlers complete investigation, approval, persistence, audit and export', async context => {
  const { server } = fixture(context);
  const investigation = (await requestApp(server, '/api/investigations', { method: 'POST', body: { scenarioId: 'pressure' } })).json();
  assert.equal(investigation.status, 'review_required');
  const approved = await requestApp(server, '/api/approve', { method: 'POST', body: { investigationId: investigation.id, planId: 'targeted', reviewer: 'Test Operator', checks: [true, true, true] } });
  assert.equal(approved.status, 200);
  assert.equal(approved.json().status, 'demo_approved');
  assert.equal((await requestApp(server, '/api/orders')).json().length, 1);
  assert.equal((await requestApp(server, '/api/audit')).json().integrity.valid, true);
  const report = (await requestApp(server, `/api/report/${investigation.id}`)).json();
  assert.equal(report.order.reviewer, 'Test Operator');
  assert.match(report.disclosure, /Synthetic/);
});

test('invalid simulations return a client error without internal stack traces', async context => {
  const { server } = fixture(context);
  const response = await requestApp(server, '/api/simulate', { method: 'POST', body: { scenarioId: 'missing' } });
  assert.equal(response.status, 400);
  assert.ok(!response.text.includes('server/'));
});

test('host validation blocks DNS rebinding and invalid origins fail closed', async context => {
  const { server } = fixture(context);
  assert.equal((await requestApp(server, '/api/bootstrap', { headers: { host: 'untrusted.example.test' } })).status, 403);
  assert.equal((await requestApp(server, '/api/simulate', { method: 'POST', body: {}, headers: { origin: 'null' } })).status, 403);
});

test('uploaded evidence drives diagnosis, constrained actions, approval and provenance export', async context => {
  const { server } = fixture(context);
  const sample = getSample('pressure-leak');
  const evidence = await requestApp(server, '/api/cases', { method: 'POST', body: { name: 'Fresh operator data', csv: sample.csv, document: sample.document, provenance: 'user_supplied' } });
  assert.equal(evidence.status, 201);
  const caseId = evidence.json().id;
  const preview = async constraints => (await requestApp(server, '/api/simulate', { method: 'POST', body: { caseId, constraints } })).json();
  assert.equal((await preview({})).recommendedId, 'inspect');
  assert.equal((await preview({ testResult: 'leak_confirmed' })).recommendedId, 'targeted');
  assert.equal((await preview({ testResult: 'leak_confirmed', stock: 0 })).recommendedId, 'inspect');
  const investigation = (await requestApp(server, '/api/investigations', { method: 'POST', body: { caseId, constraints: { testResult: 'leak_confirmed' } } })).json();
  const approved = await requestApp(server, '/api/approve', { method: 'POST', body: { investigationId: investigation.id, planId: 'targeted', reviewer: 'Evidence Reviewer', checks: [true, true, true] } });
  assert.equal(approved.status, 200);
  const report = (await requestApp(server, `/api/report/${investigation.id}`)).json();
  assert.equal(report.inputEvidence.csv, sample.csv);
  assert.match(report.disclosure, /Operator-supplied/);
  assert.equal(report.auditIntegrity.valid, true);
});
