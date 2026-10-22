import os from 'node:os';
import { explainWindowsError } from '../core/errors.js';
import { getDesktopProcesses, inspectProcess, setProcessAffinity, setProcessPriority } from './processes.js';
import { readAdvancedProcess, setAdvancedProcess } from './native.js';
import { readGpuPreference, setGpuPreference } from './gpu-preference.js';
import { validateGameProcess } from '../core/performance.js';
import { validateAction, validateAdvancedAction, validateGameRule, validatePriority } from '../core/gaming.js';
import { measureCpu, validateAdvancedOptions } from '../core/advanced.js';
import { findRuleForProcess, ruleMatchesProcess, ruleTarget } from '../core/rule-management.js';
import { analyzeGameProfile, chooseBackgroundAction, secondaryProcessesAllowed } from '../core/game-advisor.js';

export function createGamingController(dependencies = {}) {
  const listProcesses = dependencies.listProcesses || getDesktopProcesses;
  const getProcess = dependencies.inspect || inspectProcess;
  const changePriority = dependencies.setPriority || setProcessPriority;
  const changeAffinity = dependencies.setAffinity || setProcessAffinity;
  const readAdvanced = dependencies.readAdvanced || readAdvancedProcess;
  const changeAdvanced = dependencies.setAdvanced || setAdvancedProcess;
  const readPreference = dependencies.readGpuPreference || readGpuPreference;
  const changePreference = dependencies.setGpuPreference || setGpuPreference;
  const cpuCount = dependencies.cpuCount || os.cpus().length;
  const getMemory = dependencies.getMemory || (() => ({ total: os.totalmem(), available: os.freemem() }));
  const gpuCount = dependencies.gpuCount || (async () => 0);
  const allowAutomatic = dependencies.allowAutomatic || (() => false);
  const clock = dependencies.clock || (() => Date.now());
  const store = dependencies.ruleStore || { read: () => [], write: () => {} };
  let rules = store.read();
  let current = null;
  let queue = Promise.resolve();
  let timer = null;
  let lastList = [];
  let lastRead = 0;
  let pendingList = null;
  const samples = new Map();
  const backgroundHistory = new Map();
  const backgroundChanges = new Map();
  let lastBackgroundRun = -Infinity;
  let watching = false;

  function locked(operation) {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  }

  function safePriority(value) {
    return ['Idle', 'BelowNormal'].includes(value) ? 'Normal' : value;
  }

  function safeGameOptions(options) {
    return validateAdvancedOptions(options);
  }

  function status() {
    if (!current) return null;
    const { savedAdvanced, ...safe } = current;
    return { ...safe, backgroundChanges: backgroundChanges.size };
  }

  async function list() {
    if (pendingList) return pendingList;
    if (clock() - lastRead < 1250 && lastList.length) return lastList;
    pendingList = (async () => {
      const entries = await listProcesses();
      const sampledAt = clock();
      const result = entries.map(entry => {
        const value = { ...entry, sampledAt };
        const cpuPercent = measureCpu(samples.get(entry.pid), value, cpuCount);
        samples.set(entry.pid, value);
        return { ...value, cpuPercent: entry.cpuPercent ?? cpuPercent,
          groupCpuPercent: entry.groupCpuPercent ?? null,
          groupMemory: entry.groupMemory ?? null,
          ramPercent: entry.ramPercent ?? null,
          gpuPercent: entry.gpuPercent ?? null,
          processCount: entry.processCount ?? 1 };
      });
      const live = new Set(result.map(entry => entry.pid));
      for (const pid of samples.keys()) if (!live.has(pid)) samples.delete(pid);
      lastList = result;
      lastRead = sampledAt;
      return result;
    })();
    try { return await pendingList; }
    finally { pendingList = null; }
  }

  async function recommend(pid) {
    validateGameProcess(pid);
    const process = await getProcess(pid);
    const memory = getMemory();
    const sampled = await list().then(items => items.find(item => item.pid === pid && item.started === process.started)).catch(() => null);
    let adapters = 0;
    try { adapters = await gpuCount(); } catch {}
    return analyzeGameProfile({ ...process, ...(sampled || {}) }, {
      logicalCpus: cpuCount, ramTotal: memory.total, ramAvailable: memory.available, gpuCount: adapters
    });
  }

  function savedRules() {
    return rules.map(rule => ({ ...rule, match: ruleTarget(rule), advanced: validateAdvancedOptions(rule.advanced) }));
  }

  function saveRule(input, previousMatch = null) {
    const validated = validateGameRule(input, cpuCount);
    const rule = { ...validated, priority: safePriority(validated.priority), advanced: safeGameOptions(validateAdvancedOptions(input?.advanced)) };
    const previous = previousMatch == null ? null : ruleTarget({ match: previousMatch });
    if (previous && previous !== rule.match && !rules.some(item => ruleTarget(item) === previous)) {
      throw new Error('La regla original ya no existe. Actualiza la lista.');
    }
    if (previous && previous !== rule.match && rules.some(item => ruleTarget(item) === rule.match)) {
      throw new Error('Ya existe una regla para ese ejecutable.');
    }
    const next = [...rules.filter(item => ![rule.match, previous].includes(ruleTarget(item))), rule];
    store.write(next);
    rules = next;
    return savedRules();
  }

  function deleteRule(name) {
    const target = ruleTarget({ match: name });
    const next = rules.filter(item => ruleTarget(item) !== target);
    store.write(next);
    rules = next;
    return savedRules();
  }

  async function applyExtended(pid, started, advanced, previous) {
    const changed = [];
    try {
      for (const key of ['gpu', 'io', 'memory', 'efficiency', 'threadBoost']) {
        if (advanced[key] == null) continue;
        if (previous[key] == null) throw new Error(`No se puede leer ${key} para garantizar su restauración.`);
        changed.push(key);
        await changeAdvanced(pid, started, key, advanced[key]);
        const actual = await readAdvanced(pid, started);
        if (actual[key] !== advanced[key]) throw new Error(`Windows no confirmó ${key}: se esperaba ${advanced[key]} y se obtuvo ${actual[key] ?? 'no disponible'}.`);
      }
      return changed;
    } catch (error) {
      for (const key of changed.reverse()) {
        await changeAdvanced(pid, started, key, previous[key]).catch(() => {});
      }
      throw error;
    }
  }

  function activate(pid, options = {}) {
    return locked(async () => {
      validateGameProcess(pid);
      if (current) throw new Error('Termina el perfil de juego activo antes de iniciar otro.');
      const process = await getProcess(pid);
      if (!['Normal', 'AboveNormal', 'BelowNormal', 'Idle'].includes(process.priority)) {
        throw new Error('Este programa tiene una prioridad especial que VORTEX no modificará automáticamente.');
      }
      const rule = findRuleForProcess(rules, process);
      const requestedPriority = validatePriority(options.priority || rule?.priority || 'AboveNormal');
      const priority = safePriority(requestedPriority);
      const affinity = options.affinity === undefined ? rule?.affinity : options.affinity;
      const advanced = safeGameOptions(validateAdvancedOptions(options.advanced || rule?.advanced));
      if (affinity != null) {
        validateGameRule({ name: process.name, priority, affinity }, cpuCount);
        if (process.affinity == null || !/^[1-9]\d*$/.test(process.affinity)) {
          throw new Error('No se pudo leer la afinidad original. No se aplicarán cambios irreversibles.');
        }
      }
      const hasExtended = ['gpu', 'io', 'memory', 'efficiency', 'threadBoost'].some(key => advanced[key] != null);
      const previous = hasExtended ? await readAdvanced(pid, process.started) : {};
      await changePriority(pid, priority, process.started);
      let changed = [];
      try {
        if (affinity != null) await changeAffinity(pid, affinity, process.started);
        changed = await applyExtended(pid, process.started, advanced, previous);
      } catch (error) {
        if (affinity != null) await changeAffinity(pid, process.affinity, process.started).catch(() => {});
        await changePriority(pid, process.priority, process.started).catch(() => {});
        throw error;
      }
      current = {
        pid, name: process.name, started: process.started,
        ruleMatch: rule ? ruleTarget(rule) : null,
        previousPriority: safePriority(process.priority), originalPriority: process.priority, appliedPriority: priority,
        effectivePriority: priority, previousAffinity: affinity != null ? process.affinity : null,
        appliedAffinity: affinity ?? null, advanced, savedAdvanced: previous,
        changedAdvanced: changed, activatedAt: new Date().toISOString(),
        protectedGame: true, moderation: null, lastProblem: null, lastCheck: null,
        safetyNote: ['Idle', 'BelowNormal'].includes(requestedPriority) || ['Idle', 'BelowNormal'].includes(process.priority)
          ? 'Se sustituyó una prioridad baja por Normal para proteger el juego.' : null
      };
      if (advanced.proBalance || advanced.idleSaver || advanced.smartTrim) startWatching();
      return status();
    });
  }

  async function restoreBackground() {
    const errors = [];
    for (const [pid, record] of backgroundChanges) {
      try {
        const process = await getProcess(pid);
        if (process.started === record.started && process.priority === 'BelowNormal') {
          await changePriority(pid, record.originalPriority, record.started);
        }
      } catch (error) { errors.push(error.message); }
      backgroundChanges.delete(pid);
    }
    backgroundHistory.clear();
    return errors;
  }

  async function applyBackground(active) {
    if (!active || !(active.advanced.proBalance || active.advanced.idleSaver || active.advanced.smartTrim)) return;
    if (clock() - lastBackgroundRun < 15000) return;
    lastBackgroundRun = clock();
    const listNow = await list();
    const currentTime = clock();
    const memory = getMemory();
    const usedPercent = memory.total > 0 ? 100 * (memory.total - memory.available) / memory.total : 0;
    for (const process of listNow) {
      const name = String(process.name || '').toLowerCase().replace(/\.exe$/u, '');
      if (process.pid === active.pid || name === active.name.toLowerCase().replace(/\.exe$/u, '') ||
          !secondaryProcessesAllowed.includes(name) || process.foreground) continue;
      const history = backgroundHistory.get(process.pid);
      const elapsed = !history || history.started !== process.started ? 0 : (currentTime - history.firstSeen) / 1000;
      const cpu = Number(process.cpuPercent);
      const high = Number.isFinite(cpu) && cpu >= active.advanced.proBalanceCpu;
      const consecutive = history?.started === process.started && high ? history.consecutive + 1 : high ? 1 : 0;
      const record = { firstSeen: history?.started === process.started ? history.firstSeen : currentTime,
        started: process.started, consecutive, lastTrimAt: history?.lastTrimAt ?? -Infinity };
      backgroundHistory.set(process.pid, record);
      if (backgroundChanges.has(process.pid)) continue;
      const action = chooseBackgroundAction(process, active.advanced, { backgroundSeconds: elapsed,
        usedPercent, consecutiveHighCpu: consecutive, lastTrimAt: record.lastTrimAt, now: currentTime });
      if (!action) continue;
      try {
        const fresh = await getProcess(process.pid);
        if (fresh.started !== process.started || fresh.foreground) continue;
        if (action.kind === 'priority') {
          if (fresh.priority !== 'Normal') continue;
          await changePriority(fresh.pid, 'BelowNormal', fresh.started);
          const verified = await getProcess(fresh.pid);
          if (verified.priority !== 'BelowNormal') throw new Error('Windows no confirmó la prioridad secundaria.');
          backgroundChanges.set(fresh.pid, { started: fresh.started, originalPriority: fresh.priority });
        } else {
          await changeAdvanced(fresh.pid, fresh.started, 'trim', 'run');
          record.lastTrimAt = currentTime;
        }
        active.moderation = `${action.reason}: ${fresh.name}.exe`;
      } catch (error) { active.lastProblem = `Proceso secundario: ${error.message}`; }
      break;
    }
  }

  function stop() {
    return locked(async () => {
      if (!current) return { restored: true };
      const backgroundErrors = await restoreBackground();
      const active = current;
      let actual;
      try { actual = await getProcess(active.pid); }
      catch { current = null; return { restored: false, note: 'El proceso ya no está en ejecución.' }; }
      if (actual.started !== active.started) {
        current = null;
        return { restored: false, note: 'El proceso original ya no está disponible.' };
      }
      if (actual.priority !== active.effectivePriority) throw new Error('La prioridad fue modificada fuera de VORTEX. No se restauró automáticamente.');
      if (active.appliedAffinity != null && actual.affinity !== active.appliedAffinity) throw new Error('La afinidad fue modificada fuera de VORTEX.');
      const errors = [...backgroundErrors];
      if (actual.priority === active.effectivePriority) {
        await changePriority(active.pid, active.previousPriority, active.started).catch(error => errors.push(error.message));
      } else errors.push('La prioridad fue modificada fuera de VORTEX.');
      if (active.appliedAffinity != null) {
        if (actual.affinity === active.appliedAffinity) {
          await changeAffinity(active.pid, active.previousAffinity, active.started).catch(error => errors.push(error.message));
        } else errors.push('La afinidad cambió fuera de VORTEX.');
      }
      let latestAdvanced = null;
      if (active.changedAdvanced.length) {
        try { latestAdvanced = await readAdvanced(active.pid, active.started); }
        catch (error) { errors.push(`No se pudieron verificar las prioridades: ${error.message}`); }
      }
      for (const kind of [...active.changedAdvanced].reverse()) {
        if (latestAdvanced?.[kind] !== active.advanced[kind]) {
          errors.push(`Se omitió la restauración de ${kind} porque cambió fuera de VORTEX o no se pudo comprobar.`);
          continue;
        }
        const restoreTo = active.savedAdvanced[kind];
        await changeAdvanced(active.pid, active.started, kind, restoreTo).catch(error => errors.push(`${kind}: ${error.message}`));
      }
      current = null;
      return { restored: errors.length === 0, errors, note: errors.length ? 'Algunos ajustes no pudieron restaurarse.' : 'Configuración restaurada.' };
    });
  }

  function perform(input) {
    return locked(async () => {
      const action = ['priority', 'affinity'].includes(input?.kind)
        ? validateAction(input, cpuCount) : validateAdvancedAction(input);
      const process = await getProcess(action.pid);
      if (process.started !== action.started) throw new Error('El proceso seleccionado cambió. Actualiza la lista.');
      if (current?.pid === action.pid) throw new Error('Finaliza el modo juego antes de modificar este proceso manualmente.');
      if (action.kind === 'priority') return changePriority(action.pid, action.value, process.started);
      if (action.kind === 'affinity') return changeAffinity(action.pid, action.value, process.started);
      if (action.kind === 'gpuPreference') return changePreference(action.pid, process.started, action.value);
      return changeAdvanced(action.pid, process.started, action.kind, action.value);
    });
  }

  async function inspectSettings(pid) {
    validateGameProcess(pid);
    const process = await getProcess(pid);
    const [advancedResult, preferenceResult] = await Promise.allSettled([
      readAdvanced(pid, process.started), readPreference(pid, process.started)
    ]);
    return { pid, name: process.name, priority: process.priority, affinity: process.affinity,
      advanced: advancedResult.status === 'fulfilled' ? advancedResult.value : null,
      advancedError: advancedResult.status === 'rejected' ? explainWindowsError(advancedResult.reason.message) : null,
      gpuPreference: preferenceResult.status === 'fulfilled' ? preferenceResult.value.preference : null,
      gpuPreferenceError: preferenceResult.status === 'rejected' ? explainWindowsError(preferenceResult.reason.message) : null,
      checkedAt: new Date().toISOString() };
  }

  async function supervise() {
    if (!current) return;
    const active = current;
    let found;
    try { found = await getProcess(active.pid); }
    catch { await restoreBackground(); current = null; return; }
    if (found.started !== active.started) { await restoreBackground(); current = null; return; }
    active.lastCheck = new Date(clock()).toISOString();
    active.moderation = null;
    if (found.foreground) await applyBackground(active);
    else if (backgroundChanges.size) await restoreBackground();
    if (found.priority !== active.effectivePriority) {
      active.lastProblem = `Windows muestra prioridad ${found.priority}. VORTEX no la cambió automáticamente.`;
    } else if (active.lastProblem?.startsWith('Windows muestra prioridad')) {
      active.lastProblem = null;
    }
  }

  async function watch() {
    if (current) return locked(supervise);
    if (!allowAutomatic()) return;
    const autoRules = rules.filter(rule => rule.auto);
    if (!autoRules.length) return;
    const processes = await list();
    const selected = processes.find(item => autoRules.some(rule => ruleMatchesProcess(rule, item)));
    if (selected) await activate(selected.pid).catch(() => {});
  }

  function startWatching() {
    if (timer) return;
    timer = setInterval(async () => {
      if (watching) return;
      watching = true;
      try { await watch(); }
      catch (error) { if (current) current.lastProblem = error.message; }
      finally { watching = false; }
    }, 15_000);
    timer.unref?.();
  }

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { list, status, activate, stop, recommend, savedRules, saveRule, deleteRule, perform, inspectSettings,
    checkNow: () => locked(supervise),
    capabilities: () => ({ logicalCpus: cpuCount, affinitySupported: cpuCount <= 62 }),
    startWatching, dispose };
}
