import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsStore } from '../src/main/settings-store.js';
import { validateStandbySchedule } from '../src/core/standby-schedule.js';
import { validateAutoMemory, shouldCleanMemory } from '../src/core/performance.js';

test('acepta supervisión al alcanzar 85% de uso', () => {
  assert.equal(shouldCleanMemory(1.5, 10, 85), true);
  assert.equal(shouldCleanMemory(3, 10, 85), false);
  assert.equal(validateAutoMemory({ enabled: true, thresholdPercent: 85, intervalMinutes: 1, processNames: ['chrome'] }).thresholdPercent, 85);
});

test('solo permite limpieza de baja prioridad por hora', () => {
  assert.deepEqual(validateStandbySchedule({ enabled: true, mode: 'low', intervalMinutes: 60 }).intervalMinutes, 60);
  assert.throws(() => validateStandbySchedule({ enabled: true, mode: 'all', intervalMinutes: 60 }), /desactivado/);
  assert.throws(() => validateStandbySchedule({ enabled: true, mode: 'low', intervalMinutes: 15 }), /60/);
});

test('persiste perfiles y permite recuperarlos y eliminarlos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vortex-settings-'));
  try {
    const store = createSettingsStore(dir);
    store.write({ memory: { enabled: true }, standby: { enabled: false } });
    store.saveProfile('Mi equipo', { enabled: true, thresholdPercent: 85 }, { enabled: true, mode: 'low', intervalMinutes: 60 });
    const store2 = createSettingsStore(dir);
    assert.equal(store2.profiles()[0].memory.thresholdPercent, 85);
    assert.equal(store2.profiles()[0].standby.intervalMinutes, 60);
    store2.deleteProfile('Mi equipo');
    assert.equal(store2.profiles().length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
