import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSystemCpu, calculateGpuOverview, createLiveMetricsController } from '../src/main/live-metrics.js';

test('calcula CPU del sistema como diferencia entre muestras', () => {
  assert.equal(calculateSystemCpu({total:1000,idle:750},{total:1200,idle:800}),75);
  assert.equal(calculateSystemCpu(null,{total:1200,idle:800}),null);
  assert.equal(calculateSystemCpu({total:1000,idle:750},{total:1000,idle:750}),null);
});

test('GPU ausente se muestra como no disponible, no como 0 inventado', () => {
  assert.equal(calculateGpuOverview([],false),null);
  assert.equal(calculateGpuOverview([{gpuPercent:null}],true),null);
  assert.equal(calculateGpuOverview([{gpuPercent:8},{gpuPercent:15}],true),23);
});

test('CPU y RAM se muestran sin esperar la consulta de GPU', async () => {
  const times = [{ total: 1000, idle: 750 }, { total: 1100, idle: 780 }, { total: 1200, idle: 820 }];
  let complete;
  let now = 2000;
  const controller = createLiveMetricsController({
    cpuTimes: () => times.shift(),
    clock: () => now,
    gpuSampler: () => new Promise(resolve => { complete = resolve; }),
    ram: () => ({ total: 16e9, available: 8e9 })
  });
  const first = await controller.snapshot();
  assert.deepEqual(first, {
    cpuUsage: 70, gpuUsage: null, gpuEstimated: false,
    ramTotal: 16e9, ramAvailable: 8e9, sampledAt: 2000
  });
  await Promise.resolve();
  assert.equal(typeof complete, 'function');
  complete(17);
  await Promise.resolve();
  await Promise.resolve();
  now = 3200;
  const next = await controller.snapshot();
  assert.equal(next.gpuUsage, 17);
  assert.equal(next.gpuEstimated, true);
});
