const evidenceError = message => { throw Object.assign(new Error(message), { status: 400 }); };
const bounded = (value, lower = 0, upper = 1) => Math.max(lower, Math.min(upper, value));
const average = values => values.reduce((total, value) => total + value, 0) / values.length;

export const measurementSpecs = {
  pressure_bar: { label: 'Manifold pressure', unit: 'bar', range: [0, 16] },
  torque_pct: { label: 'Axis torque', unit: '%', range: [0, 300] },
  temperature_c: { label: 'Cabinet temperature', unit: '°C', range: [-20, 160] },
  reject_pct: { label: 'Rejected output', unit: '%', range: [0, 100] },
  power_kw: { label: 'Electrical demand', unit: 'kW', range: [0, 500] },
  overlap_pct: { label: 'Start-cycle overlap', unit: '%', range: [0, 100] }
};

export function parseCsv(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 180000) evidenceError('Supply a nonempty CSV smaller than 180 KB.');
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (!quoted && field.trim()) evidenceError('CSV contains a misplaced quote.');
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field.trim()); if (row.some(value => value !== '')) rows.push(row); row = []; field = '';
    } else field += character;
  }
  if (quoted) evidenceError('CSV contains an unterminated quoted field.');
  row.push(field.trim()); if (row.some(value => value !== '')) rows.push(row);
  if (rows.length < 6 || rows.length > 2501) evidenceError('CSV must contain a header and 5–2500 observations.');
  const headers = rows.shift().map(value => value.toLowerCase());
  if (headers.length > 16 || new Set(headers).size !== headers.length) evidenceError('CSV headers must be unique, with at most 16 columns.');
  if (!headers.includes('timestamp')) evidenceError('CSV needs a timestamp column containing ISO timestamps.');
  const metrics = headers.filter(header => measurementSpecs[header]);
  if (metrics.length < 2) evidenceError('CSV needs at least two supported measurement columns.');
  let previous = -Infinity;
  const records = rows.map((values, index) => {
    if (values.length !== headers.length) evidenceError(`CSV row ${index + 2} has the wrong number of fields.`);
    const record = Object.fromEntries(headers.map((header, position) => [header, values[position]]));
    const timestamp = Date.parse(record.timestamp);
    if (!Number.isFinite(timestamp) || !/T/.test(record.timestamp) || timestamp <= previous) evidenceError(`CSV row ${index + 2} needs a strictly increasing ISO timestamp.`);
    previous = timestamp;
    const result = { timestamp: new Date(timestamp).toISOString() };
    for (const metric of metrics) {
      const value = Number(record[metric]);
      const [minimum, maximum] = measurementSpecs[metric].range;
      if (record[metric] === '' || !Number.isFinite(value) || value < minimum || value > maximum) evidenceError(`CSV row ${index + 2}: invalid ${metric}. Expected ${minimum}–${maximum} ${measurementSpecs[metric].unit}.`);
      result[metric] = value;
    }
    return result;
  });
  const stats = Object.fromEntries(metrics.map(metric => {
    const values = records.map(record => record[metric]);
    return [metric, { first: values[0], last: values.at(-1), mean: average(values), minimum: Math.min(...values), maximum: Math.max(...values), change: values.at(-1) - values[0], values }];
  }));
  return { records, stats, rowCount: records.length, durationSeconds: Math.round((previous - Date.parse(records[0].timestamp)) / 1000), metrics };
}

export const planningFieldLimits = {
  stock_on_hand: [0, 999], part_lead_minutes: [0, 1440], repair_minutes: [5, 600],
  downtime_eur_per_minute: [5, 250], production_deadline_minutes: [5, 1440]
};

export function extractPlanningFields(document) {
  if (typeof document !== 'string' || document.length > 30000) evidenceError('Reference text must be smaller than 30 KB.');
  const fields = {}, references = [];
  document.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match || !planningFieldLimits[match[1]]) return;
    const value = Number(match[2]), [minimum, maximum] = planningFieldLimits[match[1]];
    if (value < minimum || value > maximum || (match[1] === 'stock_on_hand' && !Number.isInteger(value))) evidenceError(`Reference line ${index + 1}: invalid ${match[1]}.`);
    if (Object.hasOwn(fields, match[1])) evidenceError(`Reference contains ambiguous duplicate ${match[1]} fields.`);
    fields[match[1]] = value;
    references.push({ field: match[1], value, line: index + 1, excerpt: line.trim() });
  });
  return { fields, references };
}

export function ingestEvidence({ csv, document = '', name = 'Uploaded evidence', provenance = 'user_supplied', scenarioId }) {
  if (typeof name !== 'string' || name.length > 140) evidenceError('Case name must be at most 140 characters.');
  if (!['synthetic', 'user_supplied'].includes(provenance)) evidenceError('Declare synthetic or user_supplied provenance.');
  if (scenarioId && !['pressure', 'thermal', 'energy'].includes(scenarioId)) evidenceError('Unknown evidence family.');
  const telemetry = parseCsv(csv);
  const planning = extractPlanningFields(document);
  const pairAvailable = family => ({ pressure: ['pressure_bar', 'torque_pct'], thermal: ['temperature_c', 'reject_pct'], energy: ['power_kw', 'overlap_pct'] })[family].every(metric => telemetry.stats[metric]);
  const families = [
    ['pressure', (telemetry.stats.pressure_bar ? bounded((6.2 - telemetry.stats.pressure_bar.last) / 2.4) : 0) + (telemetry.stats.torque_pct ? bounded((telemetry.stats.torque_pct.last - 100) / 55) : 0)],
    ['thermal', (telemetry.stats.temperature_c ? bounded((telemetry.stats.temperature_c.last - 55) / 35) : 0) + (telemetry.stats.reject_pct ? bounded((telemetry.stats.reject_pct.last - 1) / 7) : 0)],
    ['energy', (telemetry.stats.power_kw ? bounded((telemetry.stats.power_kw.last - 50) / 50) : 0) + (telemetry.stats.overlap_pct ? bounded((telemetry.stats.overlap_pct.last - 30) / 60) : 0)]
  ].filter(([family]) => pairAvailable(family)).sort((first, second) => second[1] - first[1]);
  if (!families.length || (scenarioId && !pairAvailable(scenarioId))) evidenceError('Supply pressure_bar + torque_pct, temperature_c + reject_pct, or power_kw + overlap_pct for the chosen case.');
  const family = scenarioId || families[0][0];
  return { name: name.trim() || 'Uploaded evidence', provenance, scenarioId: family, csv, document, telemetry, planning, createdAt: new Date().toISOString() };
}

const entropy = weights => weights.reduce((total, weight) => total - (weight > 0 ? weight * Math.log2(weight) : 0), 0);

export function expectedInformationGain(hypotheses, likelihoods) {
  const priors = hypotheses.map(hypothesis => hypothesis.weight);
  const positiveProbability = priors.reduce((sum, prior, index) => sum + prior * likelihoods[index], 0);
  const positive = priors.map((prior, index) => prior * likelihoods[index] / Math.max(positiveProbability, 1e-9));
  const negative = priors.map((prior, index) => prior * (1 - likelihoods[index]) / Math.max(1 - positiveProbability, 1e-9));
  return Math.max(0, entropy(priors) - positiveProbability * entropy(positive) - (1 - positiveProbability) * entropy(negative));
}

export function diagnosticReasoning(evidence, testResult = 'unmeasured') {
  const stats = evidence.telemetry.stats;
  const value = metric => stats[metric]?.last;
  let candidates, tests, support, signalStrength, dataConflict = false;
  if (evidence.scenarioId === 'pressure') {
    const loss = bounded((6.2 - value('pressure_bar')) / 2.4), torque = bounded((value('torque_pct') - 100) / 55);
    signalStrength = Math.max(loss, torque);
    dataConflict = loss > 0.6 && torque < 0.15;
    support = [0.05 + 0.5 * loss + 0.35 * Math.min(loss, torque), 0.05 + 0.48 * loss, 0.05 + 0.85 * torque * (1 - loss), 0.05 + 0.7 * loss * (1 - torque)];
    candidates = [['seal', 'Pneumatic leakage', 'pressure_bar and torque_pct rise/fall together'], ['regulator', 'Regulator instability', 'A supply fault can also lower manifold pressure'], ['drive', 'Independent drive or mechanical fault', 'Elevated torque without pressure loss'], ['sensor', 'Pressure measurement discrepancy', 'Pressure loss without matching torque response']];
    tests = [
      { id: 'leak', name: 'Obtain an independent leak-verification result', positive: 'leak_confirmed', negative: 'pressure_holds', positiveLabel: 'Leak independently confirmed', negativeLabel: 'Pressure holds; leak not found', likelihoods: [0.94, 0.12, 0.05, 0.03] },
      { id: 'drive', name: 'Obtain the technician’s independent drive assessment', positive: 'drive_confirmed', negative: 'drive_cleared', positiveLabel: 'Drive fault independently confirmed', negativeLabel: 'Drive assessment normal', likelihoods: [0.08, 0.08, 0.92, 0.05] }
    ];
  } else if (evidence.scenarioId === 'thermal') {
    const heat = bounded((value('temperature_c') - 55) / 30), defects = bounded((value('reject_pct') - 1) / 6);
    signalStrength = Math.max(heat, defects);
    dataConflict = (heat > 0.65 && defects < 0.1) || (defects > 0.75 && heat < 0.1);
    support = [0.05 + 0.85 * Math.min(heat, defects), 0.05 + 0.9 * heat * (1 - defects), 0.05 + 0.9 * defects * (1 - heat)];
    candidates = [['cooling', 'Cooling restriction', 'Temperature and reject rate rise together'], ['sensor', 'Temperature measurement discrepancy', 'High reported temperature without quality drift'], ['material', 'Incoming-material variation', 'Quality drifts without a thermal explanation']];
    tests = [
      { id: 'cooling', name: 'Obtain a qualified cooling-system inspection result', positive: 'cooling_confirmed', negative: 'cooling_cleared', positiveLabel: 'Cooling restriction confirmed', negativeLabel: 'Cooling inspection normal', likelihoods: [0.94, 0.07, 0.06] },
      { id: 'material', name: 'Obtain an independent material-lot inspection result', positive: 'material_confirmed', negative: 'material_cleared', positiveLabel: 'Material issue confirmed', negativeLabel: 'Material lot accepted', likelihoods: [0.12, 0.08, 0.93] }
    ];
  } else {
    const demand = bounded((value('power_kw') - 50) / 40), overlap = bounded((value('overlap_pct') - 30) / 55);
    signalStrength = demand;
    dataConflict = demand > 0.65 && overlap < 0.15;
    support = [0.05 + 0.9 * Math.min(demand, overlap), 0.05 + 0.85 * demand * (1 - overlap), 0.06 + 0.2 * (1 - demand)];
    candidates = [['scheduling', 'Overlapping start cycles', 'High power coincides with overlapping starts'], ['base_load', 'Unmodeled load or process demand', 'Demand peak without matching cycle overlap'], ['meter', 'Meter or baseline discrepancy', 'The declared power baseline needs verification']];
    tests = [
      { id: 'overlap', name: 'Obtain a controls-engineer review of synchronized starts', positive: 'overlap_confirmed', negative: 'overlap_ruled_out', positiveLabel: 'Overlapping starts confirmed', negativeLabel: 'Overlap ruled out', likelihoods: [0.95, 0.09, 0.06] },
      { id: 'meter', name: 'Obtain an independent power-meter validation', positive: 'meter_fault', negative: 'meter_valid', positiveLabel: 'Meter discrepancy found', negativeLabel: 'Meter independently validated', likelihoods: [0.05, 0.06, 0.92] }
    ];
  }
  if (testResult !== 'unmeasured') {
    const selected = tests.find(test => test.positive === testResult || test.negative === testResult);
    if (!selected) evidenceError('Diagnostic result is not valid for this evidence family.');
    support = support.map((weight, index) => weight * (testResult === selected.positive ? selected.likelihoods[index] : 1 - selected.likelihoods[index]));
  }
  const total = support.reduce((sum, weight) => sum + weight, 0);
  const originalOrder = candidates.map(([id, label, explanation], index) => ({ id, label, explanation, weight: support[index] / total }));
  const observations = tests.filter(test => test.positive !== testResult && test.negative !== testResult).map(test => ({ ...test, informationGainBits: Math.round(expectedInformationGain(originalOrder, test.likelihoods) * 1000) / 1000 })).sort((first, second) => second.informationGainBits - first.informationGainBits);
  const hypotheses = [...originalOrder].sort((first, second) => second.weight - first.weight);
  const disagreement = dataConflict || (signalStrength > 0.3 && ['sensor', 'material', 'base_load', 'meter'].includes(hypotheses[0].id));
  const safetyHold = (value('temperature_c') ?? 0) >= 95 || (value('torque_pct') ?? 0) >= 185 || (value('pressure_bar') ?? 10) < 2;
  const nominal = signalStrength < 0.18;
  return {
    hypotheses, tests, nextObservation: observations[0] || null, testResult, disagreement, safetyHold, nominal,
    needsMoreEvidence: testResult === 'unmeasured' || disagreement || hypotheses[0].weight < 0.65 || nominal,
    signalStrength: Math.round(signalStrength * 100) / 100,
    label: safetyHold ? 'Safety review required' : nominal ? 'No supported intervention' : disagreement ? 'Conflicting evidence' : testResult === 'unmeasured' ? 'One more observation' : 'Evidence updated',
    method: 'Declared evidence weights updated with assumed test likelihoods. Not learned or clinically/industrially calibrated probabilities. Information gain is model-dependent.'
  };
}
