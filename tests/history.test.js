import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHistoryStore } from '../src/main/history.js';

test('registra cambios y conserva el modo de inicio anterior', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vortex-test-'));

  try {
    const history = createHistoryStore(directory);
    const record = await history.append({ name: 'Spooler', previousMode: 'Automatic', newMode: 'Manual' });
    const saved = await history.read();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, record.id);
    assert.equal(saved[0].previousMode, 'Automatic');
    assert.equal(saved[0].restoredAt, null);

    const restored = await history.markRestored(record.id);
    assert.ok(restored.restoredAt);
    await assert.rejects(history.markRestored(record.id), /ya se restauró/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('el historial comienza vacío y mantiene los cambios entre lecturas', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vortex-test-'));

  try {
    const store = createHistoryStore(directory);
    assert.deepEqual(await store.read(), []);
    await store.append({ name: 'Fax', previousMode: 'Manual', newMode: 'Disabled' });
    assert.equal((await createHistoryStore(directory).read()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
