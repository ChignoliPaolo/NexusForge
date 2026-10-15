import { ingestEvidence } from './evidence.mjs';

export const syntheticManual = `# NexusForge Demonstration Engineering Handbook

PROVENANCE: SYNTHETIC / NOT AN OEM DOCUMENT / NOT FIELD VALIDATED
This authored fixture exists to demonstrate decision support. Never use it as a real equipment procedure.

## Observational model
In this synthetic cell, a pressure decrease accompanied by rising motor torque is consistent with loss of pneumatic support. Leakage and regulator instability compete as explanations. Torque alone does not establish a seal failure. Independent technician observations are required.
Cabinet temperature and rejected output can co-vary under cooling restriction. Either signal alone requires checking material variation or measurement errors.
Power demand and cycle overlap can co-vary under synchronized starts. An unrelated load can produce high demand without cycle overlap.

## Planning record
stock_on_hand: 15
part_lead_minutes: 180
repair_minutes: 28
downtime_eur_per_minute: 48
production_deadline_minutes: 90

## Review policy
All equipment work requires qualified personnel and plant-specific isolation procedures. This handbook deliberately provides no operational isolation or repair instructions. Preserve existing interlocks. High or contradictory readings require escalation, not a confident automated repair.

## Commercial assumptions
Parts, durations, risk weights, and costs are illustrative. A projected cost difference is not realized savings. A recorded acknowledgement is not verified production authorization.
The single inventory field models availability for the intervention under consideration, not a real multi-SKU warehouse. Zero stock blocks all part-consuming alternatives; a stated lead time is not proof of delivery.
`;

export function generatedCsv(end = {}, seed = 7, rows = 24) {
  const baseline = { pressure_bar: 6.2, torque_pct: 100, temperature_c: 43, reject_pct: 0.8, power_kw: 42.6, overlap_pct: 18 };
  const fields = Object.keys(baseline);
  const output = ['timestamp,' + fields.join(',')];
  let randomState = seed >>> 0;
  const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 4294967296; };
  for (let index = 0; index < rows; index++) {
    const fraction = index / (rows - 1);
    const timestamp = new Date(Date.UTC(2026, 9, 17, 12, 42, index * 5)).toISOString();
    const values = fields.map(field => {
      const destination = end[field] ?? baseline[field];
      const noise = index === 0 || index === rows - 1 ? 0 : (random() - 0.5) * (field === 'pressure_bar' || field === 'reject_pct' ? 0.08 : 0.8);
      return Math.max(0, baseline[field] + (destination - baseline[field]) * fraction + noise).toFixed(3);
    });
    output.push([timestamp, ...values].join(','));
  }
  return output.join('\n');
}

const definitions = [
  { id: 'pressure-leak', name: 'The €18.50 question', scenarioId: 'pressure', description: 'Pressure falls. Torque rises. Leakage or regulation? Ask for one discriminating observation.', end: { pressure_bar: 3.8, torque_pct: 142 } },
  { id: 'pressure-no-stock', name: 'Right diagnosis. Wrong inventory.', scenarioId: 'pressure', description: 'Same readings, no replacement seal. A recommendation must respect physical availability.', end: { pressure_bar: 3.8, torque_pct: 142 }, stock: 0 },
  { id: 'pressure-contradiction', name: 'The signal that does not fit', scenarioId: 'pressure', description: 'The pressure reading falls, but torque stays normal. Refuse the tempting seal-repair story.', end: { pressure_bar: 3.6, torque_pct: 101 } },
  { id: 'drive-fault', name: 'This time, it is not the seal', scenarioId: 'pressure', description: 'Torque rises while pressure stays healthy. A different input must produce a different hypothesis.', end: { pressure_bar: 6.1, torque_pct: 172 } },
  { id: 'thermal-drift', name: 'The batch you should not release', scenarioId: 'thermal', description: 'Temperature and rejected output rise together. Contain uncertainty before committing.', end: { temperature_c: 78, reject_pct: 6.8 }, repair: 35 },
  { id: 'energy-overlap', name: 'Change the rhythm, not the machine', scenarioId: 'energy', description: 'Power peaks coincide with start-cycle overlap. Evaluate a controls-reviewed schedule.', end: { power_kw: 86, overlap_pct: 83 }, repair: 8 },
  { id: 'safety-hold', name: 'The system knows when to stop', scenarioId: 'thermal', description: 'A high temperature reading activates the independent escalation policy.', end: { temperature_c: 108, reject_pct: 12 }, repair: 35 },
  { id: 'nominal', name: 'No fault is also an answer', scenarioId: 'pressure', description: 'Healthy readings should not manufacture a profitable-looking repair.', end: {} }
];

export const sampleCases = definitions.map((definition, index) => {
  const document = syntheticManual.replace('stock_on_hand: 15', `stock_on_hand: ${definition.stock ?? 15}`).replace('repair_minutes: 28', `repair_minutes: ${definition.repair ?? 28}`);
  return { ...ingestEvidence({ csv: generatedCsv(definition.end, index + 7), document, name: definition.name, provenance: 'synthetic', scenarioId: definition.scenarioId }), id: definition.id, description: definition.description };
});

export function getSample(id) {
  const sample = sampleCases.find(candidate => candidate.id === id);
  return sample ? structuredClone(sample) : null;
}

export const defaultCaseIds = { pressure: 'pressure-leak', thermal: 'thermal-drift', energy: 'energy-overlap' };
