import os from 'node:os';
import { explainWindowsError } from '../core/errors.js';
import { executeJson } from './powershell.js';
import { validateStandbySchedule } from '../core/standby-schedule.js';
import { runStandbyHelper } from './standby-runner.js';

const mib = 1024 ** 2;
const maxLowBytes = 512 * mib;
const minLowBytes = 64 * mib;
const cooldownMs = 60 * 60 * 1000;

const readScript = String.raw`
$memory = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -ErrorAction Stop
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
$low = [int64]$memory.StandbyCacheReserveBytes
$normal = [int64]$memory.StandbyCacheNormalPriorityBytes
$core = [int64]$memory.StandbyCacheCoreBytes
[pscustomobject]@{
  low = $low
  normal = $normal
  core = $core
  standby = $low + $normal + $core
  modified = [int64]$memory.ModifiedPageListBytes
  free = [int64]$memory.FreeAndZeroPageListBytes
  available = [int64]$memory.AvailableBytes
  elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} | ConvertTo-Json -Compress
`;

export function validateStandbyRequest(request) {
  if (!['low', 'all'].includes(request?.mode) || request?.confirmed !== true) {
    throw new Error('Elige un tipo de limpieza y confirma la operación.');
  }
  if ((request.mode === 'all' || request.force === true) && (request.automatic || request.riskAccepted !== true)) {
    throw new Error('La limpieza avanzada solo está disponible de forma manual y tras confirmar el riesgo.');
  }
  return request.mode;
}

export function standbySafetyCheck(state, { total, automatic = false, gameActive = false, elapsedMs = Infinity } = {}) {
  if (gameActive) return 'Se omite la limpieza mientras hay un perfil de juego activo.';
  if (elapsedMs < cooldownMs) return 'Espera al menos una hora entre limpiezas.';
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(state?.available) || !Number.isFinite(state?.low)) {
    return 'Windows no pudo proporcionar mediciones de memoria suficientes.';
  }
  if (state.low < minLowBytes) return 'La caché de baja prioridad es demasiado pequeña para justificar una limpieza.';
  if (state.low > maxLowBytes) return 'Se detectó una caché grande; VORTEX no la vaciará de golpe para evitar pausas.';
  const threshold = automatic ? 0.15 : 0.20;
  if (automatic && state.available / total >= threshold) return 'Hay suficiente RAM disponible. Se omite la limpieza automática.';
  return null;
}

export function createStandbyController(dependencies = {}) {
  const execute = dependencies.execute || executeJson;
  const runPurge = dependencies.runPurge || (dependencies.execute
    ? async mode => execute(`$status = [int64]0; [pscustomobject]@{ status = $status; mode = '${mode}' } | ConvertTo-Json -Compress`)
    : runStandbyHelper);
  const freeMemory = dependencies.freeMemory || (() => os.freemem());
  const totalMemory = dependencies.totalMemory || (() => os.totalmem());
  const clock = dependencies.clock || (() => Date.now());
  const gameActive = dependencies.gameActive || (() => false);
  const canAutomate = dependencies.canAutomate || (() => true);
  const store = dependencies.store || null;
  let lastResult = null;
  let lastPurgeAt = -Infinity;
  let running = false;
  let migratedSchedule = false;
  let schedule = { enabled: false, mode: 'low', intervalMinutes: 60, acknowledged: false };
  try {
    const previous = store?.read().standby;
    if (previous?.mode === 'all' || (previous?.enabled && Number(previous.intervalMinutes) < 60)) {
      migratedSchedule = true;
      store?.write({ standby: schedule });
    } else if (previous) {
      schedule = validateStandbySchedule(previous);
    }
  } catch {
    migratedSchedule = true;
    store?.write({ standby: schedule });
  }
  let timer = null;

  async function snapshot() {
    try {
      const data = await execute(readScript);
      const total = totalMemory();
      return {
        ...data, supported: true, lastResult, total, schedule, migratedSchedule,
        allowed: !standbySafetyCheck(data, {
          total,
          gameActive: Boolean(gameActive()),
          elapsedMs: clock() - lastPurgeAt
        }),
        restriction: standbySafetyCheck(data, {
          total,
          gameActive: Boolean(gameActive()),
          elapsedMs: clock() - lastPurgeAt
        })
      };
    } catch (error) {
      return { supported: false, error: explainWindowsError(error.message), available: freeMemory(), total: totalMemory(), lastResult, schedule, migratedSchedule };
    }
  }

  async function purge(request) {
    const mode = validateStandbyRequest(request);
    if (running) throw new Error('Hay una limpieza de caché en curso.');
    running = true;
    try {
      const before = await snapshot();
      if (!before.supported) throw new Error('Windows no permite consultar esta caché en el equipo.');
      if (!before.elevated) throw new Error('Para vaciar la caché standby, abre VORTEX como administrador.');
      const restriction = standbySafetyCheck(before, {
        total: totalMemory(),
        automatic: request.automatic === true,
        gameActive: Boolean(gameActive()),
        elapsedMs: clock() - lastPurgeAt
      });
      if (request.automatic && !canAutomate()) {
        lastResult = { at: new Date(clock()).toISOString(), scheduled: true, skipped: true, reason: 'Supervisiones automáticas en pausa.' };
        return lastResult;
      }
      if (restriction && !request.force) {
        if (request.automatic) {
          lastResult = { at: new Date(clock()).toISOString(), scheduled: true, skipped: true, reason: restriction };
          return lastResult;
        }
        throw new Error(restriction);
      }
      const result = await runPurge(mode);
      if (result?.status !== 0) throw new Error(`Windows no pudo limpiar la lista (NTSTATUS ${result?.status ?? 'desconocido'}).`);
      lastPurgeAt = clock();
      const after = await snapshot();
      lastResult = {
        mode, forced: request.force === true, scheduled: request.automatic === true,
        standbyBefore: before.standby,
        standbyAfter: after.standby ?? null,
        availableBefore: before.available,
        availableAfter: after.available ?? null,
        at: new Date(clock()).toISOString()
      };
      return lastResult;
    } finally {
      running = false;
    }
  }

  function refreshAutomaticSchedule() {
    if (timer) clearInterval(timer);
    timer = null;
    if (schedule.enabled && canAutomate()) {
      timer = setInterval(async () => {
        if (running) return;
        try { await purge({ mode: 'low', confirmed: true, automatic: true }); }
        catch (error) { lastResult = { at: new Date(clock()).toISOString(), error: explainWindowsError(error.message), scheduled: true }; }
      }, schedule.intervalMinutes * 60_000);
      timer.unref?.();
    }
  }

  function configureSchedule(value) {
    schedule = validateStandbySchedule(value);
    store?.write({ standby: schedule });
    refreshAutomaticSchedule();
    return { ...schedule };
  }

  function config() { return { ...schedule }; }
  function dispose() { if (timer) clearInterval(timer); timer = null; }
  configureSchedule(schedule);
  return { snapshot, purge, configureSchedule, refreshAutomaticSchedule, config, dispose };
}
