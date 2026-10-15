import { getSample, generatedCsv, syntheticManual } from './samples.mjs';
import { ingestEvidence } from './evidence.mjs';
import { simulateEvidence } from './decision.mjs';

export function runEvaluation() {
  const start = performance.now();
  const checks = [];
  const check = (name, category, passed, detail) => checks.push({ name, category, passed: Boolean(passed), detail });
  const cases = [
    { id: 'pressure-leak', result: 'unmeasured', expected: 'inspect', label: 'Unverified leak must ask for evidence' },
    { id: 'pressure-leak', result: 'leak_confirmed', expected: 'targeted', label: 'Confirmed leak permits available targeted intervention' },
    { id: 'pressure-no-stock', result: 'leak_confirmed', expected: 'inspect', label: 'No stock must change the action' },
    { id: 'pressure-contradiction', result: 'unmeasured', expected: 'inspect', label: 'Contradictory readings must not trigger repair' },
    { id: 'drive-fault', result: 'drive_confirmed', expected: 'replace', label: 'Confirmed independent drive fault changes the diagnosis and plan', deadline: 300 },
    { id: 'thermal-drift', result: 'cooling_confirmed', expected: 'targeted', label: 'Cooling confirmation permits containment plan' },
    { id: 'energy-overlap', result: 'overlap_confirmed', expected: 'targeted', label: 'Scheduling evidence permits controls-reviewed intervention' },
    { id: 'safety-hold', result: 'cooling_confirmed', expected: 'inspect', label: 'Safety hold overrides even a confirmed fault' },
    { id: 'nominal', result: 'unmeasured', expected: 'inspect', label: 'Nominal readings must not invent a fault' }
  ];
  for (const item of cases) {
    const result = simulateEvidence(getSample(item.id), {}, { testResult: item.result, ...(item.deadline ? { deadlineMinutes: item.deadline } : {}) });
    check(item.label, 'decision contract', result.recommendedId === item.expected, { expected: item.expected, actual: result.recommendedId });
    check(`${item.id}: no blocked plan ranked first`, 'constraint safety', result.plans[0].feasible, { blockedPlans: result.plans.filter(plan => !plan.feasible).map(plan => plan.id) });
  }
  for (let seed = 1; seed <= 12; seed++) {
    const evidence = ingestEvidence({ csv: generatedCsv({ pressure_bar: 3.6 + seed * 0.025, torque_pct: 139 + seed }, seed * 13), document: syntheticManual, name: `Seeded perturbation ${seed}`, provenance: 'synthetic', scenarioId: 'pressure' });
    const unconfirmed = simulateEvidence(evidence, {}, {});
    const confirmed = simulateEvidence(evidence, {}, { testResult: 'leak_confirmed' });
    const blocked = simulateEvidence(evidence, {}, { testResult: 'leak_confirmed', stock: 0 });
    check(`Seed ${seed}: observation changes the action`, 'seeded perturbation', unconfirmed.recommendedId === 'inspect' && confirmed.recommendedId === 'targeted', { before: unconfirmed.recommendedId, after: confirmed.recommendedId });
    check(`Seed ${seed}: stock overrides the model`, 'seeded perturbation', blocked.recommendedId === 'inspect', { actual: blocked.recommendedId });
  }
  const confirmed = simulateEvidence(getSample('pressure-leak'), {}, { testResult: 'leak_confirmed' });
  const delayed = simulateEvidence(getSample('pressure-leak'), { delay: 60 }, { testResult: 'leak_confirmed' });
  check('Intervention delay cannot lower a fixed plan cost', 'numerical consistency', confirmed.plans.every(plan => delayed.plans.find(candidate => candidate.id === plan.id).cost >= plan.cost), {});
  check('Every cost reconciles to its components', 'numerical consistency', confirmed.plans.every(plan => Math.abs(Object.values(plan.breakdown).reduce((sum, value) => sum + value, 0) - plan.cost) < 0.011), {});
  return { generatedAt: new Date().toISOString(), suite: 'Synthetic decision-contract evaluation v3', checks, total: checks.length, passed: checks.filter(item => item.passed).length, elapsedMs: Math.round((performance.now() - start) * 100) / 100, disclosure: 'Synthetic authored cases and seeded perturbations. This evaluates declared decision contracts, not field accuracy or AMD model quality. Fixture design and solver share engineering assumptions; this is not an independent scientific benchmark.', liveModelEvaluated: false };
}
