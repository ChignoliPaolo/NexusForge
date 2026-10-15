import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.mjs';
import { createService } from '../server/service.mjs';
import { localAssessment } from '../server/engine.mjs';

function fixture(context, overrides = {}) {
  const store = createStore(':memory:');
  context.after(() => store.close());
  let dispatches = 0;
  const integrations = {
    knowledge: async () => [{ id: 'LIVE-1', title: 'Mock source', text: 'Test fixture', source: 'Mock provider', section: 'test' }],
    extract: async scenario => ({ scenarioId: scenario.id, assetId: scenario.assetId, summary: 'Mock provider' }),
    assess: async scenario => ({ ...localAssessment(scenario), provider: 'Mock provider', model: 'mock-model' }),
    dispatch: async () => { dispatches++; return { id: 'mock-run' }; }, ...overrides
  };
  return { store, service: createService(store, integrations), dispatches: () => dispatches };
}

const approve = investigation => ({ investigationId: investigation.id, planId: 'targeted', reviewer: 'Test Operator', checks: [true, true, true] });

test('demo never calls a provider and records truthful provenance', async context => {
  const reject = () => { throw new Error('Provider should not be called'); };
  const { service, store } = fixture(context, { knowledge: reject, extract: reject, assess: reject, dispatch: reject });
  const investigation = await service.investigate({ scenarioId: 'pressure' });
  assert.equal(investigation.assessment.model, null);
  assert.equal(investigation.assessment.usage, null);
  assert.ok(investigation.blocks.every(block => block.status === 'demo'));
  const order = await service.approve(approve(investigation));
  assert.equal(order.status, 'demo_approved');
  assert.equal(store.orders().length, 1);
  assert.equal(store.verifyAudit().valid, true);
});

test('human gate rejects blank names, unreviewed checks, fabricated plans, and missing investigations', async context => {
  const { service } = fixture(context);
  const investigation = await service.investigate({ scenarioId: 'pressure' });
  const base = approve(investigation);
  for (const change of [{ reviewer: ' ' }, { checks: [true, false, true] }, { checks: [true] }, { checks: ['true', true, true] }, { planId: 'invented' }, { investigationId: 'missing' }, { investigationId: [] }]) await assert.rejects(service.approve({ ...base, ...change }));
});

test('repeated approval returns the same order, never another dispatch', async context => {
  const { service, store, dispatches } = fixture(context);
  const investigation = await service.investigate({ scenarioId: 'energy', mode: 'live' });
  const first = await service.approve(approve(investigation));
  const second = await service.approve(approve(investigation));
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'submitted');
  assert.equal(dispatches(), 1);
  assert.equal(store.orders().length, 1);
  await assert.rejects(service.approve({ ...approve(investigation), planId: 'inspect' }), /different approved plan/);
});

test('concurrent approvals make at most one external request', async context => {
  let calls = 0;
  const { service } = fixture(context, { dispatch: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { id: 'run' }; } });
  const investigation = await service.investigate({ scenarioId: 'pressure', mode: 'live' });
  const results = await Promise.all([service.approve(approve(investigation)), service.approve(approve(investigation))]);
  assert.equal(calls, 1);
  assert.equal(results[0].id, results[1].id);
});

test('provider failures remain unconfirmed and retries do not duplicate side effects', async context => {
  let calls = 0;
  const { service, store } = fixture(context, { dispatch: async () => { calls++; throw new Error('Timed out'); } });
  const investigation = await service.investigate({ scenarioId: 'thermal', mode: 'live' });
  const first = await service.approve(approve(investigation));
  assert.equal(first.status, 'dispatch_unconfirmed');
  assert.equal(first.error, 'Timed out');
  await service.approve(approve(investigation));
  assert.equal(calls, 1);
  assert.equal(store.verifyAudit().valid, true);
});

test('missing Evolus sources never masquerade as successful calls; live dispatch is blocked', async context => {
  const { service } = fixture(context, { knowledge: async () => { throw new Error('Not configured'); } });
  const investigation = await service.investigate({ scenarioId: 'pressure', mode: 'live' });
  assert.equal(investigation.blocks[0].status, 'unavailable');
  await assert.rejects(service.approve(approve(investigation)), /dispatch is blocked/);
});

test('live model failure does not produce a fake successful investigation', async context => {
  const { service, store } = fixture(context, { assess: async () => { throw new Error('Unavailable'); } });
  await assert.rejects(service.investigate({ scenarioId: 'pressure', mode: 'live' }), /Unavailable/);
  assert.equal(store.investigations().length, 0);
  assert.equal(store.auditLog().length, 0);
});

test('invalid modes and overlong notes are rejected', async context => {
  const { service } = fixture(context);
  await assert.rejects(service.investigate({ scenarioId: 'pressure', mode: 'other' }));
  await assert.rejects(service.investigate({ scenarioId: 'pressure', note: 'a'.repeat(2001) }));
});
