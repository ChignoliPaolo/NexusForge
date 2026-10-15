const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

async function passwordPrompt() {
  process.stdout.write('Private transfer passphrase (Enter to skip and use demo mode): ');
  if (!process.stdin.isTTY) {
    const reader = readline.createInterface({ input: process.stdin });
    const value = await new Promise(resolve => { reader.once('line', resolve); reader.once('close', () => resolve('')); });
    reader.close(); return value;
  }
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', receive); process.stdout.write('\n'); };
    const receive = data => {
      for (const character of data.toString()) {
        if (character === '\r' || character === '\n') { finish(); resolve(password); return; }
        if (character === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (character === '\u007f' || character === '\b') { if (password.length) { password = password.slice(0, -1); process.stdout.write('\b \b'); } }
        else if (character >= ' ' && password.length < 200) { password += character; process.stdout.write('*'); }
      }
    };
    process.stdin.on('data', receive);
  });
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required.');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'MANIFEST.json.txt'), 'utf8'));
  const destination = path.resolve(process.argv.find(argument => argument.startsWith('--dest='))?.slice(7) || path.join(__dirname, 'nexusforge'));
  const rejectSymlinks = target => {
    let current = target;
    while (current !== path.dirname(current)) {
      let metadata;
      try { metadata = fs.lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (metadata?.isSymbolicLink()) throw new Error('Refusing a symbolic-link destination: ' + current);
      if (current === destination) break;
      current = path.dirname(current);
    }
  };
  rejectSymlinks(destination);
  for (const entry of manifest.files) {
    if (entry.path.includes('..') || entry.path.includes('\\') || path.isAbsolute(entry.path) || !/^(payload\/|PRESENTATION\/)/.test(entry.source)) throw new Error('Unsafe manifest path.');
    const source = path.resolve(__dirname, entry.source);
    if (!source.startsWith(__dirname + path.sep)) throw new Error('Unsafe source path.');
    const contents = fs.readFileSync(source);
    if (crypto.createHash('sha256').update(contents).digest('hex') !== entry.sha256) throw new Error('File integrity check failed: ' + entry.path);
    const target = path.resolve(destination, entry.path);
    if (!target.startsWith(destination + path.sep)) throw new Error('Unsafe destination.');
    rejectSymlinks(target);
    if (fs.existsSync(target)) {
      const existingHash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (existingHash !== entry.sha256) throw new Error('Refusing to overwrite modified file: ' + target + '. Restore into a new folder using --dest=...');
    }
  }
  const encryptedPath = path.join(__dirname, 'PRIVATE_ENV.aesgcm.json.txt');
  let decrypted = null;
  if (fs.existsSync(encryptedPath)) {
    const password = await passwordPrompt();
    if (password) {
      const envelope = JSON.parse(fs.readFileSync(encryptedPath, 'utf8'));
      if (envelope.version !== 1 || envelope.cipher !== 'aes-256-gcm') throw new Error('Unsupported credential envelope.');
      const key = crypto.scryptSync(password, Buffer.from(envelope.salt, 'base64'), 32, { N: 32768, r: 8, p: 1, maxmem: 67108864 });
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      try { decrypted = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]); }
      catch { throw new Error('Incorrect passphrase or modified credential envelope. No private configuration was written.'); }
    }
  }
  for (const entry of manifest.files) {
    const target = path.resolve(destination, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, entry.source), target);
    if (/\.(sh|command)$/.test(target)) fs.chmodSync(target, 0o755);
  }
  const environment = path.join(destination, '.env');
  rejectSymlinks(environment);
  rejectSymlinks(path.join(destination, '.env.transfer'));
  if (!fs.existsSync(environment)) {
    fs.writeFileSync(environment, decrypted || fs.readFileSync(path.join(destination, '.env.example')), { mode: 0o600 });
  } else if (decrypted) {
    if (fs.existsSync(path.join(destination, '.env.transfer'))) throw new Error('Existing .env and .env.transfer preserved. Restore into a new destination.');
    fs.writeFileSync(path.join(destination, '.env.transfer'), decrypted, { mode: 0o600 });
    console.log('Existing .env preserved. Decrypted transfer configuration saved as .env.transfer; review it manually.');
  }
  console.log('\nRestored and SHA-256 checked ' + manifest.files.length + ' files.');
  console.log('Credentials: ' + (decrypted ? 'decrypted locally; not displayed' : 'not loaded; offline demo remains available'));
  console.log('\nNext:\n  cd "' + destination + '"\n  npm test\n  npm start\n\nOpen http://localhost:8000\n');
  console.log('PDF: presentation/NexusForge-Pitch.pdf\nOffline preview: NexusForge-demo.html\nConnected-laptop verification: npm run verify:live');
}

main().catch(error => { console.error('Restore failed: ' + error.message); process.exitCode = 1; });
