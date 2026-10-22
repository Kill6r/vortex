import { processAllowed, validateGameProcess } from './performance.js';
import { normalizeRuleTarget, ruleProcessName } from './rule-management.js';

export const cpuPriorities = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

export function validatePriority(priority) {
  if (!cpuPriorities.includes(priority)) throw new Error('Esa prioridad de CPU no está permitida.');
  return priority;
}

export function validateAffinity(mask, cpuCount) {
  if (!Number.isInteger(cpuCount) || cpuCount < 1) throw new Error('No se pudo determinar el número de procesadores lógicos.');
  if (cpuCount > 62) throw new Error('La afinidad todavía no es compatible con equipos de más de 62 procesadores lógicos.');
  if (typeof mask !== 'string' || !/^[1-9]\d{0,18}$/.test(mask)) throw new Error('Selecciona al menos un procesador lógico.');
  const number = BigInt(mask);
  if (number === 0n || number >= (1n << BigInt(cpuCount))) throw new Error('La máscara de afinidad contiene procesadores no disponibles.');
  return mask;
}

export function maskFromCores(cores, cpuCount) {
  if (!Array.isArray(cores) || cores.length === 0 || cores.length > 62 ||
    cores.some(core => !Number.isInteger(core) || core < 0 || core >= cpuCount)) {
    throw new Error('Selecciona procesadores lógicos válidos.');
  }
  return [...new Set(cores)].reduce((mask, core) => mask | (1n << BigInt(core)), 0n).toString();
}

export function coresFromMask(mask, cpuCount) {
  if (typeof mask !== 'string' || !/^-?\d+$/.test(mask) || !Number.isInteger(cpuCount)) return [];
  const number = BigInt(mask);
  return Array.from({ length: Math.min(cpuCount, 62) }, (_, core) => core).filter(core => (number & (1n << BigInt(core))) !== 0n);
}

export function validateGameRule(input, cpuCount) {
  const match = normalizeRuleTarget(input?.match || input?.name);
  return { name: ruleProcessName(match), match, priority: validatePriority(input.priority),
    affinity: input.affinity == null ? null : validateAffinity(input.affinity, cpuCount),
    auto: input.auto === true };
}

export function validateAction(input, cpuCount) {
  validateGameProcess(input?.pid);
  if (!['priority', 'affinity'].includes(input?.kind)) throw new Error('Acción de juego desconocida.');
  return { pid: input.pid, started: input.started, kind: input.kind,
    value: input.kind === 'priority' ? validatePriority(input.value) : validateAffinity(input.value, cpuCount) };
}

export function validateAdvancedAction(input) {
  validateGameProcess(input?.pid);
  if (!['gpu', 'io', 'memory', 'efficiency', 'threadBoost', 'gpuPreference', 'trim'].includes(input?.kind)) throw new Error('Operación avanzada desconocida.');
  return { pid: input.pid, started: input.started, kind: input.kind, value: input.value };
}
