import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { getSystemOverview } from '../src/main/system.js';
import { createTelemetryController } from '../src/main/telemetry.js';

test('el resumen inicial obtiene CPU, RAM y plataforma localmente', async () => {
  const summary = await getSystemOverview();
  assert.equal(summary.platform, process.platform);
  assert.equal(summary.ramTotal, os.totalmem());
  assert.ok(summary.cpu);
  assert.deepEqual(summary.gpus, []);
});

test('la GPU puede consultarse sin enumerar procesos', async () => {
  const requests = [];
  const telemetry = createTelemetryController({
    query: async command => {
      requests.push(command);
      return [
        { name: 'pid_10_luid_0x00_phys_0_eng_0_engtype_3D', value: 10 },
        { name: 'pid_12_luid_0x00_phys_0_eng_0_engtype_3D', value: 12 },
        { name: 'pid_10_luid_0x00_phys_0_eng_1_engtype_Copy', value: 3 }
      ];
    }
  });
  assert.equal(await telemetry.gpuOverview(), 22);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /GPUPerformanceCounters/);
  telemetry.dispose();
});
