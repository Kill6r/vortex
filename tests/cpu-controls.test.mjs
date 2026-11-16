import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { validateCurveOptimizer, summarizeCpuRecording, compareCpuBenchmarks } from '../src/core/cpu-tuning.js';
import { normalizeCpuSensors } from '../src/main/cpu-sensors.js';
import { createCpuBenchmarkController } from '../src/main/cpu-benchmark.js';
import { createCpuProfileSweep } from '../src/main/cpu-profile-sweep.js';
import { readCpuHardwareEvents } from '../src/main/cpu-hardware-events.js';

test('curve optimizer acepta signos por núcleo y rechaza valores incompletos', () => {
  assert.equal(validateCurveOptimizer([-30, 30, 0], 3).valid, true);
  for (const values of [[-31,0,0], [0,31,0], ['',0,0], [0.5,0,0], [0,0]]) assert.equal(validateCurveOptimizer(values,3).valid,false);
});

test('grabación conserva ceros y no convierte sensores ausentes en lecturas', () => {
  const summary = summarizeCpuRecording([{cpuUsage:0,temperatureC:null},{cpuUsage:20,temperatureC:60}]);
  assert.equal(summary.cpuUsage.average,10);
  assert.equal(summary.temperatureC.average,60);
  assert.equal(summary.pptW.average,null);
  assert.equal(compareCpuBenchmarks({scoreMops:10,workerCount:1},{scoreMops:20,workerCount:2}),null);
});

test('sensores excluyen GPU, porcentajes y límites y aceptan la temperatura CPU', () => {
  const rows = [{Identifier:'/amdcpu/0/temperature/0',Name:'CPU (Tctl/Tdie)',SensorType:'Temperature',Value:65}, {Identifier:'/gpu/0/power/0',Name:'CPU Package',SensorType:'Power',Value:100}, {Identifier:'/amdcpu/0/load/0',Name:'PPT',SensorType:'Load',Value:90}];
  const value=normalizeCpuSensors(rows);
  assert.equal(value.temperatureC,65);
  assert.equal(value.packagePowerW,null);
  assert.equal(value.pptW,null);
});

test('benchmark usa un hilo o varios y limita peticiones al hardware disponible', async () => {
  let created = 0;
  const controller = createCpuBenchmarkController({workerFactory:() => {created++; const worker = new EventEmitter(); worker.terminate=async()=>{}; return worker;}});
  const single = await controller.start({workerCount:1});
  assert.equal(single.workerCount,1);
  await controller.stop();
  const multi=await controller.start({workerCount:999999});
  assert.ok(multi.workerCount>=1 && multi.workerCount<999999);
  assert.equal(created,multi.workerCount+1);
  await controller.stop();
});

test('un hilo que sale sin resultado termina el benchmark incluso con código cero', async () => {
  const worker = new EventEmitter();
  worker.terminate = async () => {};
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const controller = createCpuBenchmarkController({
    workerFactory: () => worker,
    onProgress: status => { if (!status.running) finish(status); }
  });
  await controller.start({ workerCount: 1 });
  worker.emit('exit', 0);
  const status = await completed;
  assert.match(status.error, /sin entregar resultados/);
  assert.equal(controller.status(), status);
});

test('una lectura de sensores bloqueada no retrasa el resultado ni reduce la puntuación', { timeout: 4000 }, async () => {
  const worker = new EventEmitter();
  worker.terminate = async () => {};
  let sampleStarted;
  let finish;
  const sampling = new Promise(resolve => { sampleStarted = resolve; });
  const completed = new Promise(resolve => { finish = resolve; });
  const controller = createCpuBenchmarkController({
    workerFactory: () => worker,
    sampleMetrics: () => {
      sampleStarted();
      return new Promise(() => {});
    },
    onProgress: status => { if (!status.running) finish(status); }
  });
  try {
    await controller.start({ workerCount: 1, durationSeconds: 10 });
    await sampling;
    worker.emit('message', { iterations: 100000000, elapsedMs: 10000 });
    const status = await completed;
    assert.equal(status.completed, true);
    assert.equal(status.result.scoreMops, 10);
    assert.equal(status.result.durationSeconds, 10);
    assert.equal(compareCpuBenchmarks({ ...status.result, benchmarkVersion: 1 }, status.result), null);
  } finally {
    await controller.stop();
  }
});

test('la ronda descarta un resultado que alcanzó el límite térmico antes de guardar', { timeout: 4000 }, async () => {
  const tuning = {
    supported: true, cpu: 'AMD Ryzen 5 9600X', tableVersion: '0x00620105',
    limits: { ppt: 95, tdc: 60, edc: 90 }, scalar: 1, fmaxMHz: 5450,
    curveOptimizer: [0, 0, 0, 0, 0, 0], fingerprint: '95:60:90:1:5450:0:0:0:0:0:0'
  };
  let saved = 0;
  let sampledAt = 0;
  const sweep = createCpuProfileSweep({
    read: () => ({ tuningReady: true, tuning, temperatureC: 60, pptW: 55, thermalLimitC: 95, sampledAt: ++sampledAt }),
    runBenchmark: async () => ({ configuration: tuning, sensors: { temperatureSamples: 10, maxTemperatureC: 85 } }),
    tune: async () => assert.fail('El primer perfil es la configuración activa'),
    wait: async () => {},
    onResult: () => { saved++; }
  });
  const analysis = await sweep.analyze();
  sweep.start({ durationSeconds: 10, workerCount: 1, maxBoostMHz: 0, analysisId: analysis.id });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sweep.isRunning(), false);
  assert.equal(sweep.status().restored, true);
  assert.match(sweep.status().error, /85 °C/);
  assert.equal(sweep.status().results.length, 0);
  assert.equal(saved, 0);
});

test('el análisis es de solo lectura y la búsqueda combina perfiles medidos sin superar PBO inicial', async () => {
  const key = target => [target.limits.ppt, target.limits.tdc, target.limits.edc, target.scalar, target.fmaxMHz, ...target.curveOptimizer].join(':');
  const baseline = {
    supported: true, cpu: 'AMD Ryzen 5 9600X', tableVersion: '0x00620105',
    limits: { ppt: 95, tdc: 60, edc: 90 }, scalar: 1, fmaxMHz: 5450,
    curveOptimizer: [-25, -20, -15, 0, 0, 0]
  };
  let tuning = { ...baseline, fingerprint: key(baseline) };
  let sampledAt = 0;
  const writes = [];
  const trials = [];
  const windows = [];
  let now = 1000;
  let hardwareResult = 'clean';
  const sweep = createCpuProfileSweep({
    read: () => ({ tuningReady: true, tuning, temperatureC: 62, pptW: 55, thermalLimitC: 95, sampledAt: ++sampledAt }),
    tune: async (target, expected) => {
      assert.equal(expected, tuning.fingerprint);
      tuning = { ...baseline, ...target, fingerprint: key(target) };
      writes.push(tuning);
      return { after: tuning };
    },
    runBenchmark: async ({ configuration, durationSeconds, workerCount }) => {
      trials.push(configuration);
      const { ppt, tdc, edc } = configuration.limits;
      const scoreMops = 300 - configuration.curveOptimizer[0] + (95 - ppt) + (60 - tdc) + (90 - edc) + (configuration.fmaxMHz - 5450);
      now += durationSeconds * 1000;
      return { id: String(trials.length), configuration, scoreMops, workerCount,
        sensors: { temperatureSamples: durationSeconds - 1, maxTemperatureC: 70 } };
    },
    readHardwareEvents: async (from, to) => {
      windows.push({ from, to });
      if (hardwareResult === 'unavailable') throw new Error('Acceso denegado');
      return hardwareResult === 'error' && tuning.fmaxMHz === 5475 ? [{ id: 19, at: to }] : [];
    },
    clock: () => now,
    wait: async () => {}
  });
  const options = { durationSeconds: 10, workerCount: 1, maxBoostMHz: 25, objective: 'performance' };
  assert.throws(() => sweep.start(options), /Analizar CPU/);
  const analysis = await sweep.analyze();
  assert.equal(analysis.ceiling, 85);
  assert.equal(writes.length, 0);
  assert.equal(trials.length, 0);

  tuning = { ...tuning, fmaxMHz: 5475 };
  tuning.fingerprint = key(tuning);
  assert.throws(() => sweep.start({ ...options, analysisId: analysis.id }), /Analizar CPU/);
  tuning = { ...baseline, fingerprint: key(baseline) };
  const fresh = await sweep.analyze();
  sweep.start({ ...options, analysisId: fresh.id });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(sweep.isRunning(), false);
  assert.equal(sweep.status().restored, true);
  assert.equal(sweep.status().results.length, 10);
  assert.ok(trials.some(row => row.limits.ppt !== baseline.limits.ppt));
  assert.ok(trials.some(row => row.limits.tdc !== baseline.limits.tdc));
  assert.ok(trials.some(row => row.limits.edc !== baseline.limits.edc));
  assert.ok(trials.every(row => Object.keys(baseline.limits).every(key => row.limits[key] <= baseline.limits[key])));
  assert.deepEqual(trials.at(-1).limits, { ppt: 76, tdc: 48, edc: 72 });
  assert.deepEqual(trials.at(-1).curveOptimizer, [-30, -25, -20, -5, -5, -5]);
  assert.equal(trials.at(-1).fmaxMHz, 5475);
  assert.equal(writes.at(-1).fingerprint, key(baseline));

  const recommendation = sweep.status().results.at(-1);
  assert.throws(() => sweep.startValidation({ resultId: 'unknown', expectedFingerprint: tuning.fingerprint }), /búsqueda completada/);
  assert.throws(() => sweep.startValidation({ resultId: recommendation.id, expectedFingerprint: 'stale' }), /Cambió el perfil/);
  sweep.startValidation({ resultId: recommendation.id, expectedFingerprint: tuning.fingerprint });
  await new Promise(resolve => setImmediate(resolve));
  let status = sweep.status();
  assert.equal(status.validation.restored, true);
  assert.equal(status.results.length, 10);
  assert.deepEqual(status.validation.results.map(row => [row.role, row.validationSeconds, row.workerCount]), [
    ['baseline', 20, 1], ['candidate', 20, 1], ['baseline', 90, 1], ['candidate', 90, 1]
  ]);
  assert.deepEqual(windows.map(({ from, to }) => (to - from) / 1000), [20, 20, 90, 90]);
  assert.ok(status.validation.results.every(row => row.hardwareEvents.length === 0));
  assert.equal(tuning.fingerprint, key(baseline));

  hardwareResult = 'error';
  sweep.startValidation({ resultId: recommendation.id, expectedFingerprint: tuning.fingerprint });
  await new Promise(resolve => setImmediate(resolve));
  status = sweep.status();
  assert.equal(status.validation.hardwareErrors, true);
  assert.equal(status.validation.restored, true);
  assert.equal(status.validation.results.length, 2);
  assert.equal(status.validation.results.at(-1).hardwareEvents[0].id, 19);
  assert.equal(tuning.fingerprint, key(baseline));

  hardwareResult = 'unavailable';
  sweep.startValidation({ resultId: recommendation.id, expectedFingerprint: tuning.fingerprint });
  await new Promise(resolve => setImmediate(resolve));
  status = sweep.status();
  assert.equal(status.validation.restored, true);
  assert.equal(status.validation.results.length, 4);
  assert.ok(status.validation.results.every(row => row.hardwareEvents === null));
});

test('el registro WHEA distingue una consulta vacía de una respuesta no verificable', async () => {
  const check = async command => {
    assert.match(command, /Microsoft-Windows-WHEA-Logger/);
    assert.match(command, /StartTime = \$from; EndTime = \$until/);
    return { events: [] };
  };
  assert.deepEqual(await readCpuHardwareEvents(1000, 2000, check), []);
  await assert.rejects(readCpuHardwareEvents(1000, 2000, async () => null), /registro de hardware verificable/);
  await assert.rejects(readCpuHardwareEvents(1000, 2000, async () => ({ events: [{ id: 19, at: 999 }] })), /registro de hardware verificable/);
});
