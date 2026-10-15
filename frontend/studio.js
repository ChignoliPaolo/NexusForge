export function createStudio(context) {
  const { state, api, safe, icon, button, pageHeading, showModal, closeModal, toast, navigate, render, applySimulation, casePayload, invalidateSimulation } = context;
  const currentCase = () => [...(state.sampleCases || []), ...(state.cases || [])].find(item => item.id === state.caseId);
  let updating = false;

  function observationOptions() {
    return `<option value="unmeasured">Not measured yet — keep uncertainty visible</option>${(state.simulation?.reasoning?.tests || []).map(test => `<optgroup label="${safe(test.name)}"><option value="${test.positive}" ${state.constraints.testResult === test.positive ? 'selected' : ''}>${safe(test.positiveLabel)}</option><option value="${test.negative}" ${state.constraints.testResult === test.negative ? 'selected' : ''}>${safe(test.negativeLabel)}</option></optgroup>`).join('')}`;
  }

  function decisionPanel(compact = false) {
    const reasoning = state.simulation?.reasoning;
    if (!reasoning) return '';
    if (compact) return `<section class="decision-ribbon ${reasoning.safetyHold || reasoning.disagreement ? 'caution' : ''}"><span class="ribbon-symbol">${icon(reasoning.safetyHold ? 'shield' : 'branch')}</span><div><span class="eyebrow">EVIDENCE CHANGES THE DECISION</span><strong>${safe(reasoning.label)}</strong><p>${safe(reasoning.nextObservation?.name || 'Keep a qualified operator in the loop.')}</p></div><span class="ribbon-source">${currentCase()?.telemetry.rowCount || '—'} observations<br><b>${currentCase()?.provenance === 'synthetic' ? 'SYNTHETIC INPUT' : 'UPLOADED / UNVERIFIED'}</b></span>${button('Explore the reasoning', 'futures', 'secondary', 'arrow')}</section>`;
    return `<section class="diagnosis-lab panel"><div class="diagnosis-header"><div><span class="eyebrow">ACTIVE DIAGNOSIS / ASK THE BETTER QUESTION</span><h2>${safe(reasoning.label)}</h2></div><span class="tiny-pill">RELATIVE SUPPORT · NOT PROBABILITY</span></div><div class="diagnosis-columns"><div class="hypothesis-list">${reasoning.hypotheses.map((hypothesis, index) => `<div class="hypothesis-row"><span class="hypothesis-index">0${index + 1}</span><div><strong>${safe(hypothesis.label)}</strong><p>${safe(hypothesis.explanation)}</p><div class="hypothesis-track"><i style="width:${Math.round(hypothesis.weight * 100)}%"></i></div></div><span class="mono">${Math.round(hypothesis.weight * 100)}<small>/100</small></span></div>`).join('')}</div><div class="next-observation"><span class="eyebrow">NEXT MOST INFORMATIVE OBSERVATION</span><h3>${safe(reasoning.nextObservation?.name || 'Review the evidence with a qualified specialist')}</h3><div class="gain-badge">${icon('spark')} ${reasoning.nextObservation?.informationGainBits ?? 0} bits <span>modeled information gain</span></div><p>Selected by expected entropy reduction under declared test likelihoods. This app does not perform a physical test.</p><label for="diagnostic-result">What did the independent observation show?</label><select id="diagnostic-result" ${state.busy ? 'disabled' : ''}>${observationOptions()}</select><small>${currentCase()?.provenance === 'synthetic' ? 'Synthetic case: changing this result is a what-if, not a performed inspection.' : 'An operator assertion is recorded; its authenticity is not independently verified.'}</small></div></div><div class="constraint-row"><label>Available replacement parts<input id="stock-input" type="number" min="0" max="999" step="1" value="${state.simulation.constraints.stock}" ${state.busy ? 'disabled' : ''}></label><label>Delivery lead time <span>minutes</span><input id="lead-input" type="number" min="0" max="1440" value="${state.simulation.constraints.leadMinutes}" ${state.busy ? 'disabled' : ''}></label><label>Production constraint <span>minutes</span><input id="deadline-input" type="number" min="5" max="1440" value="${state.simulation.constraints.deadlineMinutes}" ${state.busy ? 'disabled' : ''}></label><div><span class="eyebrow">TRY TO BREAK THE RECOMMENDATION</span><p>Set stock to zero. Contradict the fault. Watch the plan change.</p></div></div><div class="decision-policy">${icon('shield')} ${reasoning.safetyHold ? 'SAFETY HOLD: restorative interventions are blocked, regardless of model preference.' : 'Feasibility and goal first. Compare costs only between eligible actions with comparable outcomes.'}</div></section>`;
  }

  function page() {
    const active = currentCase();
    return `${pageHeading('NOT A SCRIPTED STORY. CHANGE THE EVIDENCE.', 'The <span>evidence studio.</span>', 'Load a reproducible case—or bring your own CSV and reference text. The decision follows the inputs.', `${button('Run decision evaluation', 'evaluate', 'secondary', 'activity')}${button('Download active case', 'download-case', 'primary', 'download')}`)}<div class="studio-layout"><section class="panel case-library"><div class="panel-header"><h2>Eight ways to challenge the agent</h2><span class="tiny-pill">SYNTHETIC</span></div><div class="case-library-list">${state.sampleCases.map((sample, index) => `<button class="case-option ${state.caseId === sample.id ? 'selected' : ''}" data-action="load-case" data-id="${sample.id}" ${state.busy ? 'disabled' : ''}><span class="case-number">${String(index + 1).padStart(2, '0')}</span><div><strong>${safe(sample.name)}</strong><small>${safe(sample.description)}</small></div>${icon(state.caseId === sample.id ? 'check' : 'arrowUp')}</button>`).join('')}</div></section><section class="panel intake-panel"><div class="panel-header"><div class="panel-title">${icon('file')}<h2>Your evidence. A fresh decision.</h2></div><span class="tiny-pill">CSV + TEXT</span></div><form id="intake-form"><label for="case-name">Case name<input id="case-name" name="caseName" maxlength="140" value="${safe(active?.name || 'New evidence case')}" required></label><div class="upload-label"><label for="csv-input">Sensor observations</label><label class="file-button">${icon('plus')} Load CSV<input id="csv-file" type="file" accept=".csv,text/csv" hidden></label></div><textarea id="csv-input" name="csv" spellcheck="false" required maxlength="180000" aria-label="CSV observations">${safe(active?.csv || '')}</textarea><div class="input-hint">ISO timestamp + pressure_bar / torque_pct, temperature_c / reject_pct, or power_kw / overlap_pct. 5–2500 rows.</div><div class="upload-label"><label for="document-input">Reference & planning record</label><label class="file-button">${icon('plus')} Load text<input id="document-file" type="file" accept=".txt,.md,text/plain,text/markdown" hidden></label></div><textarea id="document-input" name="document" spellcheck="false" maxlength="30000" aria-label="Supporting reference document">${safe(active?.document || '')}</textarea><div class="provenance-selector"><label for="input-provenance">Input provenance</label><select id="input-provenance" name="provenance"><option value="synthetic" ${active?.provenance === 'synthetic' ? 'selected' : ''}>Synthetic / generated demonstration data</option><option value="user_supplied" ${active?.provenance === 'user_supplied' ? 'selected' : ''}>User-supplied / authenticity not verified</option></select></div><div class="intake-error" id="intake-error" role="alert"></div><button type="submit" class="button primary full" ${state.busy ? 'disabled' : ''}>${icon('branch')} Analyze this evidence ${icon('arrow')}</button><p class="intake-disclosure">Input is processed locally unless you explicitly select Live API. Live mode sends measurements and references to configured providers. Do not upload sensitive plant data without authorization.</p></form></section></div>${active ? `<section class="source-receipt panel"><div class="panel-header"><h2>Extracted from source—not invented by the model</h2><span class="tiny-pill">${active.planning.references.length} PLANNING FIELDS</span></div><div class="source-fields">${active.planning.references.map(reference => `<div><code>${safe(reference.field)}</code><strong>${reference.value}</strong><small>Reference line ${reference.line}</small></div>`).join('') || '<p>No structured planning fields in this input. Conservative defaults apply.</p>'}</div></section>` : ''}`;
  }

  async function loadCase(id) {
    if (state.busy || updating) return;
    const selected = [...state.sampleCases, ...state.cases].find(item => item.id === id);
    if (!selected) return;
    updating = true;
    state.caseUpdating = true; invalidateSimulation();
    try {
      const assumptions = { ...state.defaultAssumptions, downtimeRate: selected.planning.fields.downtime_eur_per_minute ?? state.defaultAssumptions.downtimeRate };
      const simulation = await api('/api/simulate', { caseId: id, assumptions, constraints: {} });
      state.caseId = id; state.constraints = { testResult: 'unmeasured' }; state.assumptions = assumptions; state.scenarioId = selected.scenarioId; state.selectedAsset = simulation.scenario.assetId;
      state.investigation = null; state.error = null; applySimulation(simulation); render(); toast(`${selected.name} loaded from ${selected.telemetry.rowCount} observations.`);
    } finally { updating = false; state.caseUpdating = false; }
  }

  async function updateConstraints(change) {
    if (state.busy || updating) return;
    updating = true;
    state.caseUpdating = true; invalidateSimulation();
    const before = state.simulation.recommendedId;
    try {
      const constraints = { ...state.constraints, ...change };
      const simulation = await api('/api/simulate', { ...casePayload(), constraints, assumptions: state.assumptions });
      state.constraints = constraints; state.investigation = null; applySimulation(simulation); render();
      const chosen = simulation.plans.find(plan => plan.id === simulation.recommendedId);
      toast(before !== simulation.recommendedId ? `Decision changed → ${chosen.name}` : `Evidence updated → ${chosen.name}`);
    } catch (error) { toast(error.message, 'error'); render(); }
    finally { updating = false; state.caseUpdating = false; }
  }

  function bind() {
    document.querySelector('#diagnostic-result')?.addEventListener('change', event => updateConstraints({ testResult: event.target.value }));
    for (const [id, key] of [['stock-input', 'stock'], ['lead-input', 'leadMinutes'], ['deadline-input', 'deadlineMinutes']]) document.querySelector(`#${id}`)?.addEventListener('change', event => updateConstraints({ [key]: Number(event.target.value) }));
    for (const [id, target, maximum] of [['csv-file', 'csv-input', 180000], ['document-file', 'document-input', 30000]]) document.querySelector(`#${id}`)?.addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > maximum) { toast(`File exceeds the ${maximum / 1000} KB limit.`, 'error'); return; }
      try { document.querySelector(`#${target}`).value = await file.text(); } catch { toast('The file could not be read.', 'error'); }
    });
    document.querySelector('#intake-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const evidence = await api('/api/cases', { name: form.elements.caseName.value, csv: form.elements.csv.value, document: form.elements.document.value, provenance: form.elements.provenance.value });
        state.cases.unshift(evidence);
        await loadCase(evidence.id);
        navigate('futures');
      } catch (error) { document.querySelector('#intake-error').textContent = error.message; submit.disabled = false; }
    });
  }

  function downloadFile(name, content, mime = 'text/plain') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function evaluate() {
    const result = await api('/api/evaluation');
    showModal(`<span class="modal-eyebrow">REPRODUCIBLE / LOCAL CPU / SYNTHETIC CASES</span><h2 id="modal-title">Make the claims testable.</h2><div class="evaluation-score">${result.passed}<span> / ${result.total}</span></div><p class="modal-intro">Declared decision-contract checks passed in ${result.elapsedMs} ms on this machine. Not a measure of field accuracy or live-model quality.</p><div class="evaluation-checks">${result.checks.slice(0, 18).filter((_, index) => index % 2 === 0).map(check => `<div>${icon(check.passed ? 'check' : 'alert')}<span>${safe(check.name)}</span></div>`).join('')}</div><div class="notice">${icon('info')}<p>${safe(result.disclosure)}</p></div>${button('Export evaluation receipt', 'export-evaluation', 'primary full', 'download')}`, 'evaluation-modal');
    state.evaluation = result;
  }

  async function verifyProviders() {
    toast('Checking model discovery. No workflow is executed.');
    const result = await api('/api/providers/verify', {});
    showModal(`<span class="modal-eyebrow">ACTUAL PROVIDER CHECK / NO FABRICATED SUCCESS</span><h2 id="modal-title">Connection receipt.</h2><div class="source-document"><blockquote>${safe(JSON.stringify(result, null, 2))}</blockquote></div><p class="modal-intro">For authenticated Evolus schema discovery and a real model smoke test, run <code>npm run verify:live</code> on the connected laptop.</p>`);
  }

  return {
    page, decisionPanel, bind,
    actions: {
      intake: () => navigate('intake'), 'load-case': element => loadCase(element.dataset.id), evaluate,
      'verify-providers': verifyProviders,
      'export-evaluation': () => downloadFile('nexusforge-decision-evaluation.json', JSON.stringify(state.evaluation, null, 2), 'application/json'),
      'download-case': () => { const evidence = currentCase(); if (evidence) { downloadFile(`${evidence.id}-sensors.csv`, evidence.csv, 'text/csv'); setTimeout(() => downloadFile(`${evidence.id}-reference.md`, evidence.document), 350); } }
    }
  };
}
