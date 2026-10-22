import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGameProfile, chooseBackgroundAction } from '../src/core/game-advisor.js';
import { createGamingController } from '../src/main/games.js';

const gb = 1024 ** 3;
const started = '2026-10-21T19:00:00.0000000Z';

test('VALORANT mantiene prioridad normal y no utiliza recorte de memoria', () => {
  const advice = analyzeGameProfile({ name: 'VALORANT-Win64-Shipping', cpuPercent: 75 },
    { logicalCpus: 8, ramTotal: 16 * gb, ramAvailable: 5 * gb, gpuCount: 2 });
  assert.equal(advice.priority, 'Normal');
  assert.equal(advice.advanced.smartTrim, false);
  assert.equal(advice.advanced.proBalance, false);
  assert.equal(advice.advanced.gpuPreference, 'HighPerformance');
  assert.equal(advice.affinity, null);
});

test('equipo con pocos hilos y poca RAM activa solo reglas conservadoras', () => {
  const advice = analyzeGameProfile({ name: 'examplegame', cpuPercent: 75 },
    { logicalCpus: 4, ramTotal: 8 * gb, ramAvailable: 400 * 1024 ** 2, gpuCount: 1 });
  assert.equal(advice.priority, 'AboveNormal');
  assert.equal(advice.advanced.proBalance, true);
  assert.equal(advice.advanced.idleSaver, true);
  assert.equal(advice.advanced.smartTrim, false);
  assert.equal(advice.advanced.gpu, null);
  assert.equal(advice.advanced.io, null);
});

test('no inventa la presión de memoria si falta información del hardware', () => {
  const advice = analyzeGameProfile({ name: 'juego' }, { logicalCpus: 12 });
  assert.equal(advice.info.memoryUsedPercent, null);
  assert.equal(advice.priority, 'Normal');
});

test('nunca aplica reglas de fondo a juegos, Chrome o procesos en primer plano', () => {
  const options = { proBalance: true, proBalanceCpu: 30, idleSaver: true, idleSeconds: 180 };
  const extras = { backgroundSeconds: 900, consecutiveHighCpu: 5 };
  assert.equal(chooseBackgroundAction({ name: 'VALORANT', pid: 32, cpuPercent: 90, priority: 'Normal' }, options, extras), null);
  assert.equal(chooseBackgroundAction({ name: 'chrome', pid: 33, cpuPercent: 90, priority: 'Normal' }, options, extras), null);
  assert.equal(chooseBackgroundAction({ name: 'steamwebhelper', pid: 34, foreground: true, cpuPercent: 90, priority: 'Normal' }, options, extras), null);
});

test('ProBalance exige tres lecturas altas de un lanzador permitido', () => {
  const item = { name: 'steamwebhelper', pid: 124, priority: 'Normal', cpuPercent: 38 };
  const options = { proBalance: true, proBalanceCpu: 35 };
  assert.equal(chooseBackgroundAction(item, options, { consecutiveHighCpu: 2 }), null);
  assert.deepEqual(chooseBackgroundAction(item, options, { consecutiveHighCpu: 3 }), { kind: 'priority', value: 'BelowNormal', reason: 'ProBalance' });
});

test('SmartTrim requiere autorización, presión alta de RAM, inactividad y tiempo de espera', () => {
  const item = { name: 'epicgameslauncher', pid: 88, cpuPercent: 0, memory: 500 * 1024 ** 2 };
  const options = { smartTrim: true, trimThreshold: 7, trimMinutes: 60 };
  assert.equal(chooseBackgroundAction(item, options, { backgroundSeconds: 200, usedPercent: 92, now: 4000000 }), null);
  assert.equal(chooseBackgroundAction(item, options, { backgroundSeconds: 200, usedPercent: 95, now: 4000000, lastTrimAt: 2000000 }), null);
  assert.deepEqual(chooseBackgroundAction(item, options, { backgroundSeconds: 200, usedPercent: 95, now: 4000000, lastTrimAt: 0 }), { kind: 'trim', value: 'run', reason: 'SmartTrim' });
});

test('la recomendación se calcula sin guardar reglas ni ejecutar optimizaciones', async () => {
  let actions = 0;
  const gaming = createGamingController({ cpuCount: 4, gpuCount: async () => 2,
    getMemory: () => ({ total: 8 * gb, available: 2 * gb }),
    inspect: async () => ({ pid: 450, name: 'VALORANT', started, priority: 'Normal' }),
    setPriority: async () => { actions++; }, ruleStore: { read: () => [], write: () => { actions++; } }
  });
  const profile = await gaming.recommend(450);
  assert.equal(profile.priority, 'Normal');
  assert.equal(actions, 0);
});

test('al perder el foco el juego restaura las prioridades temporales de lanzadores', async () => {
  let time = 1000;
  let gameForeground = true;
  let launcherPriority = 'Normal';
  let gamePriority = 'Normal';
  const moves = [];
  const controller = createGamingController({
    cpuCount: 4,
    clock: () => time,
    getMemory: () => ({ total: 8 * gb, available: 3 * gb }),
    ruleStore: { read: () => [], write: () => {} },
    inspect: async pid => pid === 101
      ? { pid, name: 'juego', started, priority: gamePriority, foreground: gameForeground, affinity: '15' }
      : { pid, name: 'steamwebhelper', started, priority: launcherPriority, foreground: false, affinity: '15' },
    listProcesses: async () => [{ pid: 102, name: 'steamwebhelper', started, priority: launcherPriority,
      foreground: false, cpuPercent: 42, memory: 600 * 1024 ** 2 }],
    setPriority: async (pid, priority) => {
      moves.push([pid, priority]);
      if (pid === 101) gamePriority = priority;
      else launcherPriority = priority;
    }
  });
  await controller.activate(101, { priority: 'Normal', advanced: { proBalance: true, proBalanceCpu: 35 } });
  for (let i = 0; i < 3; i++) {
    time += 20000;
    await controller.checkNow();
  }
  assert.equal(gamePriority, 'Normal');
  assert.equal(launcherPriority, 'BelowNormal');
  assert.deepEqual(moves.filter(row => row[0] === 101), [[101, 'Normal']]);
  gameForeground = false;
  time += 20000;
  await controller.checkNow();
  assert.equal(launcherPriority, 'Normal');
  const result = await controller.stop();
  assert.equal(result.restored, true);
  assert.equal(gamePriority, 'Normal');
});

test('SmartTrim no actúa sin lectura válida del consumo de CPU del proceso', () => {
  const item = { name: 'steamwebhelper', pid: 123, memory: 900 * 1024 ** 2, cpuPercent: null };
  assert.equal(chooseBackgroundAction(item, { smartTrim: true, trimThreshold: 10, trimMinutes: 60 },
    { backgroundSeconds: 500, usedPercent: 95, now: 6000000, lastTrimAt: 0 }), null);
});
