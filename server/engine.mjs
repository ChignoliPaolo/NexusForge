import { getScenario } from './scenarios.mjs';

export const defaultAssumptions = { downtimeRate: 48, delay: 0, unitsPerMinute: 8, scrapUnitCost: 12, energyRate: 0.28, riskWeight: 2000 };

export function normalizeAssumptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Assumptions must be an object.'), { status: 400 });
  const limits = { downtimeRate: [5, 250], delay: [0, 120], unitsPerMinute: [1, 100], scrapUnitCost: [0, 500], energyRate: [0.01, 5], riskWeight: [0, 20000] };
  const normalized = { ...defaultAssumptions };
  for (const [key, value] of Object.entries(input)) {
    if (!limits[key] || typeof value !== 'number' || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]) {
      throw Object.assign(new Error(`Invalid assumption: ${key}.`), { status: 400 });
    }
    normalized[key] = value;
  }
  return normalized;
}

const rounded = value => Math.round(value * 100) / 100;

export function simulate(scenarioId, input = {}, preparedScenario = null) {
  const scenario = preparedScenario || getScenario(scenarioId);
  const assumptions = normalizeAssumptions(input);
  const plans = scenario.plans.map(plan => {
    const delayMinutes = assumptions.delay * (plan.id === 'targeted' ? 1.35 : 1);
    const downtime = rounded(plan.minutes + delayMinutes);
    const blockedReasons = [...(plan.blockedReasons || [])];
    const deadline = scenario.decisionContext?.constraints.deadlineMinutes;
    if (plan.outcome === 'restorative' && deadline && downtime > deadline && plan.minutes <= deadline) blockedReasons.push(`Delay-adjusted interruption exceeds the ${deadline}-minute production constraint.`);
    const lostUnits = Math.ceil(downtime * assumptions.unitsPerMinute);
    const breakdown = {
      downtime: rounded(downtime * assumptions.downtimeRate), parts: plan.parts, labor: plan.labor,
      scrap: rounded((plan.scrap + Math.floor(assumptions.delay * 0.3)) * assumptions.scrapUnitCost),
      energy: rounded(plan.energy * assumptions.energyRate)
    };
    const cost = rounded(Object.values(breakdown).reduce((sum, amount) => sum + amount, 0));
    const risk = rounded(Math.min(0.95, plan.risk + assumptions.delay * 0.002));
    const score = rounded(cost + risk * assumptions.riskWeight);
    const uncertainty = rounded(cost * (0.12 + risk * 0.2));
    return { ...plan, blockedReasons, feasible: plan.feasible !== false && blockedReasons.length === 0, downtime, lostUnits, breakdown, cost, risk, score, range: [rounded(Math.max(0, cost - uncertainty)), rounded(cost + uncertainty)] };
  }).sort((first, second) => Number(second.feasible !== false) - Number(first.feasible !== false) || (second.goalTier || 0) - (first.goalTier || 0) || first.score - second.score);
  const baseline = plans.find(plan => plan.id === scenario.baseline);
  for (const plan of plans) {
    plan.savings = rounded(baseline.cost - plan.cost);
    plan.minutesSaved = rounded(baseline.downtime - plan.downtime);
    plan.unitsProtected = baseline.lostUnits - plan.lostUnits;
    if (plan.outcome === 'diagnostic') {
      plan.savings = null;
      plan.minutesSaved = null;
      plan.unitsProtected = null;
      plan.costScope = 'Diagnostic stage only; restoration cost and downtime remain unknown.';
    }
  }
  return {
    scenarioId, assumptions, plans, recommendedId: plans[0].id, baselineId: baseline.id,
    provenance: 'Deterministic simulation on synthetic inputs; not a validated digital twin or a forecast.',
    formula: 'Cost = downtime × €/min + parts + labor + scrap × €/unit + incremental kWh × €/kWh. Apply feasibility and restoration-vs-diagnosis goal priority first, then rank comparable outcomes by cost + assumed risk × risk weight.',
    uncertaintyNote: 'Illustrative sensitivity band, not a calibrated confidence interval.',
    horizonMinutes: 300
  };
}

export function localAssessment(scenario) {
  return {
    hypothesis: scenario.hypothesis,
    rationale: 'The lowest modeled risk-adjusted cost comes from checking the upstream cause rather than replacing the alarmed downstream component.',
    uncertainty: scenario.uncertainty,
    evidenceIds: scenario.evidence.map(item => item.id),
    recommendedPlanId: 'targeted',
    provider: 'Local deterministic demo', model: null, usage: null, latencyMs: null
  };
}
