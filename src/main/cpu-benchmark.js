import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { BENCHMARK_MAX_SECONDS, BENCHMARK_VERSION, summarizeBenchmarkSensors } from '../core/cpu-benchmark-analysis.js';

const workerSource = `
  import { parentPort, workerData } from 'node:worker_threads';
  import { performance } from 'node:perf_hooks';
  const start = performance.now();
  let iterations = 0;
  let state = 0x6d2b79f5;
  while (performance.now() - start < workerData.durationMs) {
    for (let index = 0; index < 12000; index++) {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      state ^= state >>> 14;
    }
    iterations += 12000;
  }
  parentPort.postMessage({ iterations, elapsedMs: performance.now() - start, checksum: state >>> 0 });
`;

function createWorker(options) {
  const execArgv = [...process.execArgv.filter(argument => !argument.startsWith('--input-type')), '--input-type=module'];
  return new Worker(workerSource, { eval: true, execArgv, ...options });
}

function readWorkerResult(worker, durationMs) {
  return new Promise((resolve, reject) => {
    worker.once('message', result => {
      if (!Number.isSafeInteger(result?.iterations) || result.iterations <= 0 ||
        !Number.isFinite(result.elapsedMs) || result.elapsedMs < durationMs) {
        reject(new Error('Un hilo del benchmark devolvió un resultado no válido.'));
      } else {
        resolve(result);
      }
    });
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Un hilo del benchmark terminó sin entregar resultados (código ${code}).`)));
  });
}

export function cpuBenchmarkWorkerCount(logicalProcessors = os.availableParallelism?.() || os.cpus().length) {
  return Math.max(1, Math.min(6, Math.floor(Math.max(1, logicalProcessors) / 2) || 1));
}

export function createCpuBenchmarkController({ sampleMetrics = async () => null, onProgress = () => {}, clock = () => performance.now(), workerFactory = createWorker, workerCount = cpuBenchmarkWorkerCount() } = {}) {
  let active = null;
  let lastStatus = { running: false, progress: 0, result: null };
  let lastResult = null;

  function emit(state, extra = {}) {
    const status = {
      id: state.id, running: active === state, durationSeconds: state.durationSeconds, workerCount: state.workerCount,
      progress: state.progress, elapsedSeconds: Math.max(0, Math.round((clock() - state.startedAt) / 1000)),
      samples: state.samples.length, ...extra
    };
    state.status = status;
    if (!status.running) lastStatus = status;
    try { onProgress(status); } catch {}
  }

  async function collectSample(state) {
    if (state.sampling || state.cancelled) return;
    state.sampling = true;
    let metric;
    try { metric = await sampleMetrics(); } catch {}
    finally { state.sampling = false; }
    if (active !== state || state.cancelled) return;
    state.metric = metric;
    if (metric) {
      if (state.configuration && metric.tuning?.fingerprint !== state.configuration.fingerprint) state.configuration = null;
      if (metric.sensorSampledAt !== state.lastSensorSampledAt || metric.sensorSampledAt == null) {
        state.samples.push(metric);
        state.lastSensorSampledAt = metric.sensorSampledAt;
      }
    }
  }

  async function run(state, tasks) {
    const interval = setInterval(() => {
      if (state.cancelled) return;
      state.progress = Math.min(99, Math.round((clock() - state.startedAt) / (state.durationSeconds * 1000) * 100));
      emit(state, { cpuUsage: state.metric?.cpuUsage ?? null, cpuGHz: state.metric?.cpuGHz ?? null });
      void collectSample(state);
    }, 1000);
    let deadline;
    const timeout = new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('El benchmark superó el tiempo de espera de los hilos.')), state.durationSeconds * 1000 + 10000);
    });
    let outcome;
    try {
      const results = await Promise.race([Promise.all(tasks), timeout, state.cancellation]);
      if (!state.cancelled) {
        const mean = key => {
          const values = state.samples.map(sample => sample[key]).filter(Number.isFinite);
          return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const scoreMops = results.reduce((sum, row) => sum + row.iterations / row.elapsedMs / 1000, 0);
        const result = {
          id: state.id,
          scoreMops: Math.round(scoreMops * 100) / 100,
          durationSeconds: Math.round(Math.max(...results.map(row => row.elapsedMs)) / 100) / 10,
          workerCount: state.workerCount,
          testDurationSeconds: state.durationSeconds,
          benchmarkVersion: BENCHMARK_VERSION,
          averageCpuUsage: mean('cpuUsage'),
          averageCpuGHz: mean('cpuGHz'),
          completedAt: new Date().toISOString(),
          configuration: state.configuration,
          sensors: summarizeBenchmarkSensors(state.samples)
        };
        lastResult = result;
        state.progress = 100;
        outcome = { completed: true, result };
      }
    } catch (error) {
      outcome = { error: error?.message || 'No se pudo completar el benchmark.' };
    } finally {
      clearTimeout(deadline);
      clearInterval(interval);
      if (state.cancelled || outcome?.error) {
        await Promise.allSettled(state.workers.map(async worker => worker.terminate()));
      }
      active = null;
      emit(state, state.cancelled ? { cancelled: true } : outcome);
    }
  }

  async function start(options = {}) {
    if (active) throw new Error('Ya hay una prueba de CPU en ejecución.');
    const durationSeconds = Math.max(10, Math.min(BENCHMARK_MAX_SECONDS, Math.round(Number(options.durationSeconds) || 20)));
    const requestedWorkers = Math.round(Number(options.workerCount) || workerCount);
    const count = Math.max(1, Math.min(os.availableParallelism?.() || os.cpus().length || 1, requestedWorkers));
    const state = {
      id: randomUUID(), startedAt: clock(), durationSeconds, workerCount: count, configuration: options.configuration ?? null,
      progress: 0, samples: [], workers: [], cancelled: false
    };
    state.cancellation = new Promise(resolve => { state.cancel = resolve; });
    active = state;
    const tasks = [];
    try {
      for (let index = 0; index < count; index++) {
        const durationMs = durationSeconds * 1000;
        const worker = workerFactory({ workerData: { durationMs } });
        state.workers.push(worker);
        tasks.push(readWorkerResult(worker, durationMs));
      }
    } catch (error) {
      void Promise.allSettled(tasks);
      state.finished = Promise.allSettled(state.workers.map(async worker => worker.terminate()));
      await state.finished;
      active = null;
      throw error;
    }
    state.finished = run(state, tasks);
    emit(state);
    return { id: state.id, durationSeconds, workerCount: count };
  }

  async function stop() {
    if (!active) return { stopped: false, result: lastResult };
    const state = active;
    state.cancelled = true;
    state.cancel();
    await state.finished;
    return { stopped: true };
  }

  function status() { return active?.status ?? lastStatus; }

  return { start, stop, status, dispose: stop };
}
