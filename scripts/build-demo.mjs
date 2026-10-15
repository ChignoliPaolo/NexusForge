import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from '../server/config.mjs';

const read = path => readFileSync(resolve(projectRoot, path), 'utf8');
const moduleBody = path => read(path).replace(/^import .+;\r?\n/gm, '').replace(/^export /gm, '');
const favicon = `data:image/svg+xml;base64,${Buffer.from(read('frontend/favicon.svg')).toString('base64')}`;
const code = [
  'const randomUUID = () => crypto.randomUUID();',
  moduleBody('server/scenarios.mjs'),
  moduleBody('server/engine.mjs'),
  moduleBody('server/evidence.mjs'),
  moduleBody('server/samples.mjs'),
  moduleBody('server/decision.mjs'),
  moduleBody('server/evaluation.mjs'),
  moduleBody('server/service.mjs'),
  moduleBody('frontend/icons.js'),
  'const safe = escapeHtml;',
  moduleBody('frontend/twin.js'),
  moduleBody('frontend/studio.js'),
  moduleBody('frontend/standalone.js'),
  moduleBody('frontend/app.js')
].join('\n\n').replaceAll('src="/favicon.svg"', `src="${favicon}"`).replaceAll('</script', '<\\/script');
const html = read('frontend/index.html')
  .replace('<link rel="icon" type="image/svg+xml" href="/favicon.svg">', `<link rel="icon" href="${favicon}">`)
  .replace('<link rel="stylesheet" href="/style.css">', `<style>${read('frontend/style.css')}</style>`)
  .replace('<script type="module" src="/app.js"></script>', '')
  .replace('</body>', `<script type="module">${code}</script>\n</body>`);
writeFileSync(resolve(projectRoot, 'NexusForge-demo.html'), html);
console.log(`Built NexusForge-demo.html (${Math.round(Buffer.byteLength(html) / 1024)} KB). No credentials or external resources included.`);
