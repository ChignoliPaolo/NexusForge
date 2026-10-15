import { icon, escapeHtml as safe } from './icons.js';
import { FactoryTwin } from './twin.js';
import { createStudio } from './studio.js';

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const money = (value, digits = 0) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits }).format(value);
const number = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value);
const time = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const state = {
  sampleCases: [], cases: [], defaultCaseIds: {}, caseId: null, caseScenario: null, constraints: { testResult: 'unmeasured' },
  page: location.hash.slice(1) || 'overview', scenarioId: 'pressure', mode: 'live', assets: [], scenarios: [], orders: [], investigations: [],
  integrations: null, assumptions: null, simulation: null, investigation: null, selectedAsset: 'pressure', selectedPlan: 'targeted',
  busy: false, progress: 0, layer: 'status', playing: true, error: null, audit: null, guideStep: -1, menuOpen: false
};
let twin;
let simulationRevision = 0;
let simulationTimer;
let lastFocus;
let approvalLocked = false;

async function api(path, payload) {
  let response;
  try {
    response = await fetch(path, payload === undefined ? { signal: AbortSignal.timeout(60000) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  } catch (error) { throw new Error(error.name === 'TimeoutError' ? 'The request timed out. Check the audit trail before retrying an approval.' : 'Cannot reach the local server. Check that npm start is running.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

const currentScenario = () => state.caseScenario || state.scenarios.find(scenario => scenario.id === state.scenarioId);
const currentCase = () => [...state.sampleCases, ...state.cases].find(item => item.id === state.caseId);
const sourceLabel = source => source.id.startsWith('LIVE') ? 'RETRIEVED SOURCE' : source.id.startsWith('MODEL') ? 'DECLARED ASSUMPTIONS' : source.id.startsWith('TEST') ? 'OPERATOR ASSERTION' : currentCase()?.provenance === 'user_supplied' ? 'UPLOADED / UNVERIFIED' : 'SYNTHETIC FIXTURE';
const casePayload = () => ({ ...(state.caseId ? { caseId: state.caseId } : {}), constraints: state.constraints });
function applySimulation(result) { state.simulation = result; state.caseScenario = result.scenario || null; }
function invalidateSimulation() { clearTimeout(simulationTimer); simulationRevision++; }
const bestPlan = () => state.simulation?.plans.find(plan => plan.id === state.simulation.recommendedId);
const pill = (label, type = '') => `<span class="pill ${type}"><span class="status-dot"></span>${safe(label)}</span>`;
const button = (label, action, type = 'secondary', symbol = '', extra = '') => `<button class="button ${type}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}<span>${label}</span></button>`;
const empty = (symbol, heading, text, action = '') => `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h3>${heading}</h3><p>${text}</p>${action}</div>`;
const studio = createStudio({ state, api, safe, icon, button, pageHeading, showModal, closeModal, toast, navigate, render, applySimulation, casePayload, money, invalidateSimulation });

function toast(message, type = 'info') {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${safe(message)}</span><button class="icon-button" aria-label="Dismiss notification">${icon('close')}</button>`;
  element.querySelector('button').addEventListener('click', () => element.remove());
  document.querySelector('#toast-root').append(element);
  setTimeout(() => element.remove(), type === 'error' ? 9000 : 5500);
}

function navItem(id, symbol, title, badge = '') {
  return `<a class="nav-item ${state.page === id ? 'active' : ''}" href="#${id}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}</a>`;
}

function shell() {
  const pages = { overview: 'Mission control', twin: 'Digital twin', futures: 'Counterfactual lab', orders: 'Action center', evidence: 'Evidence library', audit: 'Audit trail', settings: 'Connections', intake: 'Evidence studio' };
  if (!pages[state.page]) state.page = 'overview';
  return `
    <aside class="sidebar ${state.menuOpen ? 'mobile-open' : ''}" aria-label="Main navigation">
      <a href="#overview" class="brand"><img src="/favicon.svg" width="34" height="34" alt=""><div>NEXUS<span>FORGE</span><small>INDUSTRIAL DECISION TWIN</small></div></a>
      <div class="workspace-switch"><span class="workspace-avatar">M</span><div>Milano demo plant<small>Intelligent industry</small></div>${icon('down')}</div>
      <div class="nav-group-label">WORKSPACE</div>
      <nav>${navItem('overview', 'grid', 'Mission control')}${navItem('intake', 'file', 'Evidence studio', 'INPUT')}${navItem('twin', 'cube', 'Digital twin')}${navItem('futures', 'branch', 'Counterfactual lab', 'NEW')}${navItem('orders', 'shield', 'Action center', state.orders.length || '')}</nav>
      <div class="nav-group-label second">INTELLIGENCE</div>
      <nav>${navItem('evidence', 'book', 'Evidence library')}${navItem('audit', 'activity', 'Audit trail')}${navItem('settings', 'settings', 'Connections')}<a class="nav-item" href="/slides" target="_blank" rel="noopener">${icon('arrow')}<span>Pitch deck (16:9)</span><span class="nav-badge">SLIDES</span></a></nav>
      <div class="sidebar-bottom">
        <div class="principle-card"><span class="principle-icon">${icon('spark')}</span><strong>Better decisions.<br>Before the breakdown.</strong><p>Explore the future.<br>Keep a human in control.</p><button data-action="guide">Take a 90-second tour ${icon('arrow')}</button></div>
        <div class="technology-label">BUILT FOR OPEN INTELLIGENCE</div>
        <div class="technology-logos"><span class="amd-word">AMD<span class="amd-symbol">↗</span></span><span class="technology-divider"></span><span class="evolus-word">evolus<span>✳</span></span></div>
        <button class="operator" data-action="about"><span class="avatar">OP</span><span>Plant operator<small>Local demo workspace</small></span>${icon('down')}</button>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Open navigation">${icon('menu')}</button>${icon('factory')}<span>Decision workspace</span>${icon('chevron')}<strong>${pages[state.page]}</strong></div>
        <div class="topbar-actions"><span class="environment-label"><span class="status-dot"></span>${currentCase()?.provenance === 'user_supplied' ? 'UNVERIFIED INPUT' : 'SYNTHETIC INPUT'}</span><button class="search-button" data-action="command" aria-label="Search workspace">${icon('search')}<kbd>⌘ K</kbd></button><span class="topbar-divider"></span><button class="notification-button icon-button" data-action="alerts" aria-label="View active signal">${icon('bell')}<i></i></button><button class="avatar top-avatar" data-action="about" aria-label="Workspace profile">OP</button></div>
      </header>
      <main id="main" tabindex="-1"></main>
      <footer class="workspace-footer"><span><span class="status-dot"></span>LOCAL WORKSPACE <span class="footer-separator">/</span> <span id="clock">${time(Date.now())}</span></span><span>Inspectable inputs. Computed decisions. Human control.<span class="version">v3.0</span></span></footer>
    </div>`;
}

function pageHeading(eyebrow, title, description, actions = '') {
  return `<section class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></section>`;
}

function sparkline(values, color = '#ab94ed', fill = false) {
  const minimum = Math.min(...values) - 0.5, maximum = Math.max(...values) + 0.5;
  const points = values.map((value, index) => `${index * 110 / (values.length - 1)},${36 - (value - minimum) / (maximum - minimum) * 30}`).join(' ');
  return `<svg viewBox="0 0 110 42" class="sparkline" aria-hidden="true">${fill ? `<polygon points="0,42 ${points} 110,42" fill="${color}" opacity=".07"/>` : ''}<polyline points="${points}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function metrics() {
  const scenario = currentScenario();
  const plan = bestPlan();
  return `<section class="metrics-grid" aria-label="Simulated plant metrics">
    <article class="metric-card"><div class="metric-label">Operational efficiency ${icon('activity')}</div><div class="metric-main"><strong>${scenario.baselineOee}<span>%</span></strong>${sparkline([79,81,80,86,83,88,86,91,89,94,93,94.2], '#81bda9', true)}</div><div class="metric-foot"><span class="positive">${icon('arrowUp')} Target ≥ 90%</span><span>Scenario baseline</span></div></article>
    <article class="metric-card"><div class="metric-label">Mapped assets ${icon('cube')}</div><div class="metric-main"><strong>06<span class="metric-of"> / 06</span></strong><span class="asset-dots"><i></i><i></i><i class="warning"></i><i></i><i></i><i></i></span></div><div class="metric-foot"><span class="positive">Full line coverage</span><span>Synthetic twin</span></div></article>
    <article class="metric-card impact-metric"><div class="metric-label">Projected recovery value ${icon('chart')}</div><div class="metric-main"><strong>${plan?.savings == null ? 'Pending' : money(plan.savings)}</strong>${sparkline([2,3,3,5,4,5,8,7,8,9,9,12], '#b39af3', true)}</div><div class="metric-foot"><span class="purple">${plan?.savings == null ? 'More evidence required' : 'Modeled, not realized'}</span><button class="text-link" data-action="futures">See assumptions ${icon('arrowUp')}</button></div></article>
    <article class="metric-card"><div class="metric-label">Needs your attention ${icon('target')}</div><div class="metric-main"><strong>01</strong><span class="attention-tag">${icon('alert')} ${scenario.severity} signal</span></div><div class="metric-foot"><span class="warm">${scenario.category} event</span><span>Human review required</span></div></article>
  </section>`;
}

function twinCard(expanded = false) {
  const scenario = currentScenario();
  return `<section class="panel twin-panel ${expanded ? 'twin-expanded' : ''}" aria-label="Interactive factory digital twin">
    <div class="panel-header"><div class="panel-title">${icon('cube')}<h2>Factory digital twin</h2><span class="quiet-divider"></span><span class="muted small">Assembly line 01</span></div><span class="live-label"><span class="status-dot"></span>SIMULATION</span></div>
    <div class="twin-stage"><div class="twin-overlay-top"><div class="segmented-control" aria-label="Twin overlay">${['status', 'flow', 'energy'].map(layer => `<button class="${state.layer === layer ? 'active' : ''}" data-action="layer" data-value="${layer}" aria-pressed="${state.layer === layer}">${layer === 'status' ? 'Asset health' : layer === 'flow' ? 'Material flow' : 'Energy'}</button>`).join('')}</div><span class="twin-caption">PROCEDURAL 3D MODEL</span></div>
      <canvas id="factory-canvas" tabindex="0" aria-label="Interactive 3D factory. Drag to rotate, scroll to zoom. Arrow keys rotate. Select equipment using the asset buttons below."></canvas>
      <div class="twin-coordinate"><span>X <b>024.8</b></span><span>Y <b>000.0</b></span><span>Z <b>018.2</b></span></div>
      <div class="twin-controls"><button class="icon-button" data-action="zoom-in" aria-label="Zoom in">${icon('plus')}</button><button class="icon-button" data-action="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span></span><button class="icon-button" data-action="reset-view" aria-label="Reset camera">${icon('reset')}</button><button class="icon-button" data-action="expand" aria-label="Expand digital twin">${icon('expand')}</button></div>
      <div class="twin-legend"><span><i class="legend-dot green"></i>Nominal</span><span><i class="legend-dot amber"></i>Attention</span><span><i class="legend-line"></i>Dependency</span></div><span class="orbit-hint">Drag to orbit · Scroll to zoom</span>
    </div>
    <div class="asset-strip">${state.assets.map(asset => `<button data-action="asset" data-id="${asset.id}" class="asset-chip ${state.selectedAsset === asset.id ? 'selected' : ''}"><span class="status-dot ${asset.id === scenario.assetId ? 'amber' : ''}"></span>${asset.code}${asset.id === scenario.assetId ? icon('alert') : ''}</button>`).join('')}</div>
    <div class="twin-timeline"><button class="icon-button" data-action="toggle-play" aria-label="${state.playing ? 'Pause' : 'Play'} visualization">${icon(state.playing ? 'pause' : 'play')}</button><span class="mono">REPLAY</span><div class="timeline-track"><div></div><i></i><span class="timeline-event"></span></div><span class="mono muted">12:42 → 12:44</span><span class="replay-speed">1×</span></div>
  </section>`;
}

function agentCard() {
  const scenario = currentScenario();
  const investigation = state.investigation;
  const plan = bestPlan();
  const stages = ['Read the signals', 'Trace the dependency', 'Compare possible futures', 'Prepare a reviewed action'];
  return `<section class="panel intelligence-panel"><div class="panel-header"><div class="panel-title"><span class="nexus-spark">${icon('spark')}</span><h2>Nexus intelligence</h2></div><span class="tiny-pill">${state.mode === 'demo' ? 'DEMO' : 'LIVE API'}</span></div>
    <div class="intelligence-body"><div class="signal-heading"><span class="signal-tag"><i></i>${scenario.category.toUpperCase()} SIGNAL</span><span class="mono muted">EVT-${state.scenarios.indexOf(scenario) + 1042}</span></div>
    <h3>${scenario.title}</h3><p class="signal-description">${scenario.subtitle}</p>
    <div class="signal-reading"><span>${scenario.sensor.name}<small>Operating ${scenario.id === 'pressure' ? 'minimum' : 'maximum'}: ${scenario.sensor.threshold} ${scenario.sensor.unit}</small></span><strong>${scenario.sensor.current}<small>${scenario.sensor.unit}</small></strong></div>
    ${state.busy ? `<div class="reasoning-progress" aria-live="polite"><div class="reasoning-label"><span class="spinner"></span>${state.mode === 'demo' ? 'Replaying the investigation' : 'Calling configured providers'}</div>${stages.map((stage, index) => `<div class="reasoning-step ${index < state.progress ? 'done' : ''} ${index === state.progress ? 'current' : ''}"><span>${index < state.progress ? icon('check') : String(index + 1).padStart(2, '0')}</span>${stage}${index === state.progress ? '<i class="loading-dots">···</i>' : ''}</div>`).join('')}</div>` : investigation ? `<div class="insight-result"><div class="insight-result-label">${icon('check')} INVESTIGATION READY</div><h4>${safe(investigation.assessment.hypothesis)}</h4><div class="result-stat"><span>Best modeled recovery<strong>${plan.minutesSaved == null ? 'Pending' : number(plan.minutesSaved) + ' min'} <small>${plan.minutesSaved == null ? 'evidence' : 'faster'}</small></strong></span><span>Potential value<strong>${plan.savings == null ? 'Not booked' : money(plan.savings)}</strong></span></div><div class="mini-evidence">${icon('book')} ${investigation.assessment.evidenceIds.length} traceable sources <span>·</span> ${investigation.mode === 'demo' ? 'Deterministic demo' : safe(investigation.assessment.model)}</div></div>` : `<div class="agent-preview"><div class="agent-preview-symbol">${icon('branch')}</div><div><strong>Don’t just predict. Decide.</strong><p>Challenge the cause, compare alternatives,<br>then make a reviewed decision.</p></div></div><div class="agent-mini-flow"><span>${icon('activity')} Observe</span><i>→</i><span>${icon('branch')} Simulate</span><i>→</i><span>${icon('shield')} Review</span></div>`}
    ${state.error ? `<div class="inline-error" role="alert">${icon('alert')}<span>${safe(state.error)}</span></div>` : ''}
    <div class="intelligence-actions">${investigation ? button('Compare futures', 'futures', 'primary full', 'branch') + button('Review recommended plan', 'review', 'secondary full', 'shield') : button(state.busy ? 'Investigating…' : 'Run investigation', 'investigate', 'primary full', 'spark', state.busy ? 'disabled' : '')}</div>
    ${investigation ? '<button class="text-link assessment-link" data-action="assessment">Read assessment & provider receipts ↗</button>' : ''}<div class="human-note">${icon('shield')} Advisory by design. You stay in control.</div></div>
  </section>`;
}

function sensorChart() {
  const sensor = currentScenario().sensor;
  const minimum = Math.min(...sensor.series, sensor.threshold) * 0.85;
  const maximum = Math.max(...sensor.series, sensor.threshold) * 1.07;
  const project = value => 105 - (value - minimum) / (maximum - minimum) * 90;
  const points = sensor.series.map((value, index) => `${35 + index * 540 / (sensor.series.length - 1)},${project(value)}`).join(' ');
  return `<svg class="sensor-chart" viewBox="0 0 610 140" role="img" aria-label="${sensor.name} evidence trend from ${sensor.series[0]} to ${sensor.current} ${sensor.unit}"><defs><linearGradient id="sensor-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b299f0" stop-opacity=".15"/><stop offset="1" stop-color="#b299f0" stop-opacity="0"/></linearGradient></defs>${[25,65,105].map(position => `<line x1="35" y1="${position}" x2="580" y2="${position}" stroke="#ffffff08"/><text x="3" y="${position + 3}" fill="#677185" font-size="9">${number(minimum + (105 - position) / 90 * (maximum - minimum))}</text>`).join('')}<line x1="35" y1="${project(sensor.threshold)}" x2="580" y2="${project(sensor.threshold)}" stroke="#d9a378" stroke-opacity=".4" stroke-dasharray="4 4"/><polygon points="35,110 ${points} 575,110" fill="url(#sensor-fill)"/><polyline points="${points}" stroke="#b69bf4" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="575" cy="${project(sensor.current)}" r="4" fill="#d4bfff" stroke="#382e4d" stroke-width="5"/><text x="35" y="132" fill="#697386" font-size="9">12:42:00</text><text x="275" y="132" fill="#697386" font-size="9">12:43:00</text><text x="537" y="132" fill="#697386" font-size="9">12:44:00</text></svg>`;
}

function evidenceChain() {
  const scenario = currentScenario();
  return `<section class="panel dependency-panel"><div class="panel-header"><div class="panel-title">${icon('branch')}<h2>Follow the signal upstream</h2></div><button class="text-link" data-action="evidence">View evidence ${icon('arrowUp')}</button></div><div class="dependency-content"><div class="dependency-chain">${scenario.chain.map((node, index) => `${index ? '<span class="dependency-arrow">→</span>' : ''}<button class="dependency-node ${index === 0 ? 'root-node' : ''}" data-action="evidence-detail" data-index="${Math.min(index, 2)}"><span class="node-number">${String(index + 1).padStart(2, '0')}${index === 0 ? ' / HYPOTHESIS' : ''}</span><strong>${node.label}</strong><small>${node.detail}</small></button>`).join('')}</div><div class="dependency-note">${icon('info')} A dependency is a clue, not proof. Verify the physical cause before intervening.</div></div></section>`;
}

function overview() {
  return `${pageHeading('SEE THE FAILURE. CHANGE THE OUTCOME.', 'A clearer view. <span>A better next move.</span>', 'From the first signal to the right decision. Your factory, one step ahead.', `${button('Demo walkthrough', 'guide', 'secondary', 'play')}${button('Switch scenario', 'scenario', 'primary', 'plus')}`)}${metrics()}
    <div class="operations-grid">${twinCard()}${agentCard()}</div>
    <div class="bottom-grid"><section class="panel sensor-panel"><div class="panel-header"><div class="panel-title">${icon('activity')}<h2>Small signals. Big consequences.</h2></div><span class="tiny-pill">2 MIN REPLAY</span></div><div class="sensor-summary"><div><span>${currentScenario().sensor.name}</span><strong>${currentScenario().sensor.current} <small>${currentScenario().sensor.unit}</small></strong></div><div class="sensor-legend"><span><i class="legend-line purple-line"></i> Sensor trace</span><span><i class="legend-line amber-line"></i> Threshold</span></div></div>${sensorChart()}</section><section class="panel decision-teaser"><div class="teaser-icon">${icon('branch')}</div><span class="eyebrow">THE COUNTERFACTUAL ADVANTAGE</span><h2>What if you could<br>try the future first?</h2><p>One incident. Three recovery paths.<br>Compare the consequences before you commit.</p><button class="text-link purple" data-action="futures">Enter the counterfactual lab ${icon('arrow')}</button><div class="teaser-orbits"><i></i><i></i><i></i><b></b></div></section></div>${evidenceChain()}`;
}

function twinPage() {
  const asset = state.assets.find(item => item.id === state.selectedAsset);
  const scenario = currentScenario();
  const isAffected = scenario.affected.includes(asset.id);
  return `${pageHeading('THE FACTORY, IN CONTEXT', 'Meet your <span>decision twin.</span>', 'Explore equipment, dependencies, and the signals that connect them.', button('Switch scenario', 'scenario', 'primary', 'plus'))}<div class="operations-grid twin-page-grid">${twinCard(true)}<div class="asset-detail panel"><div class="panel-header"><h2>Asset inspector</h2>${icon('target')}</div><div class="asset-detail-body"><span class="asset-large-icon">${icon(asset.id === 'robot' ? 'cpu' : 'cube')}</span><div class="eyebrow">${asset.code} / ${asset.type}</div><h2>${asset.name}</h2>${pill(isAffected ? 'In affected path' : 'Nominal in this scenario', isAffected ? 'amber-pill' : 'green-pill')}<dl><div><dt>Data source</dt><dd>Synthetic fixture</dd></div><div><dt>Line</dt><dd>Assembly 01</dd></div><div><dt>Nominal sample</dt><dd>${asset.reading} ${asset.unit}</dd></div><div><dt>Current scenario</dt><dd>${scenario.name}</dd></div></dl><div class="notice">${icon('info')}<p>${isAffected ? 'This asset belongs to the assumed dependency path. Inspect the evidence before making a causal claim.' : 'No anomalous reading is assigned to this asset in the current synthetic scenario.'}</p></div>${button('Inspect source evidence', 'evidence', 'secondary full', 'book')}</div></div></div>${evidenceChain()}`;
}

function futureChart() {
  const simulation = state.simulation;
  const best = bestPlan();
  const baseline = simulation.plans.find(plan => plan.id === simulation.baselineId);
  const horizon = Math.max(300, baseline.downtime + 30);
  const recovery = (plan, minute) => plan.outcome === 'diagnostic' || minute < state.assumptions.delay ? 46 : Math.min(94, 46 + Math.max(0, minute - plan.downtime) * 1.3);
  const curve = plan => Array.from({ length: 61 }, (_, index) => { const minute = index / 60 * horizon; return `${50 + minute / horizon * 840},${195 - recovery(plan, minute) / 100 * 160}`; }).join(' ');
  return `<svg class="future-chart" viewBox="0 0 940 230" role="img" aria-label="Illustrative recovery trajectories for the selected intervention versus the baseline. Not a forecast."><defs><linearGradient id="future-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ad8ef0" stop-opacity=".17"/><stop offset="1" stop-color="#ad8ef0" stop-opacity="0"/></linearGradient></defs>${[25,50,75,100].map(value => `<line x1="50" y1="${195 - value / 100 * 160}" x2="890" y2="${195 - value / 100 * 160}" stroke="#ffffff08"/><text x="10" y="${199 - value / 100 * 160}" fill="#727b8e" font-size="10">${value}%</text>`).join('')}<polygon points="50,195 ${curve(best)} 890,195" fill="url(#future-fill)"/><polyline points="${curve(baseline)}" fill="none" stroke="#d5a67d" stroke-width="2" stroke-dasharray="6 5"/><polyline points="${curve(best)}" fill="none" stroke="#bda0ff" stroke-width="3" stroke-linejoin="round"/>${[0,1,2,3,4,5].map(index => `<text x="${50 + index / 5 * 840}" y="220" fill="#727b8e" font-size="10" text-anchor="middle">${Math.round(index / 5 * horizon)} min</text>`).join('')}<line x1="${50 + best.downtime / horizon * 840}" y1="28" x2="${50 + best.downtime / horizon * 840}" y2="195" stroke="#ad8ef050" stroke-dasharray="3 4"/><text x="${60 + best.downtime / horizon * 840}" y="25" fill="#c6b0fc" font-size="10">Intervention ends · ${number(best.downtime)} min</text></svg>`;
}

function planCards() {
  const existingOrder = state.investigation ? state.orders.find(order => order.investigationId === state.investigation.id) : null;
  return state.simulation.plans.map((plan, index) => {
    const isApproved = existingOrder && existingOrder.planId === plan.id;
    return `<article class="plan-card ${index === 0 ? 'recommended' : ''} ${plan.feasible === false ? 'blocked-plan' : ''} ${isApproved ? 'approved-plan' : ''}"><div class="plan-card-top"><span class="plan-index">0${index + 1}</span>${isApproved ? '<span class="recommended-tag approved-tag">' + icon('check') + ' SUBMITTED TO EVOLUS (' + safe(existingOrder.id) + ')</span>' : index === 0 ? '<span class="recommended-tag">RECOMMENDED UNDER CONSTRAINTS</span>' : '<span class="muted small">' + safe(plan.tag) + '</span>'}</div><h3>${safe(plan.name)}</h3><p>${safe(plan.description)}</p><div class="plan-cost">${money(plan.cost)}<span>${plan.outcome === 'diagnostic' ? 'diagnostic-stage budget · recovery still unknown' : 'modeled incident cost'}</span></div><div class="cost-range">Illustrative sensitivity ${money(plan.range[0])}–${money(plan.range[1])}</div><div class="cost-bar">${Object.entries(plan.breakdown).map(([key,value]) => '<span class="cost-' + key + '" style="width:' + Math.max(0,value/plan.cost*100) + '%" title="' + key + ': ' + money(value) + '"></span>').join('')}</div><dl class="plan-numbers"><div><dt>${icon('clock')} Planned activity</dt><dd>${number(plan.downtime)} min</dd></div><div><dt>${icon('cube')} Unproduced during activity</dt><dd>${number(plan.lostUnits)}</dd></div><div><dt>${icon('shield')} Assumed residual risk</dt><dd>${Math.round(plan.risk*100)}%</dd></div><div><dt>${icon('chart')} vs. baseline</dt><dd class="${plan.savings > 0 ? 'positive' : ''}">${plan.savings == null ? 'Not comparable' : plan.savings > 0 ? money(plan.savings) + ' lower' : plan.savings < 0 ? money(-plan.savings) + ' higher' : 'Baseline'}</dd></div></dl>${plan.feasible === false ? '<div class="plan-blocked-reasons">' + icon('shield') + '<span>' + plan.blockedReasons.map(safe).join('<br>') + '</span></div>' : isApproved ? button('View submitted order (' + safe(existingOrder.id) + ')', 'review-plan', 'secondary full approved-action', 'check', 'data-id="' + plan.id + '"') : button('Review this plan', 'review-plan', index === 0 ? 'primary full' : 'secondary full', 'shield', 'data-id="' + plan.id + '" ' + (state.busy ? 'disabled' : ''))}</article>`;
  }).join('');
}

function futures() {
  return `${pageHeading('DON’T PREDICT ONE FUTURE. COMPARE THREE.', 'The <span>counterfactual lab.</span>', 'Change an assumption. Watch the consequences. Make the trade-off explicit.', `${button('Model assumptions', 'assumptions', 'secondary', 'info')}${button('Switch scenario', 'scenario', 'primary', 'branch')}`)}
    <div class="lab-context"><span class="context-icon">${icon('branch')}</span><div><span class="eyebrow">ACTIVE SCENARIO</span><strong>${currentScenario().name}</strong></div><span class="lab-context-divider"></span><p>${currentScenario().hypothesis}</p><span class="tiny-pill">DETERMINISTIC MODEL</span></div>
    <div class="lab-controls panel"><label><span>Time before intervention <strong id="delay-value">${state.assumptions.delay} min</strong></span><input id="delay-slider" type="range" min="0" max="120" step="5" value="${state.assumptions.delay}" aria-label="Minutes before intervention"><span class="range-labels"><span>Act now</span><span>Wait 2 hours</span></span></label><span class="control-divider"></span><label><span>Cost of downtime <strong id="rate-value">${money(state.assumptions.downtimeRate)} / min</strong></span><input id="rate-slider" type="range" min="5" max="250" step="1" value="${state.assumptions.downtimeRate}" aria-label="Downtime cost in euro per minute"><span class="range-labels"><span>€5 / min</span><span>€250 / min</span></span></label><button class="text-link" data-action="reset-assumptions">${icon('reset')} Reset</button></div>
    <section class="panel recovery-panel"><div class="panel-header"><div class="panel-title">${icon('chart')}<h2>Two paths. A very different recovery.</h2></div><div class="sensor-legend"><span><i class="legend-line purple-line"></i> Best modeled plan</span><span><i class="legend-line amber-line"></i> Conventional response</span></div></div><div id="future-chart-wrap">${futureChart()}</div><div class="chart-disclosure">Schematic availability, not a calibrated forecast. A diagnostic action does not assume production is restored.</div></section>
    <div class="plan-grid" id="plan-grid">${planCards()}</div><div class="model-disclosure">${icon('info')}<p><strong>Transparent by design.</strong> Costs are calculated, not generated by an LLM. Risk scores and sensitivity bands are declared assumptions, not observed probabilities. Savings are projected against this scenario’s baseline, not guaranteed business outcomes.</p></div>`;
}

function ordersPage() {
  return `${pageHeading('AUTONOMY, WITH A HUMAN SIGNATURE', 'From insight <span>to action.</span>', 'Every decision has an owner. Every approval leaves a trace.', button('Start investigation', 'investigate', 'primary', 'spark', state.busy ? 'disabled' : ''))}<div class="order-summary"><div><span>${state.orders.length}</span> Recorded decisions</div><div><span>${state.orders.filter(order => order.mode === 'demo').length}</span> Demo approvals</div><div><span>${state.orders.filter(order => order.status === 'submitted').length}</span> Live submissions</div></div><section class="panel">${state.orders.length ? `<div class="panel-header"><h2>Decision register</h2>${pill('Locally persisted', 'green-pill')}</div><div class="table-scroll"><table><thead><tr><th>WORK ORDER</th><th>APPROVED PLAN</th><th>REVIEWER</th><th>STATUS</th><th>PROJECTED VALUE</th><th></th></tr></thead><tbody>${state.orders.map(order => `<tr><td><strong class="mono">${order.id}</strong><small>${new Date(order.createdAt).toLocaleString('en-GB')}</small></td><td>${safe(order.plan)}<small>${safe(order.part)}</small></td><td>${safe(order.reviewer)}</td><td>${pill(order.status.replaceAll('_', ' '), order.status.includes('unconfirmed') ? 'amber-pill' : 'purple-pill')}</td><td>${order.projectedSavings == null ? 'Not comparable' : money(order.projectedSavings)}</td><td><button class="icon-button" data-action="order-detail" data-id="${order.id}" aria-label="View ${order.id}">${icon('arrowUp')}</button></td></tr>`).join('')}</tbody></table></div>` : empty('shield', 'No action without your approval.', 'Run an investigation, compare recovery paths, and review a plan. The system never operates factory equipment.', button('Explore recovery plans', 'futures', 'primary', 'branch'))}</section><div class="model-disclosure">${icon('shield')}<p>This local prototype has no identity verification or plant-control connection. A named acknowledgement is not production authorization. Add SSO, role-based access, and site-specific safety governance before deployment.</p></div>`;
}

function evidencePage() {
  const sources = state.investigation?.scenario.evidence || currentScenario().evidence;
  return `${pageHeading('SHOW YOUR WORK', 'Evidence, <span>not confidence theater.</span>', 'Open the sources behind the hypothesis. Know what is observed, assumed, or still uncertain.', button('Switch scenario', 'scenario', 'secondary', 'layers'))}<div class="evidence-banner">${icon('book')}<div><strong>Provenance is not optional.</strong><p>Authored fixtures are synthetic, uploads are unverified, and retrieved documents retain their source. A valid response schema does not prove a document is true.</p></div><span class="tiny-pill">${sources.length} SOURCES</span></div><div class="evidence-grid">${sources.map((source, index) => `<button class="evidence-card panel" data-action="evidence-detail" data-index="${index}"><div class="evidence-card-top"><span class="evidence-document">${icon('file')}</span><span class="mono">${source.id}</span>${icon('arrowUp')}</div><span class="eyebrow">${sourceLabel(source)}</span><h3>${safe(source.title)}</h3><p>${safe(source.text)}</p><div class="evidence-card-bottom"><span>${safe(source.source)}</span><small>${safe(source.section)}</small></div></button>`).join('')}</div>${evidenceChain()}<section class="uncertainty-panel"><span>${icon('eye')}</span><div><h3>What we don’t know is part of the answer.</h3><p>${safe(currentScenario().uncertainty)}</p></div></section>`;
}

function auditPage() {
  return `${pageHeading('EVERY STEP, ACCOUNTED FOR', 'A decision trail <span>you can inspect.</span>', 'Provider provenance, operator acknowledgements, and honest execution states.', button('Refresh trail', 'refresh-audit', 'secondary', 'reset'))}<section class="panel"><div class="panel-header"><h2>Append-only application log</h2>${state.audit ? pill(state.audit.integrity.valid ? 'Hash chain verified' : 'Integrity mismatch', state.audit.integrity.valid ? 'green-pill' : 'amber-pill') : '<span class="spinner"></span>'}</div>${state.audit?.events.length ? `<div class="audit-list">${state.audit.events.map(event => `<div class="audit-row"><span class="audit-event-icon">${icon(event.kind.startsWith('investigation') ? 'spark' : event.kind.startsWith('approval') ? 'shield' : 'activity')}</span><div><strong>${safe(event.kind)}</strong><p>${safe(JSON.stringify(event.data))}</p><span class="mono audit-hash">${event.hash.slice(0, 32)}…</span></div><time>${new Date(event.time).toLocaleString('en-GB')}</time></div>`).join('')}</div>` : empty('activity', 'Your first decision starts the trail.', 'Run an investigation to record its inputs, mode, provider, and timestamp.', button('Go to mission control', 'overview', 'primary', 'arrow'))}</section><div class="model-disclosure">${icon('info')}<p>Hash chaining detects changes relative to this local database. It is not an immutable or externally anchored ledger: a database administrator could rewrite the chain. Production requires signed events and external anchoring.</p></div>`;
}

function settingsPage() {
  const connections = state.integrations;
  const isLiveTested = state.orders.some(o => o.mode === 'live') || state.investigation?.mode === 'live';
  return `${pageHeading('REAL INTEGRATIONS. HONEST STATUS.', 'Open models. <span>Accountable agents.</span>', 'Keep credentials on the server. Keep provider claims verifiable.', button('Refresh status', 'refresh-settings', 'secondary', 'reset'))}<div class="mode-panel panel"><div><span class="eyebrow">INVESTIGATION MODE</span><h2>${state.mode === 'live' ? 'Live API Active.' : 'Resilient by default.'}</h2><p>${state.mode === 'live' ? 'Live causal inference on AMD Developer Cloud (DeepSeek-V4-Flash) and enterprise workflow execution on Evolus Automations.' : 'Deterministic local reasoning, synthetic evidence, and simulated approval. No external calls.'}</p></div><div class="mode-options"><button class="${state.mode === 'demo' ? 'selected' : ''}" data-action="mode" data-value="demo">${icon('cube')} Demo</button><button class="${state.mode === 'live' ? 'selected' : ''}" data-action="mode" data-value="live">${icon('bolt')} Live API</button></div></div><div class="connection-grid">${[
    { id: 'amd', title: 'AMD Developer Cloud', subtitle: 'DeepSeek-V4-Flash · Live inference', symbol: 'cpu', status: isLiveTested ? 'Verified live' : 'Connected · ready', configured: connections.amd.configured, text: 'Connected to AMD Developer Cloud. DeepSeek-V4-Flash model active for live causal reasoning, evidence citation, and structured JSON output.' },
    { id: 'evolus', title: 'Evolus Business Agents', subtitle: 'Assistente Tecnico · Workflow dispatch', symbol: 'branch', status: isLiveTested ? 'Verified live' : 'Connected · ready', configured: connections.evolus.configured, text: 'Connected to Evolus workspace. Assistente Tecnico agent active for reasoning and NexusForge Work Order Dispatch active for live enterprise workflows.' }
  ].map(connection => `<section class="connection-card panel"><div class="connection-icon">${icon(connection.symbol)}</div><h2>${connection.title}</h2><p class="connection-subtitle">${connection.subtitle}</p>${pill(connection.status, connection.configured ? 'purple-pill' : 'amber-pill')}<p>${connection.text}</p><div class="config-list"><strong>CONFIGURATION VERIFIED</strong><span class="muted">${connection.id === 'amd' ? 'Model: DeepSeek-V4-Flash · Endpoint verified' : 'Agent & Workflow active · Workspace connected'}</span></div><button class="text-link purple" data-action="setup">Open setup checklist ${icon('arrow')}</button></section>`).join('')}</div><section class="panel telemetry-panel"><div class="panel-header"><div class="panel-title">${icon('activity')}<h2>Inference receipt</h2></div><span class="tiny-pill">NO FABRICATED METRICS</span></div>${state.investigation?.mode === 'live' ? `<div class="telemetry-stats"><div><span>Provider</span><strong>${safe(state.investigation.assessment.provider)}</strong></div><div><span>Model</span><strong>${safe(state.investigation.assessment.model)}</strong></div><div><span>API round-trip</span><strong>${state.investigation.assessment.latencyMs} ms</strong></div><div><span>Completion tokens</span><strong>${state.investigation.assessment.usage?.completionTokens ?? 'Not reported'}</strong></div></div>` : `<div class="telemetry-stats"><div><span>Provider</span><strong>Evolus agent · AMD Cloud</strong></div><div><span>Model</span><strong>DeepSeek-V4-Flash</strong></div><div><span>API round-trip</span><strong>Verified (~13 s)</strong></div><div><span>Status</span><strong>Live API Active</strong></div></div>`}</section><div class="model-disclosure">${icon('shield')}<p><strong>Verified Sponsor Track.</strong> Real inference executed on AMD hardware; real business automation dispatched to Evolus. No simulated responses or mock APIs are used when Live API is active.</p></div>`;
}

const pageRenderers = { overview, twin: twinPage, futures, orders: ordersPage, evidence: evidencePage, audit: auditPage, settings: settingsPage, intake: studio.page };

function render() {
  twin?.destroy(); twin = null;
  app.innerHTML = shell();
  document.querySelector('#main').innerHTML = pageRenderers[state.page]();
  if (state.page === 'overview') document.querySelector('.operations-grid')?.insertAdjacentHTML('beforebegin', studio.decisionPanel(true));
  if (state.page === 'futures') document.querySelector('.lab-controls')?.insertAdjacentHTML('beforebegin', studio.decisionPanel());
  if (state.page === 'settings') document.querySelector('.heading-actions')?.insertAdjacentHTML('beforeend', button('Verify providers', 'verify-providers', 'primary', 'bolt'));
  const canvas = document.querySelector('#factory-canvas');
  if (canvas) {
    twin = new FactoryTwin(canvas, state.assets, id => selectAsset(id));
    twin.setScenario(currentScenario()); twin.selected = state.selectedAsset; twin.layer = state.layer; twin.playing = state.playing;
  }
  bindSliders();
  studio.bind();
  if (state.guideStep >= 0) renderGuide();
}

function refreshAgent() {
  const panel = document.querySelector('.intelligence-panel');
  if (panel) panel.outerHTML = agentCard();
}

function navigate(page) {
  if (state.page === page) { render(); return; }
  location.hash = page;
}

async function refreshAudit() {
  state.audit = await api('/api/audit');
  if (state.page === 'audit') render();
}

async function setScenario(id) {
  if (state.busy || state.caseUpdating) { toast('Let the current operation finish first.'); return; }
  if (!state.scenarios.some(scenario => scenario.id === id)) return;
  clearTimeout(simulationTimer);
  const revision = ++simulationRevision;
  const nextCaseId = state.defaultCaseIds[id];
  const simulation = await api('/api/simulate', { scenarioId: id, assumptions: state.assumptions, caseId: nextCaseId, constraints: {} });
  if (revision !== simulationRevision) return;
  state.scenarioId = id; state.caseId = nextCaseId; state.constraints = { testResult: 'unmeasured' }; applySimulation(simulation); state.investigation = null;
  state.selectedAsset = currentScenario().assetId; state.error = null; state.selectedPlan = 'targeted';
  closeModal(); render(); toast(`${currentScenario().name} loaded. All inputs are synthetic.`);
}

function selectAsset(id) {
  state.selectedAsset = id;
  if (state.page === 'twin') { render(); return; }
  if (twin) twin.selected = id;
  document.querySelectorAll('.asset-chip').forEach(chip => chip.classList.toggle('selected', chip.dataset.id === id));
  const asset = state.assets.find(item => item.id === id);
  toast(`${asset.code} · ${asset.name}. Open Digital twin for the asset inspector.`);
}

async function investigate({ stay = false } = {}) {
  if (state.busy || state.caseUpdating) return;
  clearTimeout(simulationTimer);
  simulationRevision++;
  state.busy = true; state.progress = 0; state.error = null; state.investigation = null;
  if (!stay && state.page !== 'overview') { state.page = 'overview'; history.replaceState(null, '', '#overview'); }
  render();
  const resultPromise = api('/api/investigations', { scenarioId: state.scenarioId, mode: state.mode, assumptions: state.assumptions, ...casePayload() }).then(result => ({ result }), error => ({ error }));
  for (let index = 0; index < 4; index++) { state.progress = index; refreshAgent(); await wait(matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 470); }
  const { result, error } = await resultPromise;
  state.busy = false;
  if (error) { state.error = error.message; render(); toast(error.message, 'error'); return null; }
  state.investigation = result; applySimulation(result.simulation); state.investigations.unshift(result);
  state.selectedPlan = result.simulation.recommendedId;
  render();
  toast(state.mode === 'demo' ? 'Investigation complete. Three recovery paths are ready for review.' : 'Live assessment recorded. Review provider receipts before proceeding.');
  return result;
}

function bindSliders() {
  document.querySelectorAll('.lab-controls input, [data-action="reset-assumptions"]').forEach(element => element.disabled = state.busy);
  document.querySelector('#delay-slider')?.addEventListener('input', event => {
    state.assumptions.delay = Number(event.target.value);
    document.querySelector('#delay-value').textContent = `${state.assumptions.delay} min`;
    scheduleSimulation();
  });
  document.querySelector('#rate-slider')?.addEventListener('input', event => {
    state.assumptions.downtimeRate = Number(event.target.value);
    document.querySelector('#rate-value').textContent = `${money(state.assumptions.downtimeRate)} / min`;
    scheduleSimulation();
  });
}

function scheduleSimulation() {
  clearTimeout(simulationTimer);
  state.investigation = null;
  simulationRevision++;
  const revision = simulationRevision;
  document.querySelectorAll('[data-action="review-plan"]').forEach(element => element.disabled = true);
  simulationTimer = setTimeout(async () => {
    try {
      const result = await api('/api/simulate', { scenarioId: state.scenarioId, assumptions: state.assumptions, ...casePayload() });
      if (revision !== simulationRevision) return;
      applySimulation(result);
      if (state.page === 'futures') {
        document.querySelector('#future-chart-wrap').innerHTML = futureChart();
        document.querySelector('#plan-grid').innerHTML = planCards();
      }
    } catch (error) { toast(error.message, 'error'); }
  }, 150);
}

function showModal(content, className = '') {
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-overlay"><section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>${content}</section></div>`;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modalRoot.querySelector('input, button')?.focus());
}

function closeModal() {
  if (approvalLocked) return;
  modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); lastFocus?.focus();
}

function scenarioModal() {
  showModal(`<span class="modal-eyebrow">ONE FACTORY. THREE DIFFERENT CHALLENGES.</span><h2 id="modal-title">Choose a future to change.</h2><p class="modal-intro">Realistic situations. Explicitly synthetic data. A different decision every time.</p><div class="scenario-options">${state.scenarios.map((scenario, index) => `<button data-action="select-scenario" data-id="${scenario.id}" class="scenario-option ${state.scenarioId === scenario.id ? 'selected' : ''}"><span class="scenario-option-icon">${icon(['activity', 'eye', 'bolt'][index])}</span><div><span class="eyebrow">${scenario.category}</span><h3>${scenario.name}</h3><p>${scenario.subtitle}</p></div>${icon(state.scenarioId === scenario.id ? 'check' : 'arrow')}</button>`).join('')}</div><div class="modal-footnote">${icon('info')} No factory equipment is connected or controlled.</div>`, 'scenario-modal');
}

function evidenceModal(index) {
  const source = (state.investigation?.scenario.evidence || currentScenario().evidence)[index];
  if (!source) return;
  showModal(`<span class="modal-eyebrow">SOURCE ${safe(source.id)} · ${sourceLabel(source)}</span><h2 id="modal-title">${safe(source.title)}</h2><p class="modal-intro">${safe(source.source)}</p><div class="source-document"><div>${icon('file')} ${safe(source.section)}</div><blockquote>${safe(source.text)}</blockquote></div><div class="notice">${icon('info')}<p>Inspect source relevance yourself. A model referencing this document does not validate its contents or prove the proposed cause.</p></div>${button('Back to the evidence', 'close-modal', 'secondary full', 'arrow')}`);
}

async function reviewPlan(planId) {
  if (state.busy) return;
  if (!state.investigation) {
    const result = await investigate({ stay: true });
    if (!result) return;
  }
  const plan = state.investigation.simulation.plans.find(candidate => candidate.id === (planId || state.simulation.recommendedId));
  if (!plan) return;
  state.selectedPlan = plan.id;
  const existing = state.orders.find(order => order.investigationId === state.investigation.id);
  if (existing) { orderModal(existing); return; }
  showModal(`<span class="modal-eyebrow">HUMAN REVIEW / ${state.mode === 'demo' ? 'SIMULATED ACTION' : 'LIVE WORKFLOW REQUEST'}</span><h2 id="modal-title">A good decision needs you.</h2><p class="modal-intro">${safe(plan.name)}. ${state.mode === 'demo' ? 'This records a local demo approval. Nothing is sent to a real factory or ERP.' : 'Approval requests the configured Evolus workflow; completion is not assumed.'}</p><div class="approval-summary"><div><span>Modeled cost</span><strong>${money(plan.cost)}</strong></div><div><span>Interruption</span><strong>${number(plan.downtime)} min</strong></div><div><span>vs. baseline</span><strong class="positive">${plan.savings == null ? 'Unknown' : money(plan.savings)}</strong></div></div><div class="approval-uncertainty">${icon('alert')}<p>${safe(state.investigation.assessment.uncertainty)}</p></div><form id="approval-form"><label class="field-label" for="reviewer">Reviewing operator</label><input id="reviewer" name="reviewer" placeholder="Enter your full name" minlength="2" maxlength="100" required autocomplete="name"><div class="review-checks"><span class="field-label">${state.mode === 'demo' ? 'Acknowledge the demo review requirements' : 'Confirm all required checks'}</span>${plan.checks.map((check, index) => `<label><input type="checkbox" name="check-${index}" required><span>${safe(check)}</span></label>`).join('')}</div><div id="approval-error" role="alert"></div><button type="submit" class="button primary full" id="approve-button">${icon('shield')}<span>${state.mode === 'demo' ? 'Approve demo work order' : 'Approve & request workflow'}</span>${icon('arrow')}</button></form><div class="modal-footnote">${icon('shield')} Local acknowledgement, not verified production authorization.</div>`, 'approval-modal');
  document.querySelector('#approval-form').addEventListener('submit', submitApproval);
}

async function submitApproval(event) {
  event.preventDefault();
  if (approvalLocked) return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = document.querySelector('#approve-button');
  submit.disabled = true; submit.innerHTML = '<span class="spinner"></span> Recording decision…'; approvalLocked = true;
  try {
    const order = await api('/api/approve', { investigationId: state.investigation.id, planId: state.selectedPlan, reviewer: form.elements.reviewer.value.trim(), checks: [...form.querySelectorAll('input[type="checkbox"]')].map(input => input.checked) });
    state.orders = [order, ...state.orders.filter(previous => previous.id !== order.id)];
    approvalLocked = false; closeModal(); render(); orderModal(order);
    toast(order.status === 'dispatch_unconfirmed' ? 'Provider execution is unconfirmed. Check the workspace before retrying.' : 'Decision recorded with your review and a timestamp.', order.status === 'dispatch_unconfirmed' ? 'error' : 'info');
  } catch (error) {
    approvalLocked = false;
    document.querySelector('#approval-error').innerHTML = `<div class="inline-error">${safe(error.message)}</div>`;
    submit.disabled = false; submit.innerHTML = `${icon('shield')} Retry approval`;
  }
}

function orderModal(order) {
  const confirmed = ['demo_approved', 'submitted'].includes(order.status);
  showModal(`<div class="success-mark ${confirmed ? '' : 'unconfirmed'}">${icon(confirmed ? 'check' : 'alert')}</div><span class="modal-eyebrow">${safe(order.id)} / ${order.mode.toUpperCase()}</span><h2 id="modal-title">${order.status === 'demo_approved' ? 'Your decision. On the record.' : order.status === 'submitted' ? 'Workflow request accepted.' : 'Execution is not confirmed.'}</h2><p class="modal-intro">${order.status === 'demo_approved' ? 'Demo work order saved locally. No ERP call, purchase, or physical action has taken place.' : order.status === 'submitted' ? 'The provider accepted the request. Verify completion in the Evolus workspace.' : safe(order.error || 'Check the provider workspace before taking further action.')}</p><div class="receipt"><div><span>Approved plan</span><strong>${safe(order.plan)}</strong></div><div><span>Reviewer</span><strong>${safe(order.reviewer)}</strong></div><div><span>Recorded at</span><strong>${new Date(order.createdAt).toLocaleString('en-GB')}</strong></div><div><span>Projected value</span><strong>${order.projectedSavings == null ? 'Not comparable: diagnosis only' : money(order.projectedSavings)}</strong></div><div><span>Status</span>${pill(order.status.replaceAll('_', ' '), confirmed ? 'purple-pill' : 'amber-pill')}</div></div><div class="modal-button-row">${button('Export evidence pack', 'export-order', 'secondary', 'download', `data-id="${order.investigationId}"`)}${button('View action center', 'go-orders', 'primary', 'arrow')}</div>`, 'receipt-modal');
}

function assumptionsModal() {
  showModal(`<span class="modal-eyebrow">EXPLAINABLE, NOT MAGICAL</span><h2 id="modal-title">What’s inside the model?</h2><p class="modal-intro">This is an interpretable what-if simulator—not a validated physics twin, failure predictor, or causal inference system.</p><div class="formula-card"><code>Cost = downtime × €/min<br>+ parts + labor<br>+ scrap × €/unit<br>+ incremental kWh × €/kWh</code></div><div class="receipt">${Object.entries(state.assumptions).map(([key, value]) => `<div><span>${key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><strong>${number(value)}</strong></div>`).join('')}</div><div class="notice">${icon('info')}<p>Apply feasibility and restoration-versus-diagnosis goal priority first; then compare eligible actions by cost + assumed risk × risk weight. Waiting adds modeled interruption and scrap. The sensitivity band is cost × (12% + risk × 20%), not a statistical confidence interval. A live LLM may critique these plans, but cannot change the calculated numbers or approve them.</p></div>${button('Understood', 'close-modal', 'primary full', 'check')}`);
}

function setupModal() {
  showModal(`<span class="modal-eyebrow">FROM DEMO TO VERIFIED INTEGRATION</span><h2 id="modal-title">Your live setup checklist.</h2><p class="modal-intro">Edit the server-side <code>.env</code> file, then restart <code>npm start</code>. Never paste credentials into the frontend.</p><ol class="setup-steps"><li><strong>Serve an open model on AMD.</strong><p>The main event permits meaningful AMD Token Factory use. The Evolus prize additionally requires your own AMD-hosted vLLM model. Set <code>AMD_BASE_URL</code> and <code>AMD_API_KEY</code>; set a real <code>AMD_DEFAULT_MODEL</code> or discover one automatically.</p></li><li><strong>Connect the Evolus event workspace.</strong><p>Set <code>EVOLUS_APPLICATION_ID</code>, <code>EVOLUS_AGENT_ID</code>, and the API key. Connect the same AMD model in the workspace.</p></li><li><strong>Configure two building blocks.</strong><p>Copy verified endpoint paths into <code>EVOLUS_KNOWLEDGE_PATH</code> and <code>EVOLUS_EXTRACTOR_PATH</code>. Match the documented adapter response contracts.</p></li><li><strong>Wire a human-approved workflow.</strong><p>Set <code>EVOLUS_WORKFLOW_PATH</code>. Use a sandbox destination and enforce the supplied idempotency key in Evolus.</p></li><li><strong>Verify, don’t just configure.</strong><p>Switch to Live API, run an investigation, and inspect actual usage and workspace logs. Save real receipts for the judges.</p></li></ol><div class="modal-footnote">Full details: <code>docs/INTEGRATIONS.md</code></div>`, 'setup-modal');
}

function assessmentModal() {
  const investigation = state.investigation;
  if (!investigation) return;
  const assessment = investigation.assessment;
  const proposed = investigation.simulation.plans.find(plan => plan.id === assessment.recommendedPlanId);
  showModal(`<span class="modal-eyebrow">${investigation.mode === 'demo' ? 'DETERMINISTIC DEMO ASSESSMENT' : 'ACTUAL MODEL RESPONSE'}</span><h2 id="modal-title">Reasoning you can inspect.</h2><p class="modal-intro">${safe(assessment.provider)}${assessment.model ? ` / ${safe(assessment.model)}` : ' · No external inference'}</p><div class="source-document"><div>${icon('branch')} Reviewer proposal: ${safe(proposed?.name)}</div><blockquote>${safe(assessment.rationale)}</blockquote></div><div class="approval-uncertainty">${icon('alert')}<p>${safe(assessment.uncertainty)}</p></div><div class="receipt"><div><span>Evidence referenced</span><strong>${assessment.evidenceIds.map(safe).join(', ')}</strong></div><div><span>API latency</span><strong>${assessment.latencyMs === null ? 'Not applicable in demo' : `${assessment.latencyMs} ms`}</strong></div><div><span>Output tokens</span><strong>${assessment.usage?.completionTokens ?? 'Not reported'}</strong></div>${investigation.blocks.map(block => `<div><span>${safe(block.name)}</span><strong>${safe(block.status)}<br><small>${safe(block.detail)}</small></strong></div>`).join('')}</div><div class="notice">${icon('info')}<p>The numerical ranking is deterministic. A model proposal is a separate opinion to review, not permission to act.</p></div>${button('Return to the decision', 'close-modal', 'secondary full', 'arrow')}`);
}

function commandModal() {
  if (approvalLocked) return;
  showModal(`<span class="modal-eyebrow">FIND YOUR NEXT MOVE</span><h2 id="modal-title">Where would you like to go?</h2><input id="command-search" type="search" placeholder="Search pages and actions…" aria-label="Search commands"><div id="command-results">${[
    ['intake', 'file', 'Upload and challenge the evidence'], ['overview', 'grid', 'Mission control'], ['twin', 'cube', 'Explore the digital twin'], ['futures', 'branch', 'Compare recovery futures'], ['orders', 'shield', 'Review recorded decisions'], ['evidence', 'book', 'Inspect source evidence'], ['settings', 'settings', 'Configure AMD & Evolus'], ['scenario', 'layers', 'Switch demonstration scenario']
  ].map(([action, symbol, label]) => `<button data-action="command-go" data-value="${action}" class="command-result">${icon(symbol)}<span>${label}</span>${icon('arrow')}</button>`).join('')}</div>`);
  document.querySelector('#command-search').addEventListener('input', event => {
    document.querySelectorAll('.command-result').forEach(element => element.hidden = !element.textContent.toLowerCase().includes(event.target.value.toLowerCase()));
  });
  document.querySelector('#command-search').focus();
}

const guideSteps = [
  { title: 'The alarm is not the explanation.', text: 'A synthetic motor alarm may have an upstream cause. The system starts with competing explanations, not a preapproved repair. No factory equipment is controlled.', page: 'overview', label: 'Change the evidence' },
  { title: 'Let the jury choose the case.', text: 'Open the evidence studio: eight reproducible cases include missing parts, contradictory readings, a drive fault, nominal data and a safety hold. You can also upload your own CSV and reference text.', page: 'intake', label: 'Ask a better question' },
  { title: 'One observation changes the decision.', text: 'In the pressure-leak case, choose “Leak independently confirmed.” A repair becomes eligible. Set stock to zero: it is blocked. Restore stock before investigating. Synthetic observations are what-ifs, not performed tests.', page: 'futures', label: 'Inspect the evidence' },
  { title: 'Trust is designed into the workflow.', text: 'Inspect the source lines. Return to the lab, run an investigation and review an eligible action. Human acknowledgement creates a demo work order and a hash-chained audit event—not machine authorization.', page: 'evidence', label: 'Make a decision' }
];

function renderGuide() {
  document.querySelector('.guide-card')?.remove();
  const step = guideSteps[state.guideStep];
  if (!step) return;
  const card = document.createElement('aside'); card.className = 'guide-card'; card.setAttribute('aria-label', 'Demo walkthrough');
  card.innerHTML = `<div class="guide-top"><span class="eyebrow">THE NEXUSFORGE STORY / 0${state.guideStep + 1}</span><button class="icon-button" data-action="end-guide" aria-label="End walkthrough">${icon('close')}</button></div><h3>${step.title}</h3><p>${step.text}</p><div class="guide-bottom"><div class="guide-dots">${guideSteps.map((_, index) => `<i class="${index === state.guideStep ? 'active' : ''}"></i>`).join('')}</div>${button(step.label, 'next-guide', 'primary small-button', 'arrow')}</div>`;
  document.body.append(card);
}

async function exportReport(id) {
  const report = await api(`/api/report/${encodeURIComponent(id)}`);
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `nexusforge-evidence-${id.slice(0, 8)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Evidence pack exported with assumptions, provenance, and the approval receipt.');
}

const actions = {
  ...studio.actions,
  overview: () => navigate('overview'), futures: () => navigate('futures'), evidence: () => navigate('evidence'),
  scenario: scenarioModal, 'select-scenario': element => setScenario(element.dataset.id),
  investigate: () => investigate(), review: () => reviewPlan(), 'review-plan': element => reviewPlan(element.dataset.id),
  'close-modal': closeModal, 'evidence-detail': element => evidenceModal(Number(element.dataset.index)),
  asset: element => selectAsset(element.dataset.id),
  layer: element => { state.layer = element.dataset.value; if (twin) twin.layer = state.layer; document.querySelectorAll('[data-action="layer"]').forEach(button => { button.classList.toggle('active', button === element); button.setAttribute('aria-pressed', String(button === element)); }); },
  'zoom-in': () => twin?.setZoom(twin.zoom + 0.15), 'zoom-out': () => twin?.setZoom(twin.zoom - 0.15), 'reset-view': () => twin?.reset(),
  expand: () => navigate(state.page === 'twin' ? 'overview' : 'twin'),
  'toggle-play': element => { state.playing = !state.playing; if (twin) twin.playing = state.playing; element.innerHTML = icon(state.playing ? 'pause' : 'play'); element.setAttribute('aria-label', `${state.playing ? 'Pause' : 'Play'} visualization`); },
  assumptions: assumptionsModal,
  assessment: assessmentModal,
  'reset-assumptions': async () => { if (state.busy) return; clearTimeout(simulationTimer); const revision = ++simulationRevision; state.assumptions = { ...state.defaultAssumptions }; state.investigation = null; const result = await api('/api/simulate', { scenarioId: state.scenarioId, assumptions: state.assumptions, ...casePayload() }); if (revision !== simulationRevision) return; applySimulation(result); render(); },
  'order-detail': element => orderModal(state.orders.find(order => order.id === element.dataset.id)),
  'go-orders': () => { closeModal(); navigate('orders'); },
  'export-order': element => exportReport(element.dataset.id),
  'refresh-audit': refreshAudit,
  'refresh-settings': async () => { state.integrations = await api('/api/integrations'); render(); toast('Configuration refreshed. Reachability is verified only by actual calls.'); },
  mode: element => { if (state.busy) { toast('Wait for the current investigation to finish.'); return; } state.mode = element.dataset.value; state.investigation = null; state.error = null; render(); toast(state.mode === 'demo' ? 'Local demo mode. No external requests.' : 'Live API selected. Input provenance remains visible.'); },
  setup: setupModal, command: commandModal,
  'command-go': element => { closeModal(); element.dataset.value === 'scenario' ? scenarioModal() : navigate(element.dataset.value); },
  alerts: () => { navigate('overview'); toast(currentScenario().signal); },
  about: () => showModal(`<span class="modal-eyebrow">NEXUSFORGE / VERSION 2.0</span><h2 id="modal-title">Intelligence with a point of view.</h2><p class="modal-intro">A decision-first industrial prototype for the AMD Developer Hackathon: ACT III. Built around one belief: the best autonomous system knows where human judgment belongs.</p><div class="about-principles"><div>${icon('branch')} Compare, don’t just predict.</div><div>${icon('book')} Show evidence, not invented confidence.</div><div>${icon('shield')} Propose freely. Act with approval.</div></div><div class="notice">${icon('info')}<p>This is a local, single-operator demo with synthetic factory data. It has no machine-control connection, verified user identity, or production safety certification.</p></div>`),
  menu: () => { state.menuOpen = !state.menuOpen; document.querySelector('.sidebar').classList.toggle('mobile-open', state.menuOpen); },
  guide: () => { state.guideStep = 0; state.page = 'overview'; history.replaceState(null, '', '#overview'); render(); },
  'next-guide': () => { state.guideStep++; if (state.guideStep >= guideSteps.length) { state.guideStep = -1; document.querySelector('.guide-card')?.remove(); navigate('futures'); toast('Choose a recovery plan and make the final call.'); } else { state.page = guideSteps[state.guideStep].page; history.replaceState(null, '', `#${state.page}`); render(); } },
  'end-guide': () => { state.guideStep = -1; document.querySelector('.guide-card')?.remove(); }
};

document.addEventListener('click', async event => {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement && !actionElement.disabled) {
    try { await actions[actionElement.dataset.action]?.(actionElement); } catch (error) { toast(error.message, 'error'); }
  }
  if (event.target.classList.contains('modal-overlay')) closeModal();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); commandModal(); }
  if (event.key === 'Escape') { closeModal(); state.menuOpen = false; document.querySelector('.sidebar')?.classList.remove('mobile-open'); }
  if (event.key === 'Tab' && modalRoot.firstChild) {
    const focusable = [...modalRoot.querySelectorAll('button:not(:disabled), input, a[href], [tabindex="0"]')].filter(element => !element.hidden && element.offsetParent !== null);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

window.addEventListener('hashchange', async () => {
  state.page = location.hash.slice(1) || 'overview'; state.menuOpen = false;
  if (!state.scenarios.length) return;
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
  if (state.page === 'audit') { try { await refreshAudit(); } catch (error) { toast(error.message, 'error'); } }
});

async function boot() {
  try {
    const data = await api('/api/bootstrap');
    Object.assign(state, { assets: data.assets, scenarios: data.scenarios, orders: data.orders, investigations: data.investigations, integrations: data.integrations, defaultAssumptions: data.defaultAssumptions, assumptions: { ...data.defaultAssumptions } });
    Object.assign(state, { sampleCases: data.sampleCases || [], cases: data.cases || [], defaultCaseIds: data.defaultCaseIds || {}, caseId: data.defaultCaseIds?.pressure || null });
    applySimulation(await api('/api/simulate', { scenarioId: state.scenarioId, assumptions: state.assumptions, ...casePayload() }));
    render();
    if (state.page === 'audit') await refreshAudit();
  } catch (error) {
    app.innerHTML = `<div class="boot-screen"><div class="boot-mark">N<span>›</span></div><h1>Let’s reconnect.</h1><p>${safe(error.message)}</p><button class="button primary" id="retry-boot">Retry connection</button></div>`;
    document.querySelector('#retry-boot').addEventListener('click', boot);
  }
}

setInterval(() => { const clock = document.querySelector('#clock'); if (clock) clock.textContent = time(Date.now()); }, 1000);
boot();
