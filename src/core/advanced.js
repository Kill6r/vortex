export const gpuLevels = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];
export const ioLevels = ['VeryLow', 'Low', 'Normal', 'High'];
export const memoryLevels = ['VeryLow', 'Low', 'Medium', 'BelowNormal', 'Normal'];
export const ecoLevels = ['System', 'Efficient', 'Performance'];
export const threadBoostLevels = ['Enabled', 'Disabled'];
export const gpuPreferenceLevels = ['System', 'PowerSaving', 'HighPerformance'];

export const advancedDefaults = Object.freeze({
  gpu: null, io: null, memory: null, efficiency: null, threadBoost: null, gpuPreference: null,
  proBalance: false, proBalanceCpu: 30, idleSaver: false, idleSeconds: 60,
  smartTrim: false, trimMinutes: 15, trimThreshold: 20
});

function select(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Valor no admitido para ${field}.`);
  return value;
}

export function validateAdvancedOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuración avanzada inválida.');
  const result = { ...advancedDefaults };
  for (const key of ['gpu', 'io', 'memory', 'efficiency', 'threadBoost', 'gpuPreference']) {
    if (input[key] !== undefined) result[key] = input[key] == null ? null : select(input[key], {
      gpu: gpuLevels, io: ioLevels, memory: memoryLevels, efficiency: ecoLevels,
      threadBoost: threadBoostLevels, gpuPreference: gpuPreferenceLevels
    }[key], key);
  }
  for (const key of ['proBalance', 'idleSaver', 'smartTrim']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') throw new Error(`La opción ${key} debe estar activada o desactivada.`);
      result[key] = input[key];
    }
  }
  const ranges = { proBalanceCpu: [10, 90], idleSeconds: [30, 900], trimMinutes: [5, 120], trimThreshold: [5, 60] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (input[key] !== undefined) {
      if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error(`El parámetro ${key} debe estar entre ${min} y ${max}.`);
      result[key] = input[key];
    }
  }
  return result;
}

export function measureCpu(previous, current, logicalCpus) {
  if (!previous || previous.started !== current.started || !Number.isFinite(current.cpuSeconds) ||
      !Number.isFinite(previous.cpuSeconds) || current.sampledAt <= previous.sampledAt) return null;
  const delta = current.cpuSeconds - previous.cpuSeconds;
  if (delta < 0) return null;
  return Math.min(100, Math.max(0, delta * 100_000 / (current.sampledAt - previous.sampledAt) / Math.max(1, logicalCpus)));
}

export function shouldProBalance(processCpu, foreground, enabled, limit) {
  return enabled && !foreground && Number.isFinite(processCpu) && processCpu >= limit;
}

export function shouldIdleSave(backgroundForSeconds, enabled, limitSeconds) {
  return enabled && backgroundForSeconds >= limitSeconds;
}

export function shouldSmartTrim(availablePercent, backgroundForSeconds, enabled, threshold) {
  return enabled && backgroundForSeconds >= 30 && availablePercent < threshold;
}
