import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runStandbyHelper, standbyRunnerPath } from '../src/main/standby-runner.js';
import { validateStandbyRequest, createStandbyController } from '../src/main/standby.js';

const mib = 1024 ** 2;
const snapshot = { elevated: true, low: 2 * 1024 * mib, normal: 100 * mib, core: 0, standby: 2148 * mib, available: 8 * 1024 * mib };

test('el script externo existe en el entorno de desarrollo', async () => {
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(standbyRunnerPath()), true);
});

test('la limpieza avanzada requiere aceptar riesgos mediante confirmación', () => {
  assert.throws(() => validateStandbyRequest({ mode: 'all', confirmed: true }), /confirmar el riesgo/);
  assert.equal(validateStandbyRequest({ mode: 'all', confirmed: true, riskAccepted: true }), 'all');
  assert.throws(() => validateStandbyRequest({ mode: 'all', confirmed: true, automatic: true, riskAccepted: true }), /manual/);
  assert.throws(() => validateStandbyRequest({ mode: 'low', confirmed: true, force: true }), /confirmar el riesgo/);
  assert.equal(validateStandbyRequest({ mode: 'low', confirmed: true, force: true, riskAccepted: true }), 'low');
});

test('el modo manual avanzado omite límites de tamaño, pero el automático no', async () => {
  let purges = 0;
  const controller = createStandbyController({
    execute: async () => snapshot,
    runPurge: async mode => { purges++; return { status: 0, mode }; },
    clock: () => 1000,
    totalMemory: () => 16 * 1024 * mib
  });
  await assert.rejects(controller.purge({ mode: 'low', confirmed: true }), /grande/);
  const result = await controller.purge({ mode: 'all', force: true, confirmed: true, riskAccepted: true });
  assert.equal(result.mode, 'all');
  assert.equal(result.forced, true);
  assert.equal(purges, 1);
  const autoResult = await controller.purge({ mode: 'low', confirmed: true, automatic: true });
  assert.equal(autoResult.skipped, true);
  controller.dispose();
});

test('el ejecutor usa PowerShell como proceso independiente y recibe JSON', async () => {
  const recorded = [];
  const fakeSpawn = (exe, args) => {
    recorded.push({ exe, args });
    const child = new EventEmitter();
    child.stdout = Readable.from([]);
    child.stderr = Readable.from([]);
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('{"status":0,"mode":"low"}'));
      child.emit('close', 0);
    });
    return child;
  };
  const result = await runStandbyHelper('low', { platform: 'win32', spawn: fakeSpawn });
  assert.equal(result.status, 0);
  assert.equal(recorded[0].exe, 'powershell.exe');
  assert.ok(recorded[0].args.includes('-File'));
});

test('standby automático respeta el modo de observación', async () => {
  let purges = 0;
  let enabled = false;
  const controller = createStandbyController({
    execute: async () => ({ ...snapshot, low: 128 * mib, available: 1 * 1024 * mib }),
    runPurge: async () => { purges++; return { status: 0, mode: 'low' }; },
    canAutomate: () => enabled,
    clock: () => 4000000,
    totalMemory: () => 16 * 1024 * mib
  });
  const result = await controller.purge({ mode: 'low', confirmed: true, automatic: true });
  assert.equal(result.skipped, true);
  assert.equal(purges, 0);
  controller.dispose();
});
