import os from 'node:os';

function getCpuTimes() {
  return os.cpus().reduce((sum, cpu) => {
    const current = cpu.times;
    sum.total += Object.values(current).reduce((value, next) => value + next, 0);
    sum.idle += current.idle;
    return sum;
  }, { idle: 0, total: 0 });
}

export function calculateSystemCpu(previous, current) {
  if (!previous || !current) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : null;
}

export function calculateGpuOverview(groups, supported) {
  if (!supported || !Array.isArray(groups)) return null;
  const values = groups.map(group => group.gpuPercent).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.max(0, Math.min(100, values.reduce((sum, value) => sum + value, 0)));
}

export function createLiveMetricsController(dependencies = {}) {
  const cpuTimes = dependencies.cpuTimes || getCpuTimes;
  const gpuSampler = dependencies.gpuSampler || (dependencies.telemetry ? () => dependencies.telemetry.gpuOverview?.() : null);
  const ram = dependencies.ram || (() => ({ total: os.totalmem(), available: os.freemem() }));
  const clock = dependencies.clock || (() => Date.now());
  const gpuIntervalMs = dependencies.gpuIntervalMs ?? 12000;
  let lastCpu = cpuTimes();
  let cached = null;
  let at = -Infinity;
  let gpuUsage = null;
  let lastGpuAttempt = -Infinity;
  let gpuPending = null;

  function sampleGpu() {
    if (!gpuSampler || gpuPending || clock() - lastGpuAttempt < gpuIntervalMs) return;
    lastGpuAttempt = clock();
    gpuPending = Promise.resolve().then(gpuSampler)
      .then(result => { gpuUsage = Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : null; })
      .catch(() => { gpuUsage = null; })
      .finally(() => { gpuPending = null; });
  }

  async function snapshot() {
    if (cached && clock() - at < 900) return { ...cached, gpuUsage, gpuEstimated: gpuUsage !== null };
    const nextCpu = cpuTimes();
    const cpuUsage = calculateSystemCpu(lastCpu, nextCpu);
    lastCpu = nextCpu;
    const values = ram();
    at = clock();
    cached = { cpuUsage, ramTotal: values.total, ramAvailable: values.available, sampledAt: at };
    sampleGpu();
    return { ...cached, gpuUsage, gpuEstimated: gpuUsage !== null };
  }

  return { snapshot };
}
