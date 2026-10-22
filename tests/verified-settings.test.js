import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAdvancedOptions } from '../src/core/advanced.js';
import { createGamingController } from '../src/main/games.js';
import { readAdvancedProcess, setAdvancedProcess } from '../src/main/native.js';
import { parseGpuPreference, buildGpuPreferenceScript, readGpuPreference, setGpuPreference } from '../src/main/gpu-preference.js';

const started = '2026-10-21T20:45:00.0000000Z';

test('los perfiles nuevos incluyen impulso de hilos y preferencia de GPU', () => {
  const advanced = validateAdvancedOptions({ efficiency: 'Efficient', threadBoost: 'Enabled', gpuPreference: 'HighPerformance' });
  assert.equal(advanced.efficiency, 'Efficient');
  assert.equal(advanced.threadBoost, 'Enabled');
  assert.equal(advanced.gpuPreference, 'HighPerformance');
  assert.throws(() => validateAdvancedOptions({ threadBoost: 'RealTime' }));
  assert.throws(() => validateAdvancedOptions({ gpuPreference: 'NvidiaOnly' }));
});

test('consulta eficiencia e impulso de hilos mediante las APIs de Windows', async () => {
  const snapshot = await readAdvancedProcess(500, started, async script => {
    assert.match(script, /GetProcessPriorityBoost/);
    assert.match(script, /GetProcessInformation\(h, 4/);
    return { gpu: 2, io: 1, memory: 5, efficiency: 'Efficient', threadBoost: 'Disabled' };
  });
  assert.equal(snapshot.efficiency, 'Efficient');
  assert.equal(snapshot.threadBoost, 'Disabled');
});

test('comprueba el impulso de hilos después del cambio', async () => {
  const commands = [];
  const result = await setAdvancedProcess(500, started, 'threadBoost', 'Enabled', async script => {
    commands.push(script);
    return script.includes('::Read(')
      ? { gpu: 2, io: 1, memory: 5, efficiency: 'System', threadBoost: 'Enabled' }
      : { status: 0 };
  });
  assert.equal(result.verified, true);
  assert.equal(result.actual, 'Enabled');
  assert.match(commands[0], /SetProcessPriorityBoost/);
  assert.match(commands[0], /'threadBoost', 0/);
  assert.equal(commands.length, 2);
});

test('no reporta éxito cuando Windows informa un valor diferente', async () => {
  await assert.rejects(setAdvancedProcess(500, started, 'efficiency', 'Efficient', async script =>
    script.includes('::Read(') ? { efficiency: 'System' } : { status: 0 }), /informa System/);
});

test('perfil con impulso de hilos se restaura a su valor inicial', async () => {
  let priority = 'Normal';
  const advanced = { gpu: 'Normal', io: 'Normal', memory: 'Normal', efficiency: 'System', threadBoost: 'Disabled' };
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority, affinity: '255' }),
    setPriority: async (_pid, value) => { priority = value; },
    readAdvanced: async () => ({ ...advanced }),
    setAdvanced: async (_pid, _started, kind, value) => { advanced[kind] = value; }
  });
  await controller.activate(500, { advanced: { efficiency: 'Efficient', threadBoost: 'Enabled' } });
  assert.equal(advanced.efficiency, 'Efficient');
  assert.equal(advanced.threadBoost, 'Enabled');
  const result = await controller.stop();
  assert.equal(result.restored, true);
  assert.equal(advanced.efficiency, 'System');
  assert.equal(advanced.threadBoost, 'Disabled');
});

test('no declara activo un perfil cuando la lectura posterior contradice el ajuste', async () => {
  let priority = 'Normal';
  const advanced = { gpu: 'Normal', io: 'Normal', memory: 'Normal', efficiency: 'System', threadBoost: 'Disabled' };
  const controller = createGamingController({
    cpuCount: 8,
    inspect: async pid => ({ pid, name: 'juego', started, priority, affinity: '255' }),
    setPriority: async (_pid, value) => { priority = value; },
    readAdvanced: async () => ({ ...advanced }),
    setAdvanced: async () => {}
  });
  await assert.rejects(controller.activate(500, { advanced: { threadBoost: 'Enabled' } }), /no confirmó/);
  assert.equal(priority, 'Normal');
  assert.equal(controller.status(), null);
});

test('preferencia de GPU preserva otras opciones y exige identidad de proceso', () => {
  assert.equal(parseGpuPreference('GpuPreference=2;SwapEffectUpgradeEnable=1;'), 'HighPerformance');
  assert.equal(parseGpuPreference('GpuPreference=1;'), 'PowerSaving');
  assert.equal(parseGpuPreference(null), 'System');
  const script = buildGpuPreferenceScript(600, started, 'HighPerformance');
  assert.match(script, /GpuPreference=2/);
  assert.match(script, /\^\\s\*GpuPreference=/);
  assert.match(script, /Get-Process -Id 600/);
  assert.match(script, /DeleteValue/);
  assert.throws(() => buildGpuPreferenceScript(600, started, 'GPU1'));
});

test('preferencia de GPU reconoce la lectura posterior pero indica que se debe reiniciar', async () => {
  const result = await setGpuPreference(600, started, 'HighPerformance', async () => ({ preference: 'HighPerformance', path: 'C:\\Games\\game.exe', verified: true }));
  assert.equal(result.applied, true);
  assert.match(result.note, /Reinicia/);
  await assert.rejects(setGpuPreference(600, started, 'HighPerformance', async () => ({ preference: 'PowerSaving', path: 'C:\\Games\\game.exe', verified: false })), /No se confirmó/);
  const read = await readGpuPreference(600, started, async () => ({ preference: 'PowerSaving', path: 'C:\\Games\\game.exe' }));
  assert.equal(read.preference, 'PowerSaving');
});
