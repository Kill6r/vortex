import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamingController } from '../src/main/games.js';

const started = '2026-10-21T19:00:00.0000000Z';

function setup({ initialPriority = 'Normal', savedPriority = 'AboveNormal' } = {}) {
  let priority = initialPriority;
  let foreground = true;
  let timestamp = 1000;
  let priorityChanges = [];
  let trims = 0;
  const rules = [{ name: 'VALORANT-Win64-Shipping', match: 'valorant-win64-shipping.exe', priority: savedPriority,
    affinity: null, auto: true, advanced: {
      proBalance: true, proBalanceCpu: 10, idleSaver: true, idleSeconds: 30,
      smartTrim: true, trimMinutes: 5, trimThreshold: 60
    } }];
  const controller = createGamingController({
    cpuCount: 8,
    clock: () => timestamp,
    ruleStore: { read: () => rules, write: () => {} },
    freeMemoryPercent: () => 1,
    inspect: async pid => ({ pid, name: 'VALORANT-Win64-Shipping', started, priority, affinity: '255',
      foreground, cpuSeconds: timestamp / 100 }),
    setPriority: async (_pid, value) => { priorityChanges.push(value); priority = value; },
    setAdvanced: async (_pid, _started, kind) => { if (kind === 'trim') trims++; }
  });
  return { controller, changes: () => priorityChanges, trimCount: () => trims,
    background: () => { foreground = false; },
    advance: ms => { timestamp += ms; },
    priority: () => priority };
}

test('al cambiar a Administrador de tareas el juego no baja a Inferior ni a Baja', async () => {
  const scene = setup();
  await scene.controller.activate(1234);
  scene.background();
  scene.advance(180_000);
  await scene.controller.checkNow();
  assert.equal(scene.priority(), 'AboveNormal');
  assert.deepEqual(scene.changes(), ['AboveNormal']);
  assert.equal(scene.trimCount(), 0);
  assert.equal(scene.controller.status().moderation, null);
  await scene.controller.stop();
  assert.equal(scene.priority(), 'Normal');
});

test('una regla automática antigua con prioridad Inferior nunca reduce el juego', async () => {
  const scene = setup({ savedPriority: 'BelowNormal' });
  const active = await scene.controller.activate(1234);
  assert.equal(active.appliedPriority, 'Normal');
  assert.match(active.safetyNote, /prioridad baja/);
  scene.background();
  scene.advance(600_000);
  await scene.controller.checkNow();
  assert.equal(scene.priority(), 'Normal');
  assert.equal(scene.trimCount(), 0);
});

test('si el juego ya quedó en Inferior de una versión antigua se restaura a Normal', async () => {
  const scene = setup({ initialPriority: 'BelowNormal' });
  await scene.controller.activate(1234);
  assert.equal(scene.priority(), 'AboveNormal');
  const result = await scene.controller.stop();
  assert.equal(result.restored, true);
  assert.equal(scene.priority(), 'Normal');
});

test('guardar perfiles conserva opciones de segundo plano sin bajar prioridad del juego', () => {
  let saved = [];
  const controller = createGamingController({
    cpuCount: 8,
    ruleStore: { read: () => [], write: next => { saved = next; } }
  });
  controller.saveRule({ name: 'valorant.exe', priority: 'BelowNormal', auto: true, advanced: {
    proBalance: true, idleSaver: true, smartTrim: true
  } });
  assert.equal(saved[0].priority, 'Normal');
  assert.equal(saved[0].advanced.proBalance, true);
  assert.equal(saved[0].advanced.idleSaver, true);
  assert.equal(saved[0].advanced.smartTrim, true);
  assert.equal(saved[0].priority, 'Normal');
});

test('si otro software cambia la prioridad se muestra un diagnóstico sin sobrescribirlo', async () => {
  const scene = setup();
  await scene.controller.activate(1234);
  scene.background();
  scene.advance(60_000);
  await scene.controller.checkNow();
  assert.equal(scene.controller.status().lastProblem, null);
});
