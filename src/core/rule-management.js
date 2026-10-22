import { processAllowed } from './performance.js';

export function normalizeRuleTarget(input) {
  if (typeof input !== 'string') throw new Error('Escribe el ejecutable o su ruta completa.');
  const value = input.trim().replaceAll('/', '\\').toLowerCase();
  if (value.length < 2 || value.length > 350 || /[\u0000-\u001f"<>|?*]/u.test(value)) {
    throw new Error('La coincidencia del proceso no es válida.');
  }
  if (value.includes('\\')) {
    if (!/^[a-z]:\\[^:]+\.exe$/iu.test(value) || value.split('\\').some(segment => segment === '..' || segment === '.')) {
      throw new Error('Escribe una ruta completa de Windows que termine en .exe.');
    }
    const name = value.slice(value.lastIndexOf('\\') + 1).replace(/\.exe$/iu, '');
    if (!processAllowed(name)) throw new Error('No se pueden crear reglas para procesos protegidos.');
    return value;
  }
  const name = value.replace(/\.exe$/iu, '');
  if (!processAllowed(name)) throw new Error('No se pueden crear reglas para este proceso.');
  return name;
}

export function ruleTarget(rule) {
  return normalizeRuleTarget(rule.match || rule.name);
}

export function ruleMatchesProcess(rule, process) {
  if (!process || typeof process.name !== 'string') return false;
  const target = ruleTarget(rule);
  if (target.includes('\\')) {
    return typeof process.path === 'string' && process.path.replaceAll('/', '\\').toLowerCase() === target;
  }
  return process.name.toLowerCase().replace(/\.exe$/u, '') === target;
}

export function findRuleForProcess(rules, process) {
  if (!Array.isArray(rules)) return null;
  const candidates = rules.filter(rule => ruleMatchesProcess(rule, process));
  return candidates.find(rule => ruleTarget(rule).includes('\\')) || candidates[0] || null;
}

export function ruleProcessName(target) {
  const name = normalizeRuleTarget(target).split('\\').pop();
  return name.replace(/\.exe$/u, '');
}

export function ruleSummary(rule) {
  const advanced = rule.advanced || {};
  return ['gpu', 'io', 'memory', 'efficiency', 'threadBoost', 'gpuPreference']
    .filter(key => advanced[key] != null).length + ['proBalance', 'idleSaver', 'smartTrim']
    .filter(key => advanced[key] === true).length + Number(rule.affinity != null) + 1;
}
