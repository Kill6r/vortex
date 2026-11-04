import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanerTargets, formatCleanerBytes, validateCleanerSelection } from '../src/core/cleaner.js';
import { createCleanerController } from '../src/main/cleaner.js';

const names = cleanerTargets.map(x => x.id);

test('cleaner incorpora las seis categorias sin duplicados', () => {
  assert.deepEqual(names, ['temp', 'prefetch', 'recyclebin', 'windows-update', 'thumbnails', 'errorreports']);
  assert.equal(formatCleanerBytes(1536), '1.5 KB');
});

test('no permite rutas arbitrarias ni opciones avanzadas sin permiso', () => {
  assert.throws(() => validateCleanerSelection(['../../Windows']), /invalida/);
  assert.throws(() => validateCleanerSelection(['temp', 'temp']), /repetida/);
  assert.throws(() => validateCleanerSelection(['windows-update']), /avanzadas/);
  assert.deepEqual(validateCleanerSelection(['temp', 'prefetch'], true).map(x => x.id), ['temp', 'prefetch']);
});

test('analiza y limpia temporales permitidos sin seguir enlaces simbolicos', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vortex-cleaner-test-'));
  const temp = path.join(base, 'safe-temp');
  const other = path.join(base, 'outside.txt');
  await fs.mkdir(temp);
  await fs.writeFile(path.join(temp, 'file.tmp'), 'example data');
  await fs.writeFile(other, 'keep me');
  let symlinked = false;
  try { await fs.symlink(other, path.join(temp, 'external.tmp')); symlinked = true; } catch {}
  const paths = Object.fromEntries(names.filter(n => n !== 'recyclebin').map(id => [id, [id === 'temp' ? temp : path.join(base, id)]]));
  const cleaner = createCleanerController({ platform: 'win32', paths, query: async () => ({ bytes: 0, running: true }), isAdmin: async () => true });
  try {
    const report = await cleaner.scan();
    assert.equal(report.items.find(x => x.id === 'temp').bytes, 12);
    const result = await cleaner.clean(['temp']);
    assert.equal(result.results[0].freed, 12);
    assert.equal(await fs.readFile(other, 'utf8'), 'keep me');
    assert.equal((await cleaner.scan()).items.find(x => x.id === 'temp').bytes, 0);
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test('cache de Windows Update se bloquea con servicios activos y no fuerza cambios', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vortex-update-test-'));
  const cache = path.join(base, 'windows-update');
  await fs.mkdir(cache);
  await fs.writeFile(path.join(cache, 'update.bin'), 'download');
  const cleaner = createCleanerController({ platform: 'win32', paths: { 'windows-update': [cache] }, query: async () => ({ running: true }), isAdmin: async () => true });
  try {
    const result = await cleaner.clean(['windows-update'], true);
    assert.match(result.results[0].error, /esta activo/);
    assert.equal(await fs.readFile(path.join(cache, 'update.bin'), 'utf8'), 'download');
  } finally { await fs.rm(base, { recursive: true, force: true }); }
});
