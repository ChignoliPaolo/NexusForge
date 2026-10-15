import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { randomBytes, createCipheriv, scryptSync, createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { projectRoot } from '../server/config.mjs';

const output = resolve(projectRoot, '../deliverables');
mkdirSync(output, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit++) current = current & 1 ? 0xedb88320 ^ current >>> 1 : current >>> 1;
  return current >>> 0;
});
const crc32 = data => { let current = 0xffffffff; for (const byte of data) current = crcTable[(current ^ byte) & 255] ^ current >>> 8; return (current ^ 0xffffffff) >>> 0; };

function zip(entries) {
  const bodies = [], directory = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const filename = Buffer.from(name);
    const raw = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    const compressed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x0021, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x0021, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    bodies.push(local, filename, compressed); directory.push(central, filename); offset += local.length + filename.length + compressed.length;
  }
  const centralBody = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBody.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, centralBody, end]);
}

const excluded = new Set(['.env', '.env.transfer', 'runtime', 'artifacts', 'node_modules', '.git', '.DS_Store']);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name) || entry.name.startsWith('.env.') && entry.name !== '.env.example') return [];
    const path = resolve(directory, entry.name);
    const local = relative(projectRoot, path).replaceAll('\\', '/');
    if (local.startsWith('presentation/previews/') || local.startsWith('presentation/artwork/')) return [];
    if (entry.isDirectory()) return files(path);
    if (!entry.isFile() || /\.zip$/.test(entry.name)) return [];
    return [path];
  });
}

const environment = readFileSync(resolve(projectRoot, '.env'), 'utf8');
const secrets = environment.split(/\r?\n/).filter(line => /^(AMD_API_KEY|EVOLUS_API_KEY)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
if (secrets.length !== 2) throw new Error('Both provider keys must be present in the private .env before creating the requested transfer package.');
const manifest = { format: 1, version: '3.0.0', createdAt: new Date().toISOString(), files: [] };
const entries = [];
for (const path of files(projectRoot)) {
  const target = relative(projectRoot, path).replaceAll('\\', '/');
  const source = target === 'presentation/NexusForge-Pitch.pdf' ? 'PRESENTATION/NexusForge-Pitch.pdf' : `payload/${target}.txt`;
  const contents = readFileSync(path);
  if (secrets.some(secret => contents.includes(Buffer.from(secret)))) throw new Error(`Refusing to package a plaintext credential in ${target}.`);
  entries.push([source, contents]);
  manifest.files.push({ path: target, source, sha256: createHash('sha256').update(contents).digest('hex'), bytes: contents.length });
}
if (!manifest.files.some(entry => entry.path === 'presentation/NexusForge-Pitch.pdf')) throw new Error('Create the PDF presentation before packaging.');
const instructions = `NEXUSFORGE 3.0 — MAIL-SAFE TRANSFER\n\n1. Extract this entire ZIP to a local folder.\n2. Open PRESENTATION/NexusForge-Pitch.pdf to review the six-slide pitch.\n3. Install Node.js 24 or later if it is not already available. No npm install is needed.\n4. Rename RESTORE.cjs.txt to RESTORE.cjs (show file extensions first).\n5. Open a terminal in this extracted folder and run: node RESTORE.cjs\n6. If asked, enter the private passphrase received through a separate channel. It is NOT in the archive. Enter skips credentials and enables demo-only use.\n7. Run: cd nexusforge\n   Then: npm test\n   Then: npm start\n8. Open http://localhost:8000\n\nOFFLINE PREVIEW: copy payload/NexusForge-demo.html.txt to a new NexusForge-demo.html file and open it in Chrome, Edge, Firefox or Safari. No Node, network or credentials are needed for this fallback.\n\nLIVE CHECK: from the restored project run npm run verify:live. It performs one bounded synthetic investigation if a real model is reachable, discovers available Evolus MCP schemas when permitted, writes truthful receipts, and NEVER executes a workflow. Configure remaining Evolus workspace IDs and block paths from the actual workspace reference.\n\nPRIVATE VARIANT: the two supplied API keys are inside PRIVATE_ENV.aesgcm.json.txt, encrypted with AES-256-GCM and a scrypt-derived key. Send the passphrase separately; do not publish this archive. Rotate both keys after transfer because they were previously shared in source/chat. The PUBLIC variant contains no credentials or encrypted credential envelope.\n\nThe mail-safe payload uses .txt extensions for source files. Restore verifies SHA-256 file hashes before writing. Individual email providers may still reject ZIPs; a .txt convention cannot guarantee delivery.\n\nAll supplied factory evidence is synthetic and labeled. Source code and functional tests are real. Actual AMD/Evolus usage, external-workflow completion, public deployment and submission eligibility are not implied by this package.\n`;
entries.push(['OPEN_THIS_FIRST.txt', instructions], ['RESTORE.cjs.txt', readFileSync(resolve(projectRoot, 'scripts/restore-template.cjs'))], ['MANIFEST.json.txt', JSON.stringify(manifest, null, 2)]);
const publicPath = resolve(output, 'NexusForge-PUBLIC-mailsafe.zip');
writeFileSync(publicPath, zip(entries));
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 67108864 });
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(environment, 'utf8'), cipher.final()]);
const envelope = { version: 1, cipher: 'aes-256-gcm', kdf: 'scrypt', N: 32768, r: 8, p: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
const privatePath = resolve(output, 'NexusForge-PRIVATE-mailsafe.zip');
writeFileSync(privatePath, zip([...entries, ['PRIVATE_ENV.aesgcm.json.txt', JSON.stringify(envelope, null, 2)]]), { mode: 0o600 });
writeFileSync(resolve(output, 'TRANSFER_PASSWORD.txt'), `PRIVATE NEXUSFORGE TRANSFER\n\nPassphrase: ${password}\n\nSend this passphrase through a separate secure channel. Do not attach it to the same email as the PRIVATE archive. The archive contains the supplied API keys encrypted, not in source code.\n`, { mode: 0o600 });
const sums = [publicPath, privatePath].map(path => `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${relative(output, path)}`).join('\n');
writeFileSync(resolve(output, 'SHA256SUMS.txt'), sums + '\n');
console.log(`Created public and encrypted-config private mail-safe packages, ${manifest.files.length} source/assets each.`);
console.log(`Public: ${(statSync(publicPath).size / 1048576).toFixed(2)} MB; Private: ${(statSync(privatePath).size / 1048576).toFixed(2)} MB.`);
console.log('Passphrase saved separately in deliverables/TRANSFER_PASSWORD.txt. It is never printed or included in either archive.');
