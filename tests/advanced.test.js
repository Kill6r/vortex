import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdvancedOptions, measureCpu, shouldIdleSave, shouldProBalance, shouldSmartTrim } from '../src/core/advanced.js';
import { createGamingController } from '../src/main/games.js';
import { setAdvancedProcess, readAdvancedProcess } from '../src/main/native.js';

const started = '2026-10-20T23:45:00.0000000Z';

test('normaliza perfiles avanzados y rechaza prioridades inválidas', () => {
  const advanced = validateAdvancedOptions({ gpu: 'High', io: 'Low', memory: 'Normal', proBalance: true, idleSaver: true, smartTrim: true });
  assert.equal(advanced.gpu, 'High');
  assert.equal(advanced.trimMinutes, 15);
  assert.equal(advanced.efficiency, null);
  assert.throws(() => validateAdvancedOptions({ gpu: 'RealTime' }));
  assert.equal(validateAdvancedOptions({ io: 'High' }).io, 'High');
  assert.throws(() => validateAdvancedOptions({ io: 'Critical' }));
  assert.throws(() => validateAdvancedOptions({ trimMinutes: 1 }));
});

test('calcula CPU con dos muestras y detecta reinicios de PID', () => {
  const old = { started, cpuSeconds: 10, sampledAt: 1000 };
  assert.equal(measureCpu(old, { started, cpuSeconds: 11, sampledAt: 2000 }, 8), 12.5);
  assert.equal(measureCpu(old, { started: 'nuevo', cpuSeconds: 15, sampledAt: 2000 }, 8), null);
  assert.equal(measureCpu(old, { started, cpuSeconds: 15, sampledAt: 1000 }, 8), null);
});

test('ProBalance, IdleSaver y SmartTrim respetan sus condiciones', () => {
  assert.equal(shouldProBalance(52, false, true, 30), true);
  assert.equal(shouldProBalance(80, true, true, 30), false);
  assert.equal(shouldIdleSave(70, true, 60), true);
  assert.equal(shouldIdleSave(20, true, 60), false);
  assert.equal(shouldSmartTrim(9, 120, true, 20), true);
  assert.equal(shouldSmartTrim(9, 0, true, 20), false);
});

test('puede aplicar y restaurar un perfil con GPU y E/S', async () => {
  const changes = [];
  let cpu = 'Normal';
  const original = { gpu: 'Normal', io: 'Normal', memory: 'Normal' };
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority: cpu, affinity: '255' }),
    setPriority: async (_pid, value) => { cpu = value; },
    readAdvanced: async () => ({ ...original }),
    setAdvanced: async (_pid, _started, kind, value) => { changes.push(`${kind}:${value}`); original[kind] = value; }
  });
  const active = await controller.activate(500, { advanced: { gpu: 'High', io: 'Low' } });
  assert.equal(active.appliedPriority, 'AboveNormal');
  assert.deepEqual(changes, ['gpu:High', 'io:Low']);
  assert.equal((await controller.stop()).restored, true);
  assert.deepEqual(changes, ['gpu:High', 'io:Low', 'io:Normal', 'gpu:Normal']);
});

test('no cambia GPU si no puede consultar la prioridad original', async () => {
  const changes = [];
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority: 'Normal', affinity: '255' }),
    readAdvanced: async () => ({ gpu: null }),
    setPriority: async () => changes.push('cpu'),
    setAdvanced: async () => changes.push('gpu')
  });
  await assert.rejects(controller.activate(500, { advanced: { gpu: 'High' } }), /restauración/);
  assert.deepEqual(changes, ['cpu', 'cpu']);
});

test('genera comandos nativos validados sin interpolar campos arbitrarios', async () => {
  let text = '';
  await setAdvancedProcess(500, started, 'gpu', 'AboveNormal', async script => { if (!script.includes('::Read(')) text = script; return script.includes('::Read(') ? { gpu: 3, io: 2, memory: 5, efficiency: 'System', threadBoost: 'Enabled' } : { status: 0 }; });
  assert.match(text, /D3DKMTSetProcessSchedulingPriorityClass/);
  assert.match(text, /'gpu', 3/);
  await assert.rejects(setAdvancedProcess(500, started, 'gpu', 'RealTime', async () => ({ status: 0 })));
  const snapshot = await readAdvancedProcess(500, started, async () => ({ gpu: 2, io: 1, memory: 5 }));
  assert.deepEqual(snapshot, { gpu: 'Normal', io: 'Low', memory: 'Normal', efficiency: null, threadBoost: null });
});

test('E/S Alta se envía al nivel 3 y se verifica con la lectura posterior', async () => {
  let sent = '';
  const result = await setAdvancedProcess(500, started, 'io', 'High', async script => {
    if (script.includes('::Change(')) { sent = script; return { status: 0 }; }
    return { gpu: 2, io: 3, memory: 5 };
  });
  assert.match(sent, /'io', 3/);
  assert.equal(result.verified, true);
  await assert.rejects(setAdvancedProcess(500, started, 'io', 'High', async script =>
    script.includes('::Change(') ? { status: 0 } : { gpu: 2, io: 2, memory: 5 }), /Normal/);
});
