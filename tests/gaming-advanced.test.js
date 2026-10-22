import test from 'node:test';
import assert from 'node:assert/strict';
import { coresFromMask, maskFromCores, validateAffinity, validateGameRule } from '../src/core/gaming.js';
import { createGamingController } from '../src/main/games.js';

const started = '2026-10-20T23:45:00.0000000Z';

test('valida selección de núcleos y máscaras', () => {
  assert.equal(maskFromCores([0, 2, 5], 8), '37');
  assert.deepEqual(coresFromMask('37', 8), [0, 2, 5]);
  assert.throws(() => maskFromCores([], 8));
  assert.throws(() => validateAffinity('256', 8));
  assert.equal(validateAffinity('37', 8), '37');
});

test('no admite prioridades de tiempo real en reglas', () => {
  assert.throws(() => validateGameRule({ name: 'juego', priority: 'RealTime' }, 8));
  assert.throws(() => validateGameRule({ name: 'svchost', priority: 'Normal' }, 8));
});

test('guarda y elimina reglas de juego', () => {
  let rules = [];
  const controller = createGamingController({
    cpuCount: 8,
    ruleStore: { read: () => rules, write: next => { rules = next; } }
  });
  const saved = controller.saveRule({ name: 'juego.exe', priority: 'High', affinity: '63', auto: false });
  assert.equal(saved[0].name, 'juego');
  assert.equal(saved[0].affinity, '63');
  assert.deepEqual(controller.deleteRule('juego'), []);
});

test('modo juego aplica y restaura prioridad y afinidad', async () => {
  let priority = 'Normal';
  let affinity = '255';
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority, affinity }),
    setPriority: async (_pid, next) => { priority = next; },
    setAffinity: async (_pid, next) => { affinity = next; }
  });
  await controller.activate(501, { priority: 'AboveNormal', affinity: '15' });
  assert.equal(priority, 'AboveNormal');
  assert.equal(affinity, '15');
  await controller.stop();
  assert.equal(priority, 'Normal');
  assert.equal(affinity, '255');
});

test('rechaza cambiar un proceso cuya identidad ya no coincide', async () => {
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority: 'Normal', affinity: '255' })
  });
  await assert.rejects(controller.perform({ pid: 501, started: '2026-10-20T12:00:00.0000000Z', kind: 'priority', value: 'High' }), /cambió/);
});

test('no cambia afinidad si no puede recuperar el valor original', async () => {
  let changes = 0;
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority: 'Normal', affinity: null }),
    setPriority: async () => { changes++; },
    setAffinity: async () => { changes++; }
  });
  await assert.rejects(controller.activate(501, { affinity: '15' }), /afinidad original/);
  assert.equal(changes, 0);
});
