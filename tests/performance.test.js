import test from 'node:test';
import assert from 'node:assert/strict';
import { processAllowed, shouldCleanMemory, validateAutoMemory, validateGameProcess, validateMemoryRequest } from '../src/core/performance.js';
import { preferenceOptions } from '../src/core/catalog.js';
import { preferenceDetails } from '../src/core/preferences.js';

test('protege procesos críticos y permite procesos corrientes', () => {
  assert.equal(processAllowed('svchost.exe'), false);
  assert.equal(processAllowed('lsass'), false);
  assert.equal(processAllowed('chrome.exe'), true);
  assert.equal(processAllowed('VALORANT-Win64-Shipping'), true);
});

test('rechaza operaciones de memoria sin procesos válidos', () => {
  assert.throws(() => validateMemoryRequest({ mode: 'intensiva', pids: [0] }));
  assert.throws(() => validateMemoryRequest({ mode: 'conservadora', pids: [25, 25] }));
  assert.deepEqual(validateMemoryRequest({ mode: 'conservadora', pids: [100, 101] }), { mode: 'conservadora', pids: [100, 101] });
});

test('el limpiador automático exige una selección y límites válidos', () => {
  assert.throws(() => validateAutoMemory({ enabled: true, intervalMinutes: 5, thresholdPercent: 85, processNames: [] }));
  assert.throws(() => validateAutoMemory({ enabled: true, intervalMinutes: 0, thresholdPercent: 85, processNames: ['chrome'] }));
  assert.equal(validateAutoMemory({ enabled: true, intervalMinutes: 15, thresholdPercent: 80, processNames: ['Chrome'] }).enabled, true);
});

test('solo limpia automáticamente cuando la disponibilidad cruza el umbral', () => {
  assert.equal(shouldCleanMemory(8, 32, 85), false);
  assert.equal(shouldCleanMemory(3, 32, 85), true);
});

test('modo juego no admite tiempo real ni identificadores inválidos', () => {
  assert.throws(() => validateGameProcess(10, 'RealTime'));
  assert.throws(() => validateGameProcess(-1));
  assert.deepEqual(validateGameProcess(541, 'AboveNormal'), { pid: 541, priority: 'AboveNormal' });
});

test('todas las preferencias tienen ayuda y detalles completos', () => {
  for (const option of preferenceOptions) {
    assert.ok(preferenceDetails[option.key]?.short?.length > 15, option.key);
    assert.ok(preferenceDetails[option.key]?.full?.length > 45, option.key);
    assert.ok(preferenceDetails[option.key]?.services, option.key);
  }
});
