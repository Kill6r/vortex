export const restrictedProcesses = new Set([
  'system', 'idle', 'registry', 'secure system', 'smss', 'csrss', 'wininit', 'winlogon',
  'services', 'lsass', 'svchost', 'dwm', 'fontdrvhost', 'sihost', 'taskhostw',
  'explorer', 'audiodg', 'memory compression', 'antimalware service executable',
  'msmpeng', 'securityhealthservice', 'searchindexer', 'spoolsv', 'vortex', 'electron'
]);

export function processAllowed(name) {
  if (typeof name !== 'string') return false;
  const normalized = name.trim().toLowerCase().replace(/\.exe$/, '');
  return normalized.length > 1 && /^[\p{L}\p{N}_.+ -]{2,100}$/u.test(normalized) && !restrictedProcesses.has(normalized);
}

export function validateMemoryRequest(request) {
  if (!request || !['conservadora', 'intensiva'].includes(request.mode)) {
    throw new Error('Selecciona un modo de limpieza válido.');
  }
  if (!Array.isArray(request.pids) || !request.pids.length || request.pids.length > 30 ||
      request.pids.some(pid => !Number.isSafeInteger(pid) || pid <= 4 || pid > 2147483647) ||
      new Set(request.pids).size !== request.pids.length) {
    throw new Error('Selecciona de 1 a 30 procesos válidos.');
  }
  return { mode: request.mode, pids: request.pids };
}

export function validateAutoMemory(configuration) {
  const interval = Number(configuration?.intervalMinutes);
  const threshold = Number(configuration?.thresholdPercent);
  const names = configuration?.processNames;
  if (!Number.isInteger(interval) || interval < 1 || interval > 120 ||
      !Number.isInteger(threshold) || threshold < 50 || threshold > 98 ||
      !Array.isArray(names) || names.length > 20 || names.some(name => !processAllowed(name)) ||
      (configuration.enabled && !names.length)) {
    throw new Error('Elige 1–120 minutos, un límite de uso del 50–98 % y hasta 20 aplicaciones.');
  }
  return { enabled: configuration.enabled === true, intervalMinutes: interval,
    thresholdPercent: threshold, processNames: [...new Set(names.map(name => name.toLowerCase()))] };
}

export function shouldCleanMemory(available, total, thresholdUsed) {
  return total > 0 && ((total - available) / total) * 100 >= thresholdUsed;
}

export function validateGameProcess(pid, priority = 'AboveNormal') {
  if (!Number.isSafeInteger(pid) || pid <= 4 || pid > 2147483647) {
    throw new Error('Identificador de proceso inválido.');
  }
  if (!['AboveNormal', 'Normal'].includes(priority)) {
    throw new Error('Prioridad de juego no permitida.');
  }
  return { pid, priority };
}
