import test from 'node:test';
import assert from 'node:assert/strict';
import { readHagsEffective, hagsProbeScript } from '../src/main/hags-probe.js';

test('HAGS usa bits WDDM del controlador, no solo una clave del registro', async () => {
  assert.match(hagsProbeScript, /D3DKMTQueryAdapterInfo/);
  assert.match(hagsProbeScript, /Type = 70/);
  const actual = await readHagsEffective(async () => ({ adapters: [{ display: 'DISPLAY1', supported: true, enabled: true }] }));
  assert.equal(actual.available, true);
  assert.equal(actual.enabled, true);
  assert.equal(actual.supported, true);
  assert.equal(actual.source, 'WDDM D3DKMT');
});

test('HAGS no inventa estados cuando el controlador no responde', async () => {
  const actual = await readHagsEffective(async () => ({ adapters: [], error: 'Consulta no admitida' }));
  assert.equal(actual.available, false);
  assert.equal(actual.enabled, null);
});

test('el estado de HAGS viene del controlador y no se confunde con el valor solicitado', async () => {
  const { readGraphicsStatus } = await import('../src/main/windows-tweaks.js');
  const result = await readGraphicsStatus(
    async () => ({ registryValue: 2 }),
    async () => ({ gpus: ['NVIDIA RTX 3050'] }),
    async () => [],
    { read: () => ({}) },
    async () => ({ available: true, enabled: false, supported: true, adapters: [{ display: 'DISPLAY1', enabled: false, supported: true }] }),
    async () => [{ name: 'NVIDIA RTX 3050', bar1Bytes: 8 * 1024 ** 3 }]
  );
  assert.equal(result.hagsValue, 2);
  assert.equal(result.hagsEffective.enabled, false);
  assert.equal(result.rebar.state, 'large-bar');
  assert.equal(result.rebar.confidence, 'driver');
});
