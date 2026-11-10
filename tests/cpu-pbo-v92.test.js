import test from 'node:test';
import assert from 'node:assert/strict';
import { RYZEN_5_9600X_PROFILES, RYZEN_5_9600X_STOCK_LIMITS, compareCpuBenchmarks, cpuTuningAdvice, parseCpuSensorCsv, validatePboLimits } from '../src/core/cpu-tuning.js';
import { cpuBenchmarkWorkerCount } from '../src/main/cpu-benchmark.js';

test('9600X habilita perfiles PBO pero el control sigue siendo externo', () => {
  const advice = cpuTuningAdvice('AMD Ryzen 5 9600X 6-Core Processor');
  assert.equal(advice.vendor, 'amd');
  assert.equal(advice.canConfigurePbo, true);
  assert.equal(advice.directControl, false);
  assert.equal(cpuTuningAdvice('AMD Ryzen 5 7600X').canConfigurePbo, false);
  assert.equal(cpuTuningAdvice('Intel Core i7').candidate, false);
});

test('perfiles propuestos reducen PPT TDC y EDC sin superar referencia', () => {
  assert.deepEqual(RYZEN_5_9600X_STOCK_LIMITS, { ppt: 88, tdc: 75, edc: 150 });
  for (const profile of RYZEN_5_9600X_PROFILES) assert.equal(validatePboLimits(profile).valid, true);
  assert.equal(validatePboLimits({ ppt: 90, tdc: 70, edc: 140 }).valid, false);
  assert.equal(validatePboLimits({ ppt: 70, tdc: 80, edc: 75 }).valid, false);
});

test('comparacion de benchmark calcula variacion porcentual', () => {
  assert.deepEqual(compareCpuBenchmarks({ scoreMops: 100 }, { scoreMops: 95 }), { referenceScore: 100, currentScore: 95, changePercent: -5, faster: false, difference: -5 });
  assert.equal(compareCpuBenchmarks(null, { scoreMops: 20 }), null);
});

test('importa registros CSV con lecturas PPT TDC EDC y temperatura', () => {
  const csv = 'Time,CPU PPT [W],CPU TDC [A],CPU EDC [A],CPU (Tctl/Tdie) [°C],CPU Package Power [W]\n00:00:01,40.5,30,60,61.2,35.2\n00:00:02,50.5,35,75,68.2,45.2';
  const result = parseCpuSensorCsv(csv);
  assert.equal(result.valid, true);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.pptW.average, 45.5);
  assert.equal(result.tdcA.maximum, 35);
  assert.equal(result.edcA.maximum, 75);
  assert.equal(result.temperatureC.maximum, 68.2);
  assert.equal(parseCpuSensorCsv('Date,CPU Usage\nnow,20').valid, false);
});

test('benchmark limita la cantidad de hilos de carga', () => {
  assert.equal(cpuBenchmarkWorkerCount(12), 6);
  assert.equal(cpuBenchmarkWorkerCount(2), 1);
  assert.equal(cpuBenchmarkWorkerCount(32), 6);
});
