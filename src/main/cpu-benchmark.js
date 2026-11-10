import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const workerSource = `import { parentPort, workerData } from 'node:worker_threads'; import { performance } from 'node:perf_hooks'; const duration = Math.max(1000, Math.min(60000, Number(workerData?.durationMs) || 20000)); const start = performance.now(); let iterations = 0; let state = 0x6d2b79f5; while (performance.now() - start < duration) { for (let index = 0; index < 12000; index++) { state = Math.imul(state ^ (state >>> 15), 1 | state); state ^= state + Math.imul(state ^ (state >>> 7), 61 | state); state ^= state >>> 14; } iterations += 12000; } parentPort.postMessage({ iterations, checksum: state >>> 0 });`;

export function cpuBenchmarkWorkerCount(logicalProcessors = os.availableParallelism?.() || os.cpus().length) {
  return Math.max(1, Math.min(6, Math.floor(Math.max(1, logicalProcessors) / 2) || 1));
}

export function createCpuBenchmarkController({ sampleMetrics = async () => null, onProgress = () => {}, clock = () => Date.now(), workerFactory = options => new Worker(workerSource, { eval: true, execArgv: [...process.execArgv.filter(argument => !argument.startsWith('--input-type')), '--input-type=module'], ...options }), workerCount = cpuBenchmarkWorkerCount() } = {}) {
  let active = null;
  let lastResult = null;

  function emit(state, extra = {}) {
    const status = { id: state.id, running: active === state, durationSeconds: state.durationSeconds, workerCount: state.workerCount, progress: state.progress || 0, elapsedSeconds: Math.max(0, Math.round((clock() - state.startedAt) / 1000)), samples: state.samples.length, ...extra };
    state.status = status;
    try { onProgress(status); } catch {}
    return status;
  }

  async function run(state) {
    try {
      const tasks = state.workers.map(worker => new Promise((resolve, reject) => {
        let received = false;
        worker.once('message', message => { received = true; resolve(message); });
        worker.once('error', reject);
        worker.once('exit', code => { if (!received && code !== 0) reject(new Error(`El proceso de prueba termino con codigo ${code}.`)); });
      }));
      const work = Promise.all(tasks);
      while (active === state && clock() - state.startedAt < state.durationSeconds * 1000) {
        await delay(1000);
        if (active !== state) return;
        const metric = await sampleMetrics().catch(() => null);
        if (metric) state.samples.push(metric);
        state.progress = Math.min(99, Math.round((clock() - state.startedAt) / (state.durationSeconds * 1000) * 100));
        emit(state, { cpuUsage: metric?.cpuUsage ?? null, cpuGHz: metric?.cpuGHz ?? null });
      }
      if (active !== state) return;
      const results = await work;
      const elapsedSeconds = Math.max(1, (clock() - state.startedAt) / 1000);
      const totalIterations = results.reduce((sum, item) => sum + (Number(item?.iterations) || 0), 0);
      const scoreMops = Math.round(totalIterations / elapsedSeconds / 10000) / 100;
      const values = key => state.samples.map(sample => sample?.[key]).filter(value => Number.isFinite(value));
      const mean = items => items.length ? Math.round(items.reduce((sum, value) => sum + value, 0) / items.length * 10) / 10 : null;
      const result = {
        id: state.id,
        scoreMops,
        durationSeconds: Math.round(elapsedSeconds * 10) / 10,
        workerCount: state.workerCount,
        averageCpuUsage: mean(values('cpuUsage')),
        averageCpuGHz: mean(values('cpuGHz')),
        completedAt: new Date(clock()).toISOString(),
        note: 'Benchmark sintetico de rendimiento. No valida estabilidad ni mide PPT, TDC, EDC o temperatura.'
      };
      if (active === state) {
        active = null;
        lastResult = result;
        state.progress = 100;
        emit(state, { running: false, completed: true, result });
      }
    } catch (error) {
      if (active === state) {
        active = null;
        await Promise.allSettled(state.workers.map(worker => worker.terminate()));
        emit(state, { running: false, error: error?.message || 'No se pudo completar el benchmark.' });
      }
    }
  }

  async function start(options = {}) {
    if (active) throw new Error('Ya hay una prueba de CPU en ejecucion.');
    const durationSeconds = Math.max(10, Math.min(45, Math.round(Number(options.durationSeconds) || 20)));
    const requestedWorkers = Math.round(Number(options.workerCount) || workerCount);
    const count = Math.max(1, Math.min(6, requestedWorkers));
    const state = { id: randomUUID(), startedAt: clock(), durationSeconds, workerCount: count, progress: 0, samples: [], workers: [], status: null };
    active = state;
    try {
      state.workers = Array.from({ length: count }, () => workerFactory({ workerData: { durationMs: durationSeconds * 1000 } }));
    } catch (error) {
      active = null;
      await Promise.allSettled(state.workers.map(worker => worker.terminate()));
      throw error;
    }
    emit(state);
    run(state);
    return { id: state.id, durationSeconds, workerCount: count };
  }

  async function stop() {
    if (!active) return { stopped: false, result: lastResult };
    const state = active;
    active = null;
    await Promise.allSettled(state.workers.map(worker => worker.terminate()));
    emit(state, { running: false, cancelled: true, message: 'Prueba detenida por el usuario.' });
    return { stopped: true };
  }

  function status() {
    return active?.status || (lastResult ? { running: false, completed: true, progress: 100, result: lastResult } : { running: false, progress: 0, result: null });
  }

  return { start, stop, status, dispose: stop };
}
