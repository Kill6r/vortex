import { advancedDefaults } from './advanced.js';

const competitiveNames = ['valorant', 'cs2', 'counter-strike', 'fortnite', 'r5apex', 'overwatch', 'league of legends', 'rainbowsix', 'cod', 'warzone'];
const protectedNames = ['valorant', 'league of legends', 'fortnite', 'r5apex', 'rainbowsix'];

export function analyzeGameProfile(process = {}, hardware = {}) {
  const name = String(process.name || '').toLowerCase();
  const logicalCpus = Math.max(1, Number(hardware.logicalCpus) || 1);
  const ramTotal = Math.max(0, Number(hardware.ramTotal) || 0);
  const ramAvailable = Math.max(0, Number(hardware.ramAvailable) || 0);
  const ramGb = ramTotal / 1073741824;
  const memoryUsedPercent = ramTotal ? Math.min(100, Math.max(0, 100 * (ramTotal - ramAvailable) / ramTotal)) : null;
  const rawCpu = process.groupCpuPercent ?? process.cpuPercent;
  const cpuPercent = rawCpu == null ? null : Number.isFinite(Number(rawCpu)) ? Math.max(0, Number(rawCpu)) : null;
  const competitive = competitiveNames.some(value => name.includes(value));
  const protectedGame = protectedNames.some(value => name.includes(value));
  const memoryConstrained = ramGb > 0 && (ramGb < 12 || memoryUsedPercent >= 88);
  const cpuConstrained = logicalCpus <= 8 && cpuPercent != null && cpuPercent >= 60;
  const multipleGpus = Number(hardware.gpuCount) >= 2;
  const priority = protectedGame ? 'Normal' : cpuConstrained ? 'AboveNormal' : 'Normal';
  const proBalance = cpuConstrained && !protectedGame;
  const idleSaver = memoryConstrained && !protectedGame;
  const trimThreshold = ramGb > 0 && ramGb <= 8 ? 5 : 8;
  const title = memoryConstrained ? 'Memoria limitada' : cpuConstrained ? 'CPU exigida' : competitive ? 'Juego competitivo' : 'Equilibrado';
  const advanced = {
    ...advancedDefaults,
    gpuPreference: multipleGpus ? 'HighPerformance' : null,
    proBalance,
    proBalanceCpu: Math.max(20, logicalCpus <= 4 ? 25 : 35),
    idleSaver,
    idleSeconds: 180,
    smartTrim: false,
    trimMinutes: 60,
    trimThreshold
  };
  const reasons = [
    `Equipo: ${logicalCpus} procesadores lógicos y ${ramGb ? `${ramGb.toFixed(1)} GB` : 'RAM no disponible'}.`,
    memoryUsedPercent == null ? 'No se pudo medir la presión de memoria.' : `Memoria utilizada en este momento: ${memoryUsedPercent.toFixed(0)} %.`,
    priority === 'Normal' ? 'CPU en Normal: evita interferir con el juego y sus protecciones.' : 'CPU en Superior: solo porque este proceso muestra carga elevada en una CPU de pocos hilos.',
    proBalance ? 'ProBalance disponible únicamente para lanzadores secundarios permitidos, nunca para el juego.' : 'ProBalance apagado: no hay evidencia suficiente para intervenir en otros procesos.',
    idleSaver ? 'IdleSaver puede reducir temporalmente la prioridad de lanzadores inactivos autorizados.' : 'IdleSaver apagado: se prioriza estabilidad frente a pequeños ahorros de recursos.',
    'SmartTrim apagado: vaciar la memoria de trabajo puede producir recargas y tirones.',
    multipleGpus ? 'Preferencia gráfica alta disponible, pero se debe confirmar y reiniciar el juego.' : 'Preferencia gráfica sin cambios: no se identificaron varias GPU.'
  ];
  return {
    title, priority, affinity: null, advanced, reasons,
    info: { competitive, protectedGame, memoryConstrained, cpuConstrained, ramGb, memoryUsedPercent, logicalCpus },
    caveat: 'Recomendación conservadora, no un benchmark. Guardar o aplicar requiere tu confirmación.'
  };
}

export const secondaryProcessesAllowed = Object.freeze([
  'steamwebhelper', 'epicgameslauncher', 'epicwebhelper', 'goggalaxy', 'onedrive'
]);

export function chooseBackgroundAction(process, settings, { backgroundSeconds = 0, usedPercent = 0, consecutiveHighCpu = 0, lastTrimAt = -Infinity, now = 0 } = {}) {
  const name = String(process?.name || '').toLowerCase().replace(/\.exe$/u, '');
  if (!secondaryProcessesAllowed.includes(name) || process?.foreground || !Number.isFinite(process?.pid)) return null;
  const cpu = process.cpuPercent == null ? NaN : Number(process.cpuPercent);
  if (settings?.proBalance && consecutiveHighCpu >= 3 && Number.isFinite(cpu) && cpu >= settings.proBalanceCpu && process.priority === 'Normal') {
    return { kind: 'priority', value: 'BelowNormal', reason: 'ProBalance' };
  }
  if (settings?.idleSaver && backgroundSeconds >= settings.idleSeconds && Number.isFinite(cpu) && cpu < 1 && process.priority === 'Normal') {
    return { kind: 'priority', value: 'BelowNormal', reason: 'IdleSaver' };
  }
  if (settings?.smartTrim && usedPercent >= 100 - settings.trimThreshold && backgroundSeconds >= 180 &&
      Number.isFinite(cpu) && cpu < 1 && process.memory >= 350 * 1024 ** 2 && now - lastTrimAt >= settings.trimMinutes * 60000) {
    return { kind: 'trim', value: 'run', reason: 'SmartTrim' };
  }
  return null;
}
