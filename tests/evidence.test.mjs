import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, extractPlanningFields, ingestEvidence, diagnosticReasoning } from '../server/evidence.mjs';
import { sampleCases, getSample, generatedCsv, syntheticManual } from '../server/samples.mjs';
import { simulateEvidence } from '../server/decision.mjs';
import { runEvaluation } from '../server/evaluation.mjs';
import { createStore } from '../server/store.mjs';
import { createService } from '../server/service.mjs';
import { localAssessment } from '../server/engine.mjs';

test('CSV parser accepts CRLF, BOM, quoted headers and validates numeric observations', () => {
  const source = '\uFEFF' + generatedCsv({ pressure_bar: 3.8, torque_pct: 142 }).replace('timestamp', '"timestamp"').replaceAll('\n', '\r\n');
  const parsed = parseCsv(source);
  assert.equal(parsed.rowCount, 24);
  assert.equal(parsed.stats.pressure_bar.last, 3.8);
  assert.equal(parsed.stats.torque_pct.last, 142);
});

test('malformed, missing, nonfinite and out-of-range evidence is rejected', () => {
  const source = generatedCsv({ pressure_bar: 3.8, torque_pct: 142 });
  for (const bad of ['', source.replace('pressure_bar', 'timestamp'), source.replace('6.200', '999'), source.replace('6.200', ''), source.replace('6.200', 'NaN'), source.replace('pressure_bar', '"pressure_bar')]) assert.throws(() => parseCsv(bad));
  assert.throws(() => parseCsv(source.replace('2026-10-17T12:42:05.000Z', '2026-10-17T12:42:00.000Z')), /increasing/);
});

test('document extraction retains exact line provenance and rejects duplicates', () => {
  const result = extractPlanningFields(syntheticManual);
  assert.equal(result.fields.stock_on_hand, 15);
  assert.ok(result.references.every(reference => syntheticManual.split('\n')[reference.line - 1] === reference.excerpt));
  assert.throws(() => extractPlanningFields(syntheticManual + '\nstock_on_hand: 2'), /duplicate/);
  assert.throws(() => extractPlanningFields('repair_minutes: 0'), /invalid/);
});

test('fresh observations, not case names, select the evidence family', () => {
  const evidence = ingestEvidence({ name: 'Definitely a pressure failure', csv: generatedCsv({ temperature_c: 82, reject_pct: 8 }), document: syntheticManual });
  assert.equal(evidence.scenarioId, 'thermal');
});

test('active diagnosis chooses a discriminating observation and updates hypothesis support', () => {
  const evidence = getSample('pressure-leak');
  const before = diagnosticReasoning(evidence);
  const after = diagnosticReasoning(evidence, 'leak_confirmed');
  assert.equal(before.nextObservation.id, 'leak');
  assert.ok(before.nextObservation.informationGainBits > 0);
  assert.ok(after.hypotheses.find(item => item.id === 'seal').weight > before.hypotheses.find(item => item.id === 'seal').weight);
  assert.throws(() => diagnosticReasoning(evidence, 'cooling_confirmed'), /not valid/);
});

test('stock, deadlines, contradiction and safety holds affect feasibility independently of model text', () => {
  const evidence = getSample('pressure-leak');
  assert.equal(simulateEvidence(evidence, {}, { testResult: 'leak_confirmed' }).recommendedId, 'targeted');
  assert.equal(simulateEvidence(evidence, {}, { testResult: 'leak_confirmed', stock: 0 }).recommendedId, 'inspect');
  assert.equal(simulateEvidence(evidence, {}, { testResult: 'leak_confirmed', deadlineMinutes: 10 }).recommendedId, 'inspect');
  const delayed = simulateEvidence(evidence, { delay: 60 }, { testResult: 'leak_confirmed', deadlineMinutes: 90 });
  assert.equal(delayed.recommendedId, 'inspect');
  assert.match(delayed.plans.find(plan => plan.id === 'targeted').blockedReasons.join(' '), /Delay-adjusted/);
  assert.equal(simulateEvidence(getSample('safety-hold'), {}, { testResult: 'cooling_confirmed' }).recommendedId, 'inspect');
  assert.equal(simulateEvidence(getSample('pressure-contradiction'), {}, { testResult: 'leak_confirmed' }).recommendedId, 'inspect');
  assert.equal(simulateEvidence(getSample('drive-fault'), {}, { testResult: 'drive_confirmed', deadlineMinutes: 300, stock: 0 }).recommendedId, 'inspect');
});

test('diagnosis is not falsely represented as production restoration or realized savings', () => {
  const result = simulateEvidence(getSample('pressure-leak'));
  const plan = result.plans[0];
  assert.equal(plan.outcome, 'diagnostic');
  assert.equal(plan.savings, null);
  assert.equal(plan.minutesSaved, null);
});

test('validated extraction reaches the solver and the main agent', async context => {
  const store = createStore(':memory:'); context.after(() => store.close());
  let inputSeen;
  const integrations = {
    knowledge: async () => [],
    extract: async scenario => ({ scenarioId: scenario.id, assetId: scenario.assetId, summary: 'Verified extraction', planningFields: scenario.planningFields }),
    assess: async (scenario, simulation) => { inputSeen = { scenario, simulation }; return { ...localAssessment(scenario), recommendedPlanId: simulation.recommendedId }; },
    dispatch: async () => ({ id: 'test' })
  };
  const service = createService(store, integrations);
  const result = await service.investigate({ caseId: 'pressure-leak', mode: 'live', constraints: { testResult: 'leak_confirmed' } });
  assert.equal(result.simulation.planningSource, 'Validated Evolus extraction');
  assert.equal(inputSeen.scenario.extractedIncident.summary, 'Verified extraction');
  assert.equal(inputSeen.simulation.constraints.stock, 15);
});

test('fresh uploaded cases persist and infeasible actions cannot be approved', async context => {
  const store = createStore(':memory:'); context.after(() => store.close());
  const service = createService(store, {});
  const sample = getSample('pressure-no-stock');
  const evidence = service.intake({ csv: sample.csv, document: sample.document, name: 'Test upload', provenance: 'synthetic' });
  assert.equal(store.case(evidence.id).name, 'Test upload');
  const investigation = await service.investigate({ caseId: evidence.id, constraints: { testResult: 'leak_confirmed' } });
  await assert.rejects(service.approve({ investigationId: investigation.id, planId: 'targeted', reviewer: 'Test Reviewer', checks: [true, true, true] }), /blocked/);
});

test('all reproducible decision-contract evaluations pass and disclose their limits', () => {
  const report = runEvaluation();
  assert.equal(report.passed, report.total, JSON.stringify(report.checks.filter(item => !item.passed)));
  assert.equal(report.total, 44);
  assert.equal(report.liveModelEvaluated, false);
  assert.equal(sampleCases.length, 8);
});
