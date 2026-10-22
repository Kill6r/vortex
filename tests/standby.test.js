import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandbyController, standbySafetyCheck, validateStandbyRequest } from '../src/main/standby.js';

const gib = 1024 ** 3;
const mib = 1024 ** 2;
const safeSnapshot = { elevated: true, low: 256 * mib, normal: 300 * mib, core: 0, standby: 556 * mib, available: gib };

test('confirma la limpieza completa sin exigir palabras escritas', () => {
  assert.throws(() => validateStandbyRequest({ mode: 'all', confirmed: true }), /confirmar el riesgo/);
  assert.throws(() => validateStandbyRequest({ mode: 'low' }), /confirma/);
  assert.equal(validateStandbyRequest({ mode: 'low', confirmed: true }), 'low');
  assert.equal(validateStandbyRequest({ mode: 'all', confirmed: true, riskAccepted: true }), 'all');
  assert.throws(() => validateStandbyRequest({ mode: 'all', confirmed: true, riskAccepted: true, automatic: true }), /manual/);
});

test('bloquea vaciados grandes y durante juegos, pero permite intentos manuales pequeños', () => {
  assert.match(standbySafetyCheck({ ...safeSnapshot, low: 4 * gib }, { total: 8 * gib }), /grande/);
  assert.equal(standbySafetyCheck({ ...safeSnapshot, available: 8 * gib }, { total: 16 * gib }), null);
  assert.match(standbySafetyCheck({ ...safeSnapshot, available: 8 * gib }, { total: 16 * gib, automatic: true }), /suficiente/);
  assert.match(standbySafetyCheck(safeSnapshot, { total: 16 * gib, gameActive: true }), /juego/);
});

test('consulta mediciones sin vaciar la caché', async () => {
  const controller = createStandbyController({ execute: async () => safeSnapshot, totalMemory: () => 16 * gib });
  const state = await controller.snapshot();
  assert.equal(state.standby, safeSnapshot.standby);
  assert.equal(state.allowed, true);
  controller.dispose();
});

test('requiere privilegios para limpiar la caché', async () => {
  const controller = createStandbyController({ execute: async () => ({ ...safeSnapshot, elevated: false }), totalMemory: () => 16 * gib });
  await assert.rejects(controller.purge({ mode: 'low', confirmed: true }), /administrador/);
  controller.dispose();
});

test('devuelve mediciones y aplica un periodo de espera', async () => {
  let index = 0;
  const controller = createStandbyController({
    execute: async () => {
      index++;
      if (index === 2) return { status: 0 };
      if (index === 3) return { ...safeSnapshot, standby: 200 * mib };
      return safeSnapshot;
    },
    totalMemory: () => 16 * gib,
    clock: () => 90_000_000
  });
  const result = await controller.purge({ mode: 'low', confirmed: true });
  assert.equal(result.standbyBefore, safeSnapshot.standby);
  assert.equal(result.standbyAfter, 200 * mib);
  await assert.rejects(controller.purge({ mode: 'low', confirmed: true }), /hora/);
  assert.equal(index, 4);
  controller.dispose();
});

test('omite limpieza automática cuando no es necesaria', async () => {
  let calls = 0;
  const controller = createStandbyController({ execute: async () => { calls++; return { ...safeSnapshot, available: 8 * gib }; }, totalMemory: () => 16 * gib });
  const result = await controller.purge({ mode: 'low', confirmed: true, automatic: true });
  assert.equal(result.skipped, true);
  assert.equal(calls, 1);
  controller.dispose();
});

test('desactiva configuraciones antiguas peligrosas al abrir VORTEX', () => {
  const written = [];
  const store = { read: () => ({ standby: { mode: 'all', enabled: true, intervalMinutes: 15, acknowledged: true } }), write: item => written.push(item) };
  const controller = createStandbyController({ store });
  assert.equal(controller.config().enabled, false);
  assert.equal(controller.config().mode, 'low');
  assert.ok(written.length >= 1);
  controller.dispose();
});
