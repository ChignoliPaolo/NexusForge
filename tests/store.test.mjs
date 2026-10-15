import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.mjs';

test('database survives restart and identifies modified audit data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nexus-test-'));
  const path = join(directory, 'state.sqlite');
  try {
    const first = createStore(path);
    first.saveInvestigation({ id: 'test-investigation', scenarioId: 'pressure' });
    first.audit('test.created', { value: 1 });
    first.audit('test.reviewed', { value: 2 });
    assert.equal(first.verifyAudit().valid, true);
    first.close();
    const second = createStore(path);
    assert.equal(second.investigation('test-investigation').scenarioId, 'pressure');
    assert.equal(second.verifyAudit().count, 2);
    second.close();
    const raw = new DatabaseSync(path);
    raw.prepare('UPDATE audit SET body = ? WHERE sequence = 1').run('{"value":9}');
    raw.close();
    const third = createStore(path);
    assert.equal(third.verifyAudit().valid, false);
    third.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
