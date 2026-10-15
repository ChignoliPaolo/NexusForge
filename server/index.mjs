import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readConfig, integrationStatus, projectRoot } from './config.mjs';
import { assets, scenarios } from './scenarios.mjs';
import { simulate, defaultAssumptions } from './engine.mjs';
import { createStore } from './store.mjs';
import { createIntegrations } from './integrations.mjs';
import { createService } from './service.mjs';
import { sampleCases, defaultCaseIds } from './samples.mjs';
import { runEvaluation } from './evaluation.mjs';

export function createApp(config = readConfig(), dependencies = {}) {
  const store = dependencies.store || createStore(config.dbPath);
  const integrations = dependencies.integrations || createIntegrations(config);
  const service = createService(store, integrations);
  const limits = new Map();
  let activeInvestigations = 0;
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const headers = {
      'X-Request-Id': requestId, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Cache-Control': 'no-store'
    };
    const json = (status, data) => { response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };
    try {
      let hostname;
      try { hostname = new URL(`http://${request.headers.host}`).hostname.toLowerCase(); } catch { return json(400, { error: 'Invalid Host header.' }); }
      const isAllowedHost = config.allowedHosts.includes('*') || config.allowedHosts.includes(hostname) || hostname.endsWith('.trycloudflare.com') || hostname.endsWith('.loca.lt') || hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.ngrok.io');
      if (!isAllowedHost) return json(403, { error: 'Host is not allowed. Use localhost or the configured trusted hostname.' });
      const url = new URL(request.url, 'http://localhost');
      if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
      if (request.method === 'POST') {
        const origin = request.headers.origin;
        if (origin) {
          try {
            if (!['http:', 'https:'].includes(new URL(origin).protocol) || new URL(origin).host !== request.headers.host) return json(403, { error: 'Cross-origin requests are not allowed.' });
          } catch { return json(403, { error: 'Invalid request origin.' }); }
        }
        if (!request.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Use application/json.' });
        const address = request.socket.remoteAddress;
        const now = Date.now();
        if (limits.size > 1000) for (const [key, value] of limits) if (now - value.start > 60000) limits.delete(key);
        let limit = limits.get(address);
        if (!limit || now - limit.start > 60000) { limit = { start: now, count: 0 }; limits.set(address, limit); }
        if (++limit.count > 60) return json(429, { error: 'Too many requests. Please wait a minute.' });
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 262144) return json(413, { error: 'Request body exceeds 256 KB.' });
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { error: 'Invalid JSON body.' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400, { error: 'Request body must be an object.' });
        if (url.pathname === '/api/simulate') return json(200, service.preview(input));
        if (url.pathname === '/api/cases') return json(201, service.intake(input));
        if (url.pathname === '/api/providers/verify') return json(200, await integrations.verify());
        if (url.pathname === '/api/investigations') {
          if (activeInvestigations >= 3) return json(429, { error: 'Three investigations are already running. Please wait.' });
          activeInvestigations++;
          try { return json(201, await service.investigate(input)); } finally { activeInvestigations--; }
        }
        if (url.pathname === '/api/approve') return json(200, await service.approve(input));
        return json(404, { error: 'Endpoint not found.' });
      }
      if (url.pathname === '/api/health') return json(200, { status: 'ok', version: '3.0.0', mode: 'demo-first', time: new Date().toISOString() });
      if (url.pathname === '/api/bootstrap') return json(200, { assets, scenarios, sampleCases, defaultCaseIds, cases: store.cases(), defaultAssumptions, integrations: integrationStatus(config), orders: store.orders(), investigations: store.investigations() });
      if (url.pathname === '/api/evaluation') return json(200, runEvaluation());
      if (url.pathname === '/api/integrations') return json(200, integrationStatus(config));
      if (url.pathname === '/api/audit') return json(200, { events: store.auditLog(), integrity: store.verifyAudit() });
      if (url.pathname === '/api/orders') return json(200, store.orders());
      if (url.pathname.startsWith('/api/report/')) {
        const investigation = store.investigation(url.pathname.split('/').pop());
        if (!investigation) return json(404, { error: 'Investigation not found.' });
        const provenance = investigation.inputEvidence?.provenance === 'user_supplied' ? 'Operator-supplied evidence; authenticity is unverified.' : 'Synthetic demonstration data.';
        return json(200, { ...investigation, order: store.orderFor(investigation.id), disclosure: `${provenance} Model-derived hypotheses require qualified review. Savings are simulated, not realized.`, auditIntegrity: store.verifyAudit() });
      }
      if (url.pathname === '/slides') {
        const file = await readFile(resolve(projectRoot, 'presentation', 'NexusForge-Pitch-v2.html'));
        response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(file);
      }
      if (url.pathname === '/presentation/NexusForge-Cover.png') {
        const file = await readFile(resolve(projectRoot, 'presentation', 'NexusForge-Cover.png'));
        response.writeHead(200, { ...headers, 'Content-Type': 'image/png' });
        return response.end(file);
      }
      const allowed = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/studio.js': 'studio.js', '/twin.js': 'twin.js', '/icons.js': 'icons.js', '/favicon.svg': 'favicon.svg' };
      if (!allowed[url.pathname]) return json(404, { error: 'Not found.' });
      const file = await readFile(resolve(projectRoot, 'frontend', allowed[url.pathname]));
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      response.writeHead(200, { ...headers, 'Content-Type': `${mime[extname(allowed[url.pathname])]}; charset=utf-8` });
      response.end(file);
    } catch (error) {
      if (!response.headersSent) json(error.status || 500, { error: error.status ? error.message : 'An unexpected error occurred. No external action is confirmed.', requestId });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = readConfig();
  const { server, store } = createApp(config);
  server.on('error', error => {
    console.error(error.code === 'EPERM' ? 'Local server ports are blocked in this sandbox. Run npm start from your normal terminal.' : `Cannot start the server (${error.code}). Check HOST and PORT or choose an unused port.`);
    store.close();
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => console.log(`\n  NEXUSFORGE / Industrial Decision Twin\n  http://${config.host}:${config.port}\n  Synthetic demo enabled. External integrations never silently simulated.\n`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
