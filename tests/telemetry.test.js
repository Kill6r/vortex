import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGpuEngines, sampleProcesses, validateMemoryProfileName } from '../src/core/telemetry.js';
import { createTelemetryController } from '../src/main/telemetry.js';

const row = (pid, cpuSeconds, memory, started = '2026-10-21T00:00:00Z') => ({
  pid, name: 'chrome', cpuSeconds, memory, privateMemory: memory, started, visible: pid === 101, foreground: false, title: pid === 101 ? 'Chrome' : ''
});

test('agrupa todos los procesos de Chrome y suma CPU y memoria', () => {
  const first = sampleProcesses([row(101, 2, 300), row(102, 1, 700)], new Map(), 1000, 4, 10_000);
  const second = sampleProcesses([row(101, 2.4, 400), row(102, 1.4, 800)], first.samples, 2000, 4, 10_000);
  assert.equal(second.groups.length, 1);
  assert.equal(second.groups[0].count, 2);
  assert.equal(second.groups[0].memory, 1200);
  assert.equal(second.groups[0].ramPercent, 12);
  assert.ok(Math.abs(second.groups[0].cpuPercent - 20) < 0.01);
});

test('no reutiliza CPU al cambiar identidad del proceso', () => {
  const first = sampleProcesses([row(101, 2, 300)], new Map(), 1000, 4, 10_000);
  const second = sampleProcesses([row(101, 5, 300, '2026-10-21T01:00:00Z')], first.samples, 2000, 4, 10_000);
  assert.equal(second.groups[0].cpuPercent, null);
});

test('agrupa contadores de GPU por identificador del proceso', () => {
  const gpu = parseGpuEngines([
    { name: 'pid_101_luid_0x00_phys_0_eng_0_engtype_3D', value: 5 },
    { name: 'pid_101_luid_0x00_phys_0_eng_1_engtype_Copy', value: 2 },
    { name: 'pid_102_luid_0x00_phys_0_eng_0_engtype_3D', value: 4 }
  ]);
  assert.equal(gpu[101], 5);
  const data = sampleProcesses([row(101, 1, 100), row(102, 1, 100)], new Map(), 1000, 4, 1000, gpu);
  assert.equal(data.groups[0].gpuPercent, 9);
});

test('valida nombres de perfiles locales', () => {
  assert.equal(validateMemoryProfileName('  Mis juegos  '), 'Mis juegos');
  assert.throws(() => validateMemoryProfileName('../data'));
});

test('telemetría devuelve grupos y CPU entre muestras', async () => {
  let time = 1000;
  let reads = 0;
  const telemetry = createTelemetryController({
    clock: () => time,
    cpuCount: 4,
    totalMem: () => 10000,
    query: async script => {
      if (script.includes('GPUPerformanceCounters')) return [];
      reads++;
      return [row(101, reads, 500), row(102, reads, 700)];
    }
  });
  assert.equal((await telemetry.snapshot()).groups[0].cpuPercent, null);
  time = 6000;
  const next = await telemetry.snapshot();
  assert.equal(next.groups[0].count, 2);
  assert.equal(next.groups[0].cpuPercent, 10);
  assert.equal(reads, 2);
  telemetry.dispose();
});
