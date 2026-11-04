import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSystemGpuEngines } from '../src/core/telemetry.js';
import { createTelemetryController } from '../src/main/telemetry.js';

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
