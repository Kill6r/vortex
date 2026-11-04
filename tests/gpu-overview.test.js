import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSystemGpuEngines } from '../src/core/telemetry.js';
import { createTelemetryController, gpuScript } from '../src/main/telemetry.js';

test('la GPU suma los procesos del mismo motor y no mezcla motores diferentes', () => {
  const rows = [
    { name: 'pid_101_luid_0x0000_0x0000_phys_0_eng_0_engtype_3D', value: 1.2 },
    { name: 'pid_102_luid_0x0000_0x0000_phys_0_eng_0_engtype_3D', value: 0.8 },
    { name: 'pid_103_luid_0x0000_0x0000_phys_0_eng_1_engtype_Copy', value: 1.5 }
  ];
  assert.equal(parseSystemGpuEngines(rows), 2);
  assert.equal(parseSystemGpuEngines([]), null);
  assert.equal(parseSystemGpuEngines([{ name: 'invalid', value: 0 }]), null);
});

test('GPU overview comparte la lectura con los procesos y cachea durante el intervalo', async () => {
  let time = 10000;
  let gpuCalls = 0;
  const telemetry = createTelemetryController({
    clock: () => time,
    gpuIntervalMs: 6000,
    query: async script => {
      if (script.includes('GPUPerformanceCounters')) {
        gpuCalls++;
        return [{ name: 'pid_101_luid_0x0000_0x0000_phys_0_eng_0_engtype_3D', value: 2.1 }];
      }
      return [];
    }
  });
  assert.equal(await telemetry.gpuOverview(), 2.1);
  assert.equal(await telemetry.gpuOverview(), 2.1);
  assert.equal(gpuCalls, 1);
  time += 6100;
  assert.equal(await telemetry.gpuOverview(), 2.1);
  assert.equal(gpuCalls, 2);
});

test('la GPU prioriza dos muestras de Get-Counter antes de CIM', () => {
  assert.ok(gpuScript.indexOf('Get-Counter') < gpuScript.indexOf('Get-CimInstance'));
  assert.match(gpuScript, /-MaxSamples 2/);
  assert.match(gpuScript, /-SampleInterval 1/);
});

test('GPU en actividad ligera conserva un 3 por ciento real', async () => {
  const telemetry = createTelemetryController({
    clock: () => 9000,
    query: async command => command.includes('GPU Engine')
      ? [{ name: 'pid_345_luid_0x0000_0x0000_phys_0_eng_0_engtype_3D', value: 3 }]
      : []
  });
  assert.equal(await telemetry.gpuOverview(), 3);
});

test('NVIDIA puede respaldar los contadores GPU con datos validos', () => {
  assert.match(gpuScript, /nvidia-smi\.exe/);
  assert.equal(parseSystemGpuEngines([{ name: 'vortex_nvidia_total', value: 3 }]), 3);
  assert.equal(parseSystemGpuEngines([{ name: 'vortex_nvidia_total', value: 0 }]), 0);
  assert.equal(parseSystemGpuEngines([{ name: 'vortex_nvidia_total', value: 'N/A' }]), null);
  assert.equal(parseSystemGpuEngines([
    { name: 'pid_111_luid_0x1_0x2_phys_0_eng_0_engtype_3D', value: 6 },
    { name: 'vortex_nvidia_total', value: 3 }
  ]), 6);
});
