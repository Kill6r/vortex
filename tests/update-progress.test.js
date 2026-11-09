import test from 'node:test';
import assert from 'node:assert/strict';
import { readDownloadProgress, updateProgressView, clampUpdatePercent } from '../src/core/update-progress.js';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const preload = readFileSync(new URL('../src/main/preload.cjs', import.meta.url), 'utf8');
const updates = readFileSync(new URL('../src/main/updates.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/renderer/StartupPage.jsx', import.meta.url), 'utf8');

 test('el porcentaje de descarga usa los valores reales del actualizador', () => {
  assert.deepEqual(readDownloadProgress({ percent: 45.6, total: 1000, transferred: 456, bytesPerSecond: 128 }), {
    progress: 46, total: 1000, transferred: 456, bytesPerSecond: 128
  });
  assert.equal(readDownloadProgress({ total: 800, transferred: 200 }).progress, 25);
  assert.equal(readDownloadProgress({}).progress, null);
  assert.equal(clampUpdatePercent(130), 100);
  assert.equal(clampUpdatePercent(-10), 0);
 });

 test('la busqueda muestra una barra indeterminada sin inventar un porcentaje', () => {
  const checking = updateProgressView({ state: 'checking', progress: 0 });
  assert.equal(checking.active, true);
  assert.equal(checking.indeterminate, true);
  assert.equal(checking.percent, null);
  const download = updateProgressView({ state: 'downloading', progress: 23 });
  assert.equal(download.indeterminate, false);
  assert.equal(download.percent, 23);
  assert.equal(updateProgressView({ state: 'ready' }).percent, 100);
  assert.equal(updateProgressView({ state: 'up-to-date' }).active, false);
 });

 test('la interfaz escucha eventos inmediatos y libera el listener al salir', () => {
  assert.match(main, /webContents\.send\('updates:changed', status\)/);
  assert.match(preload, /onUpdateStatus: callback/);
  assert.match(preload, /removeListener\('updates:changed', listener\)/);
  assert.match(updates, /download-progress/);
  assert.match(view, /unsubscribe\?\.\(\)/);
  assert.match(view, /role="progressbar"/);
  assert.match(view, /v90-update-progress-track/);
  assert.match(view, /bytesPerSecond/);
 });
