import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig, projectRoot, integrationStatus } from '../server/config.mjs';
import { createIntegrations } from '../server/integrations.mjs';
import { createStore } from '../server/store.mjs';
import { createService } from '../server/service.mjs';

const config = readConfig();
const integrations = createIntegrations(config);
const store = createStore(':memory:');
const directory = resolve(projectRoot, 'evidence');
const privateDirectory = resolve(projectRoot, 'runtime');
mkdirSync(directory, { recursive: true });
mkdirSync(privateDirectory, { recursive: true });
const receipt = { checkedAt: new Date().toISOString(), status: 'unverified', configuration: integrationStatus(config), model: null, blocks: [], workflowExecuted: false, safety: 'This command never approves a work order or invokes a business workflow.' };
const discovery = { checkedAt: receipt.checkedAt, tools: [], applications: [], errors: [] };
const redact = value => String(value).replaceAll(config.amd.key || 'UNLIKELY_NO_SECRET_AMD', '[REDACTED]').replaceAll(config.evolus.key || 'UNLIKELY_NO_SECRET_EVOLUS', '[REDACTED]');

async function discoverEvolus() {
  if (!config.evolus.key) { discovery.errors.push('EVOLUS_API_KEY missing.'); return; }
  const origin = new URL(config.evolus.baseUrl).origin;
  const url = `${origin}/mcp`;
  const headers = { 'X-ApiKey': config.evolus.key, ...(config.evolus.applicationId ? { 'X-Application-Id': config.evolus.applicationId } : {}), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  async function rpc(method, params, id) {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }), signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new Error(`Evolus MCP returned HTTP ${response.status}. Check the application header and workspace configuration.`);
    const session = response.headers.get('mcp-session-id'); if (session) headers['Mcp-Session-Id'] = session;
    if (id === undefined) return null;
    const text = await response.text();
    if (text.length > 1500000) throw new Error('MCP discovery response exceeds the safety limit.');
    let body;
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const messages = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => { try { return JSON.parse(line.slice(5).trim()); } catch { return null; } });
      body = messages.find(message => message?.id === id);
    } else body = JSON.parse(text);
    if (!body || body.error) throw new Error('MCP request was not accepted. Inspect the workspace’s interactive API reference.');
    return body.result;
  }
  try {
    const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'nexusforge-readonly-verifier', version: '3.0.0' } }, 1);
    if (initialized?.protocolVersion) headers['MCP-Protocol-Version'] = initialized.protocolVersion;
    await rpc('notifications/initialized', {}, undefined);
    const tools = await rpc('tools/list', {}, 2);
    discovery.tools = (tools?.tools || []).slice(0, 200).map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations }));
    const listTool = discovery.tools.find(tool => /^(list|get)[_-]?(applications|workspaces)$/i.test(tool.name) && !(tool.inputSchema?.required?.length));
    if (listTool) discovery.applications = await rpc('tools/call', { name: listTool.name, arguments: {} }, 3);
    discovery.status = 'mcp_catalog_retrieved';
  } catch (error) { discovery.status = 'unverified'; discovery.errors.push(redact(error.cause?.code ? `Network failure: ${error.cause.code}` : error.message)); }
}

try {
  console.log('NexusForge live verification. Keys are never printed. No workflow will execute.');
  await discoverEvolus();
  const preflight = await integrations.verify();
  receipt.preflight = preflight;
  if (preflight.checks.amd.status !== 'unverified' || (config.evolus.agentId && config.evolus.applicationId)) {
    const service = createService(store, integrations);
    const result = await service.investigate({ scenarioId: 'pressure', caseId: 'pressure-leak', mode: 'live', constraints: { testResult: 'leak_confirmed' }, note: 'Bounded integration test with synthetic inputs. No production action is permitted.' });
    receipt.model = result.assessment;
    receipt.blocks = result.blocks;
    receipt.status = result.blocks.every(block => block.status === 'completed') ? 'live_investigation_verified_workflow_not_tested' : 'live_model_verified_evolus_incomplete';
    receipt.decision = { planId: result.assessment.recommendedPlanId, caseId: result.caseId, inputProvenance: 'synthetic', planningSource: result.simulation.planningSource };
    if (process.argv.includes('--save-discovered-model') && !config.amd.model && receipt.model.provider === 'Configured AMD endpoint') {
      const path = resolve(projectRoot, '.env');
      const existing = readFileSync(path, 'utf8');
      const model = await integrations.discoverModel();
      if (!/[\r\n]/.test(model)) writeFileSync(path, existing.replace(/^AMD_DEFAULT_MODEL=.*\r?\n?/gm, '') + `\nAMD_DEFAULT_MODEL=${model}\n`, { mode: 0o600 });
    }
  } else receipt.error = preflight.checks.amd.error;
} catch (error) { receipt.error = redact(error.message); }
finally {
  store.close();
  writeFileSync(resolve(privateDirectory, 'evolus-discovery.json'), redact(JSON.stringify(discovery, null, 2)), { mode: 0o600 });
  writeFileSync(resolve(directory, 'live-verification.json'), redact(JSON.stringify(receipt, null, 2)));
  console.log(`Result: ${receipt.status}`);
  console.log(`AMD: ${receipt.model ? receipt.model.model : receipt.error || 'not verified'}`);
  console.log(`Evolus discovery: ${discovery.status || 'not configured'}`);
  console.log('Receipts: evidence/live-verification.json; private schemas: runtime/evolus-discovery.json');
  if (receipt.status === 'unverified') process.exitCode = 2;
}
