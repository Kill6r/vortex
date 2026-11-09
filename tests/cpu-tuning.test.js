import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuTuningAdvice, cpuBaselineSummary } from '../src/core/cpu-tuning.js';

test('Ryzen se reconoce para guiar al usuario a la herramienta oficial', () => {
  const amd = cpuTuningAdvice('AMD Ryzen 5 5500 6-Core Processor');
  assert.equal(amd.vendor, 'amd');
  assert.equal(amd.external, true);
  assert.equal(amd.candidate, true);
  assert.equal(amd.supported, false);
  assert.match(amd.note, /no modifica frecuencias ni voltajes/i);
  assert.equal(cpuTuningAdvice('Intel Core i5-12400').external, false);
  assert.equal(cpuTuningAdvice('').supported, false);
});

test('lectura de referencia CPU ignora datos invalidos sin inventar temperaturas o estabilidad', () => {
  const result = cpuBaselineSummary([{ cpuUsage: 32, cpuGHz: 3.4 }, { cpuUsage: 36, cpuGHz: 3.6 }, { cpuUsage: null, cpuGHz: 12 }]);
  assert.deepEqual(result, { count: 3, averageUsage: 34, averageGhz: 3.5, peakUsage: 36 });
  assert.deepEqual(cpuBaselineSummary([]), { count: 0, averageUsage: null, averageGhz: null, peakUsage: null });
});
