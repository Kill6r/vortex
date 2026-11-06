import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRebarResources } from '../src/core/rebar-status.js';
import { readRebarResources } from '../src/main/rebar-probe.js';
import { readGraphicsStatus } from '../src/main/windows-tweaks.js';

test('identifica un mapeo PCI grande como indicio y no como confirmacion de ReBAR', () => {
  const result = summarizeRebarResources([{ name: 'NVIDIA GeForce RTX 3050', largestBarBytes: 8 * 1024 ** 3 }], ['NVIDIA GeForce RTX 3050']);
  assert.equal(result.state, 'large-bar');
  assert.equal(result.confidence, 'indicative');
  assert.equal(result.largestBarBytes, 8 * 1024 ** 3);
  assert.match(result.description, /ampliada.*no demuestra/);
});

test('ReBAR no aparece desactivado solo por falta de recursos visibles', () => {
  assert.equal(summarizeRebarResources([]).state, 'unknown');
  assert.equal(summarizeRebarResources([{ name: 'NVIDIA RTX 3050', largestBarBytes: 256 * 1024 ** 2 }]).state, 'small-bar');
  assert.equal(summarizeRebarResources([{ name: 'Intel UHD Graphics', largestBarBytes: 8 * 1024 ** 3 }]).state, 'unknown');
});

test('la lectura de ReBAR usa el resultado de Windows sin inventar datos', async () => {
  const rows = await readRebarResources(async script => {
    assert.match(script, /Get-CimAssociatedInstance/);
    return [{ name: 'NVIDIA GeForce RTX', largestBarBytes: 1024 ** 3 }];
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(await readRebarResources(async () => { throw new Error('Acceso denegado'); }), []);
});

test('actualizar HAGS vuelve a leer su valor configurado y el estado de ReBAR', async () => {
  let value = 1;
  const execute = async () => ({ registryValue: value });
  const hardware = async () => ({ gpus: ['NVIDIA GeForce RTX 3050'] });
  const probe = async () => [{ name: 'NVIDIA GeForce RTX 3050', largestBarBytes: 8 * 1024 ** 3 }];
  const settings = { read: () => ({}) };
  const first = await readGraphicsStatus(execute, hardware, probe, settings);
  assert.equal(first.hagsValue, 1);
  assert.equal(first.rebar.state, 'large-bar');
  value = 2;
  const second = await readGraphicsStatus(execute, hardware, probe, settings);
  assert.equal(second.hagsValue, 2);
  assert.equal(second.hags, 'solicitado-activado');
  assert.equal(second.hagsPendingRestart, false);
});
