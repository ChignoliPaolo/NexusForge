const standaloneStorageKey = 'nexusforge-standalone-v3';
let standaloneState = { investigations: {}, orders: {}, cases: {}, events: [] };
let standalonePersistent = true;
try {
  const saved = JSON.parse(localStorage.getItem(standaloneStorageKey) || 'null');
  if (saved && typeof saved.investigations === 'object' && typeof saved.orders === 'object' && Array.isArray(saved.events)) standaloneState = { ...saved, cases: saved.cases || {} };
} catch { standalonePersistent = false; }

function standalonePersist() {
  try { localStorage.setItem(standaloneStorageKey, JSON.stringify(standaloneState)); } catch { standalonePersistent = false; }
}

async function standaloneHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

let standaloneIntegrity = { valid: true, count: 0, head: 'GENESIS' };
let standaloneQueue = Promise.resolve();
async function standaloneVerify() {
  let previous = 'GENESIS';
  for (const event of standaloneState.events) {
    const { id, time, kind, body, previous_hash } = event;
    if (event.previous_hash !== previous || event.hash !== await standaloneHash({ id, time, kind, body, previous_hash })) {
      standaloneIntegrity = { valid: false, count: standaloneState.events.length };
      return;
    }
    previous = event.hash;
  }
  standaloneIntegrity = { valid: true, count: standaloneState.events.length, head: previous };
}

const standaloneReady = standaloneVerify();
const standaloneStore = {
  saveCase(value) { standaloneState.cases[value.id] = structuredClone(value); standalonePersist(); return value; },
  case(id) { return standaloneState.cases[id] ? structuredClone(standaloneState.cases[id]) : null; },
  cases() { return Object.values(standaloneState.cases).reverse(); },
  saveInvestigation(value) { standaloneState.investigations[value.id] = structuredClone(value); standalonePersist(); return value; },
  investigation(id) { return standaloneState.investigations[id] ? structuredClone(standaloneState.investigations[id]) : null; },
  investigations() { return Object.values(standaloneState.investigations).reverse().slice(0, 50); },
  saveOrder(value) { standaloneState.orders[value.id] = structuredClone(value); standalonePersist(); return value; },
  orderFor(id) { return Object.values(standaloneState.orders).find(order => order.investigationId === id) || null; },
  orders() { return Object.values(standaloneState.orders).reverse(); },
  audit(kind, data) {
    standaloneQueue = standaloneQueue.then(async () => {
      const previous = standaloneState.events.at(-1)?.hash || 'GENESIS';
      const event = { id: crypto.randomUUID(), time: new Date().toISOString(), kind, body: JSON.stringify(data), previous_hash: previous };
      const hash = await standaloneHash(event);
      standaloneState.events.push({ ...event, hash, data, sequence: standaloneState.events.length + 1 });
      standalonePersist();
      await standaloneVerify();
    });
  },
  auditLog() { return [...standaloneState.events].reverse().slice(0, 200); },
  verifyAudit() { return standaloneIntegrity; }
};

const standaloneProviderError = async () => { throw Object.assign(new Error('Standalone preview is offline-only. Run npm start and configure the server to use real AMD/Evolus providers.'), { status: 503 }); };
const standaloneService = createService(standaloneStore, { knowledge: standaloneProviderError, extract: standaloneProviderError, assess: standaloneProviderError, dispatch: standaloneProviderError });
const standaloneConnections = {
  amd: { configured: false, status: 'Server required for live mode', missing: ['AMD_API_KEY', 'AMD_BASE_URL', 'AMD_DEFAULT_MODEL'], model: null },
  evolus: { configured: false, status: 'Server required for live mode', missing: ['EVOLUS_API_KEY', 'EVOLUS_APPLICATION_ID', 'EVOLUS_AGENT_ID', 'EVOLUS_KNOWLEDGE_PATH', 'EVOLUS_EXTRACTOR_PATH', 'EVOLUS_WORKFLOW_PATH'] },
  telemetry: { gpuUtilization: null, tokensPerSecond: null, note: 'Standalone preview: no external calls.' }
};

globalThis.fetch = async (path, options = {}) => {
  try {
    await standaloneReady;
    const input = options.body ? JSON.parse(options.body) : {};
    let result;
    let status = 200;
    if (path === '/api/bootstrap') result = { assets, scenarios, sampleCases, defaultCaseIds, cases: standaloneStore.cases(), defaultAssumptions, integrations: standaloneConnections, orders: standaloneStore.orders(), investigations: standaloneStore.investigations() };
    else if (path === '/api/health') result = { status: 'ok', mode: 'standalone-demo' };
    else if (path === '/api/simulate') result = standaloneService.preview(input);
    else if (path === '/api/cases') { result = standaloneService.intake(input); status = 201; }
    else if (path === '/api/evaluation') result = runEvaluation();
    else if (path === '/api/providers/verify') result = { status: 'offline_only', note: 'Use npm run verify:live from the full application on a connected laptop.' };
    else if (path === '/api/investigations') { result = await standaloneService.investigate(input); status = 201; }
    else if (path === '/api/approve') result = await standaloneService.approve(input);
    else if (path === '/api/orders') result = standaloneStore.orders();
    else if (path === '/api/integrations') result = standaloneConnections;
    else if (path === '/api/audit') { await standaloneVerify(); result = { events: standaloneStore.auditLog(), integrity: standaloneStore.verifyAudit() }; }
    else if (String(path).startsWith('/api/report/')) {
      const investigation = standaloneStore.investigation(String(path).split('/').pop());
      if (!investigation) throw Object.assign(new Error('Investigation not found.'), { status: 404 });
      result = { ...investigation, order: standaloneStore.orderFor(investigation.id), disclosure: `Standalone offline preview. ${investigation.inputEvidence?.provenance === 'user_supplied' ? 'User-supplied evidence; authenticity unverified.' : 'Synthetic data.'} Browser-local storage, no external calls or machine control.`, auditIntegrity: standaloneStore.verifyAudit() };
    } else throw Object.assign(new Error('Standalone route not found.'), { status: 404 });
    await standaloneQueue;
    return new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500, headers: { 'Content-Type': 'application/json' } });
  }
};

setTimeout(() => {
  toast(standalonePersistent ? 'Standalone demo · browser-local records · no server or external calls.' : 'Browser storage is unavailable. This standalone session is temporary.');
}, 1200);
