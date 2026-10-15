export const assets = [
  { id: 'feed', name: 'Material feed', code: 'FD-01', type: 'Material handling', status: 'healthy', x: -280, z: -95, reading: '8.0', unit: 'parts / min' },
  { id: 'robot', name: 'Assembly robot', code: 'RB-04', type: 'Robotic assembly', status: 'warning', x: -80, z: -80, reading: '142', unit: '% rated torque' },
  { id: 'pressure', name: 'Pneumatic unit', code: 'PN-12', type: 'Pneumatic supply', status: 'critical', x: -85, z: 120, reading: '3.8', unit: 'bar' },
  { id: 'vision', name: 'Vision inspection', code: 'VI-02', type: 'Quality control', status: 'healthy', x: 140, z: -85, reading: '99.2', unit: '% pass rate' },
  { id: 'pack', name: 'Packaging cell', code: 'PK-01', type: 'Packaging', status: 'healthy', x: 330, z: -70, reading: '7.8', unit: 'parts / min' },
  { id: 'power', name: 'Power & cooling', code: 'PW-01', type: 'Utilities', status: 'healthy', x: 190, z: 145, reading: '42.6', unit: 'kW' }
];

export const scenarios = [
  {
    id: 'pressure', name: 'Pressure cascade', category: 'Reliability', title: 'A small leak. A whole line at risk.',
    subtitle: 'Pneumatic pressure is falling while robot torque rises. The motor alarm is a symptom—not necessarily the cause.',
    assetId: 'pressure', severity: 'Critical', signal: 'Pressure below operating envelope',
    sensor: { name: 'Manifold pressure', unit: 'bar', current: 3.8, nominal: 6.2, threshold: 4.2, series: [6.2,6.18,6.21,6.14,6.16,6.09,6.03,6.11,5.98,5.82,5.65,5.72,5.34,5.12,4.83,4.6,4.45,4.21,4.02,3.8] },
    secondary: { name: 'Axis torque', value: '142%', change: '+42% from baseline' },
    hypothesis: 'A degraded pneumatic seal is consistent with the pressure loss and downstream torque increase.',
    uncertainty: 'A regulator fault can produce similar readings. A qualified technician must verify the leak before selecting a repair.',
    chain: [
      { id: 'seal', label: 'Seal degradation', detail: 'Candidate upstream fault', kind: 'cause' },
      { id: 'pressure', label: 'Pressure loss', detail: '3.8 bar · below 4.2 bar', kind: 'observation' },
      { id: 'torque', label: 'Torque increase', detail: '142% of rated baseline', kind: 'observation' },
      { id: 'stop', label: 'Line interruption', detail: 'Projected downstream effect', kind: 'effect' }
    ],
    evidence: [
      { id: 'P-01', title: 'Pressure & torque trace', source: 'Synthetic sensor replay · PN-12 / RB-04', section: '120 sample window', text: 'Manifold pressure falls from 6.2 to 3.8 bar as axis torque rises from 100% to 142%. These are generated demo observations, not measurements from a real factory.' },
      { id: 'P-02', title: 'Pneumatic dependency model', source: 'NexusForge demo engineering handbook', section: '§ 2.1 · Counterbalance assumptions', text: 'In this illustrative model, reduced counterbalance pressure raises required motor torque. Seal leakage and regulator failure are alternative explanations; topology does not prove causation.' },
      { id: 'P-03', title: 'Parts & intervention assumptions', source: 'Synthetic inventory and service fixture', section: 'Revision 1 · Training data', text: 'Seal kit: €18.50, 15 units available. Targeted inspection and repair: 28 minutes. Servo replacement: €2,450 and 210 minutes. Values are planning assumptions, not supplier quotes.' }
    ],
    plans: [
      { id: 'targeted', name: 'Inspect & repair the seal', tag: 'Targeted intervention', minutes: 28, parts: 18.5, labor: 90, scrap: 4, energy: 2, risk: 0.08, description: 'Verify the suspected leak, isolate the cell, then repair only the confirmed failed component.', part: 'Demo seal kit · NF-SEAL-42', stock: 15, checks: ['Qualified technician verifies the seal hypothesis', 'Site-approved isolation and zero-energy verification', 'Pressure and torque return to operating envelope'] },
      { id: 'replace', name: 'Replace the servo drive', tag: 'Conventional response', minutes: 210, parts: 2450, labor: 360, scrap: 12, energy: 8, risk: 0.22, description: 'Replace the alarmed component without first resolving the upstream pressure fault.', part: 'Demo servo drive · NF-SRV-04', stock: 2, checks: ['Qualified technician confirms a drive failure', 'Site-approved isolation and zero-energy verification', 'Post-intervention commissioning and pressure checks'] },
      { id: 'inspect', name: 'Isolate & diagnose first', tag: 'Conservative fallback', minutes: 65, parts: 0, labor: 180, scrap: 6, energy: 3, risk: 0.04, description: 'Pause the cell and run a technician-led diagnosis before committing to any replacement.', part: 'No part committed', stock: null, checks: ['Qualified technician accepts investigation scope', 'Site-approved isolation and zero-energy verification', 'A separate repair plan is approved after diagnosis'] }
    ], baseline: 'replace', baselineOee: 94.2, affected: ['pressure', 'robot', 'vision']
  },
  {
    id: 'thermal', name: 'Quality drift', category: 'Quality', title: 'The line is running. The quality isn’t.',
    subtitle: 'A cooling restriction is changing the process window. Catch the drift before an entire batch becomes scrap.',
    assetId: 'power', severity: 'High', signal: 'Cabinet temperature outside process window',
    sensor: { name: 'Cabinet temperature', unit: '°C', current: 78, nominal: 43, threshold: 65, series: [43,44,43,45,46,48,47,50,52,53,55,58,59,61,64,66,69,72,75,78] },
    secondary: { name: 'Reject rate', value: '6.8%', change: '+6.0 points from baseline' },
    hypothesis: 'Restricted cooling is consistent with the cabinet temperature increase and simultaneous quality drift.',
    uncertainty: 'Sensor calibration and material variation remain alternative explanations. Quarantine suspect output pending inspection.',
    chain: [
      { id: 'filter', label: 'Cooling restriction', detail: 'Candidate upstream fault', kind: 'cause' },
      { id: 'heat', label: 'Thermal drift', detail: '78°C cabinet temperature', kind: 'observation' },
      { id: 'quality', label: 'Reject rate rises', detail: '6.8% simulated reject rate', kind: 'observation' },
      { id: 'batch', label: 'Batch at risk', detail: 'Projected quality loss', kind: 'effect' }
    ],
    evidence: [
      { id: 'T-01', title: 'Temperature & reject trace', source: 'Synthetic sensor replay · PW-01 / VI-02', section: '120 sample window', text: 'Cabinet temperature climbs from 43°C to 78°C while inspection rejects rise to 6.8%. Correlation does not establish causation.' },
      { id: 'T-02', title: 'Process-window dependency', source: 'NexusForge demo engineering handbook', section: '§ 3.2 · Thermal assumptions', text: 'The demonstration assumes sustained thermal drift can increase rejected units. Cooling, sensor calibration, and incoming material require separate verification.' },
      { id: 'T-03', title: 'Batch containment assumptions', source: 'Synthetic inventory and service fixture', section: 'Revision 1 · Training data', text: 'A cooling filter costs €36. The targeted intervention takes 35 minutes and quarantines 24 suspect units. A batch restart takes 150 minutes and loses 220 units.' }
    ],
    plans: [
      { id: 'targeted', name: 'Contain & restore cooling', tag: 'Targeted intervention', minutes: 35, parts: 36, labor: 110, scrap: 24, energy: 3, risk: 0.09, description: 'Quarantine suspect output, verify the cooling restriction, and restore the process window.', part: 'Demo cooling filter · NF-FLT-08', stock: 8, checks: ['Quality lead approves batch containment', 'Qualified technician verifies cooling restriction', 'Release only after validated quality inspection'] },
      { id: 'replace', name: 'Scrap & restart the batch', tag: 'Conventional response', minutes: 150, parts: 280, labor: 240, scrap: 220, energy: 18, risk: 0.18, description: 'Discard the complete batch and restart without first isolating the source of drift.', part: 'Demo material restart kit', stock: 3, checks: ['Quality lead approves batch disposition', 'Site-approved isolation for any equipment work', 'Restart only after process qualification'] },
      { id: 'inspect', name: 'Pause for quality review', tag: 'Conservative fallback', minutes: 75, parts: 0, labor: 180, scrap: 40, energy: 4, risk: 0.04, description: 'Hold production for a full quality and instrumentation review.', part: 'No part committed', stock: null, checks: ['Quality lead accepts review scope', 'Suspect batch isolated from released stock', 'Separate restart approval recorded'] }
    ], baseline: 'replace', baselineOee: 92.7, affected: ['power', 'vision', 'pack']
  },
  {
    id: 'energy', name: 'Energy imbalance', category: 'Efficiency', title: 'Protect the margin. Not just the machine.',
    subtitle: 'Synchronized equipment starts create an avoidable energy peak. Compare the cost of a different production rhythm.',
    assetId: 'power', severity: 'Medium', signal: 'Power demand exceeds the planning envelope',
    sensor: { name: 'Site power demand', unit: 'kW', current: 86, nominal: 42.6, threshold: 65, series: [42,43,41,44,43,46,48,45,49,53,50,57,59,63,61,67,72,78,82,86] },
    secondary: { name: 'Energy / unit', value: '0.31 kWh', change: '+39% from baseline' },
    hypothesis: 'Concurrent robot and packaging start cycles are consistent with the observed demand peak.',
    uncertainty: 'The fixture does not model a real tariff or electrical installation. A controls engineer must validate scheduling and interlocks.',
    chain: [
      { id: 'sync', label: 'Synchronized starts', detail: 'Candidate scheduling issue', kind: 'cause' },
      { id: 'load', label: 'Demand peak', detail: '86 kW simulated demand', kind: 'observation' },
      { id: 'efficiency', label: 'Energy intensity', detail: '0.31 kWh per unit', kind: 'observation' },
      { id: 'margin', label: 'Margin erosion', detail: 'Projected production cost', kind: 'effect' }
    ],
    evidence: [
      { id: 'E-01', title: 'Power & cycle overlap', source: 'Synthetic sensor replay · PW-01', section: '120 sample window', text: 'Simulated power demand rises from 42.6 to 86 kW when assembly and packaging start cycles overlap.' },
      { id: 'E-02', title: 'Scheduling dependency', source: 'NexusForge demo engineering handbook', section: '§ 4.1 · Energy assumptions', text: 'A staggered start can reduce peak demand in this simplified model. No tariff savings or safe controls change is inferred without plant-specific validation.' },
      { id: 'E-03', title: 'Energy scenario assumptions', source: 'Synthetic production planning fixture', section: 'Revision 1 · Training data', text: 'Staggering cycles assumes an 8-minute planned interruption and 14 kWh incremental consumption. Unplanned load shedding assumes 80 minutes and 96 kWh.' }
    ],
    plans: [
      { id: 'targeted', name: 'Stagger production cycles', tag: 'Scheduling intervention', minutes: 8, parts: 0, labor: 45, scrap: 0, energy: 14, risk: 0.06, description: 'Have a controls engineer validate a staggered start schedule without bypassing equipment interlocks.', part: 'No replacement parts', stock: null, checks: ['Controls engineer validates scheduling proposal', 'Existing safety interlocks remain unchanged', 'Power and throughput checked after approved restart'] },
      { id: 'replace', name: 'Reactive load shedding', tag: 'Conventional response', minutes: 80, parts: 0, labor: 140, scrap: 18, energy: 96, risk: 0.2, description: 'Interrupt production when the demand envelope is exceeded, then restart affected equipment.', part: 'No replacement parts', stock: null, checks: ['Operations lead approves planned interruption', 'Controls engineer validates the restart sequence', 'Quality checks completed on interrupted work'] },
      { id: 'inspect', name: 'Run an energy audit', tag: 'Conservative fallback', minutes: 40, parts: 0, labor: 180, scrap: 2, energy: 30, risk: 0.03, description: 'Pause the affected cells and review equipment schedules with a controls engineer.', part: 'No part committed', stock: null, checks: ['Energy lead accepts review scope', 'Validated measurement equipment available', 'Separate scheduling change approval recorded'] }
    ], baseline: 'replace', baselineOee: 95.1, affected: ['power', 'robot', 'pack']
  }
];

export function getScenario(id) {
  const scenario = scenarios.find(candidate => candidate.id === id);
  if (!scenario) throw Object.assign(new Error('Unknown scenario.'), { status: 400 });
  return structuredClone(scenario);
}
