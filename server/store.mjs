import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, investigation_id TEXT UNIQUE NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, time TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL);');
  const store = {
    saveCase(value) { db.prepare('INSERT OR REPLACE INTO cases VALUES (?, ?)').run(value.id, JSON.stringify(value)); return value; },
    case(id) { const row = db.prepare('SELECT body FROM cases WHERE id = ?').get(id); return row ? JSON.parse(row.body) : null; },
    cases() { return db.prepare('SELECT body FROM cases ORDER BY rowid DESC LIMIT 50').all().map(row => JSON.parse(row.body)); },
    saveInvestigation(value) { db.prepare('INSERT OR REPLACE INTO investigations VALUES (?, ?)').run(value.id, JSON.stringify(value)); return value; },
    investigation(id) { const row = db.prepare('SELECT body FROM investigations WHERE id = ?').get(id); return row ? JSON.parse(row.body) : null; },
    investigations() { return db.prepare('SELECT body FROM investigations ORDER BY rowid DESC LIMIT 50').all().map(row => JSON.parse(row.body)); },
    saveOrder(value) { db.prepare('INSERT OR REPLACE INTO orders VALUES (?, ?, ?)').run(value.id, value.investigationId, JSON.stringify(value)); return value; },
    orderFor(id) { const row = db.prepare('SELECT body FROM orders WHERE investigation_id = ?').get(id); return row ? JSON.parse(row.body) : null; },
    orders() { return db.prepare('SELECT body FROM orders ORDER BY rowid DESC LIMIT 100').all().map(row => JSON.parse(row.body)); },
    audit(kind, data) {
      const previous = db.prepare('SELECT hash FROM audit ORDER BY sequence DESC LIMIT 1').get()?.hash || 'GENESIS';
      const event = { id: randomUUID(), time: new Date().toISOString(), kind, body: JSON.stringify(data), previous_hash: previous };
      const hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
      db.prepare('INSERT INTO audit (id, time, kind, body, previous_hash, hash) VALUES (?, ?, ?, ?, ?, ?)').run(event.id, event.time, kind, event.body, previous, hash);
      return { ...event, hash };
    },
    auditLog() { return db.prepare('SELECT * FROM audit ORDER BY sequence DESC LIMIT 200').all().map(row => ({ ...row, data: JSON.parse(row.body) })); },
    verifyAudit() {
      let previous = 'GENESIS';
      const events = db.prepare('SELECT * FROM audit ORDER BY sequence').all();
      for (const event of events) {
        const { id, time, kind, body, previous_hash } = event;
        const hash = createHash('sha256').update(JSON.stringify({ id, time, kind, body, previous_hash })).digest('hex');
        if (event.previous_hash !== previous || event.hash !== hash) return { valid: false, count: events.length };
        previous = hash;
      }
      return { valid: true, count: events.length, head: previous };
    },
    close() { db.close(); }
  };
  db.exec('CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, body TEXT NOT NULL);');
  return store;
}
