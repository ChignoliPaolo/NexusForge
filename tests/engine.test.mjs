import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, normalizeAssumptions } from '../server/engine.mjs';
import { scenarios, getScenario } from '../server/scenarios.mjs';

for (const scenario of scenarios) {
  test(`${scenario.name}: ranks valid plans and reconciles every euro`, () => {
    const result = simulate(scenario.id);
    assert.equal(result.plans.length, 3);
    assert.equal(result.recommendedId, result.plans[0].id);
    assert.equal(result.plans[0].id, 'targeted');
    const baseline = result.plans.find(plan => plan.id === result.baselineId);
    assert.equal(baseline.savings, 0);
    for (const plan of result.plans) {
      const total = Object.values(plan.breakdown).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(total - plan.cost) < 0.011);
      assert.ok(Math.abs(plan.savings - (baseline.cost - plan.cost)) < 0.011);
      assert.ok(plan.range[0] <= plan.cost && plan.range[1] >= plan.cost);
      assert.equal(plan.lostUnits, Math.ceil(plan.downtime * result.assumptions.unitsPerMinute));
    }
    assert.match(result.provenance, /synthetic/);
  });
  test(`${scenario.name}: waiting and higher downtime costs cannot lower a fixed plan's cost`, () => {
    const early = simulate(scenario.id);
    const late = simulate(scenario.id, { delay: 120, downtimeRate: 100 });
    for (const plan of early.plans) {
      const delayed = late.plans.find(candidate => candidate.id === plan.id);
      assert.ok(delayed.cost > plan.cost);
      assert.ok(delayed.risk >= plan.risk);
    }
  });
}

test('simulation is deterministic and does not mutate fixtures', () => {
  const before = JSON.stringify(scenarios);
  assert.deepEqual(simulate('pressure'), simulate('pressure'));
  const scenario = getScenario('pressure');
  scenario.plans[0].parts = 50000;
  assert.equal(JSON.stringify(scenarios), before);
});

test('rejects unknown scenarios rather than diagnosing an arbitrary default', () => {
  assert.throws(() => simulate('unknown'), /Unknown scenario/);
});

test('validates every assumption including types and nonfinite values', () => {
  for (const input of [{ delay: -1 }, { delay: 121 }, { downtimeRate: '48' }, { energyRate: NaN }, { riskWeight: Infinity }, { madeUp: 5 }, null, []]) assert.throws(() => normalizeAssumptions(input));
});

test('all scenario sources explicitly disclose their synthetic provenance', () => {
  for (const scenario of scenarios) {
    assert.equal(new Set(scenario.evidence.map(source => source.id)).size, scenario.evidence.length);
    assert.ok(scenario.evidence.every(source => /synthetic|demo/i.test(source.source)));
    assert.ok(scenario.plans.every(plan => plan.checks.length === 3));
  }
});
