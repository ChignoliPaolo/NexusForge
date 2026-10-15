import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function readConfig(environment = process.env) {
  return {
    host: environment.HOST || '127.0.0.1', port: Number(environment.PORT || 8000),
    allowedHosts: (environment.NEXUS_ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map(host => host.trim().toLowerCase()),
    dbPath: environment.NEXUS_DB_PATH || resolve(projectRoot, 'runtime/nexus.sqlite'),
    amd: { key: environment.AMD_API_KEY || '', baseUrl: environment.AMD_BASE_URL || '', model: environment.AMD_DEFAULT_MODEL || '' },
    evolus: {
      key: environment.EVOLUS_API_KEY || '', applicationId: environment.EVOLUS_APPLICATION_ID || '',
      baseUrl: environment.EVOLUS_BASE_URL || 'https://api.evolus.ai/api/v1',
      chatUrl: environment.EVOLUS_OPENAI_URL || 'https://api.evolus.ai/v1', agentId: environment.EVOLUS_AGENT_ID || '',
      knowledgePath: environment.EVOLUS_KNOWLEDGE_PATH || '', extractorPath: environment.EVOLUS_EXTRACTOR_PATH || '',
      workflowPath: environment.EVOLUS_WORKFLOW_PATH || ''
    }
  };
}

export function integrationStatus(config) {
  const amdMissing = Object.entries({ AMD_API_KEY: config.amd.key, AMD_BASE_URL: config.amd.baseUrl }).filter(([, value]) => !value).map(([name]) => name);
  const evolusMissing = Object.entries({ EVOLUS_API_KEY: config.evolus.key, EVOLUS_APPLICATION_ID: config.evolus.applicationId, EVOLUS_AGENT_ID: config.evolus.agentId, EVOLUS_WORKFLOW_PATH: config.evolus.workflowPath }).filter(([, value]) => !value).map(([name]) => name);
  return {
    amd: { configured: !amdMissing.length, status: amdMissing.length ? 'Setup required' : config.amd.model ? 'Configured · not verified' : 'Ready for model discovery', missing: amdMissing, model: config.amd.model || null, modelDiscovery: !config.amd.model },
    evolus: { configured: !evolusMissing.length, status: evolusMissing.length ? 'Setup required' : 'Configured · ready', missing: evolusMissing },
    telemetry: { gpuUtilization: null, tokensPerSecond: null, note: 'No hardware telemetry is exposed by this application. API timings appear only after an actual request.' }
  };
}
