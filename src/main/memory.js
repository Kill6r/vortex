import os from 'node:os';
import { executeJson } from './powershell.js';
import { getDesktopProcesses } from './processes.js';
import { processAllowed, shouldCleanMemory, validateAutoMemory, validateMemoryRequest } from '../core/performance.js';

const trimScript = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VortexMemory {
    [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("psapi.dll", SetLastError = true)] public static extern bool EmptyWorkingSet(IntPtr handle);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
'@ -ErrorAction Stop
`;

export function createMemoryController(getGameStatus = () => null, dependencies = {}) {
  const store = dependencies.store || null;
  const telemetry = dependencies.telemetry || null;
  const canAutomate = dependencies.canAutomate || (() => true);
  const defaultAuto = { enabled: false, intervalMinutes: 5, thresholdPercent: 85, processNames: [] };
  let auto = defaultAuto;
  try { if (store?.read().memory) auto = validateAutoMemory(store.read().memory); } catch {}
  let timer = null;
  let running = false;
  let lastResult = null;

  async function snapshot() {
    const metrics = telemetry ? await telemetry.snapshot() : null;
    const processes = metrics ? metrics.groups : await getDesktopProcesses();
    return { total: os.totalmem(), available: os.freemem(), processes,
      sampledAt: metrics?.sampledAt || Date.now(), gpuSupported: metrics?.gpuSupported ?? false,
      auto: { ...auto }, lastResult };
  }

  async function clean(request) {
    const valid = validateMemoryRequest(request);
    if (running) throw new Error('Ya se está ejecutando una limpieza de memoria.');
    running = true;
    try {
      const metrics = telemetry ? await telemetry.snapshot() : null;
      const processes = metrics ? metrics.groups.flatMap(item => item.entries) : await getDesktopProcesses();
      const foregroundNames = new Set(processes.filter(item => item.foreground).map(item => item.name.toLowerCase()));
      const allowed = processes.filter(item => valid.pids.includes(item.pid) && !foregroundNames.has(item.name.toLowerCase()));
      if (!allowed.length) throw new Error('Los procesos seleccionados ya no están disponibles o no son aptos.');
      const limit = valid.mode === 'conservadora' ? 8 : 30;
      const selected = allowed.filter(item => item.pid !== getGameStatus()?.pid).slice(0, limit);
      if (!selected.length) throw new Error('El modo juego está protegiendo los procesos seleccionados.');
      const before = os.freemem();
      const entries = selected.map(item => `@{ pid = ${item.pid}; started = '${item.started}' }`).join(',');
      const script = `${trimScript}\n$foreground = [uint32]0; $window = [VortexMemory]::GetForegroundWindow(); [void][VortexMemory]::GetWindowThreadProcessId($window, [ref]$foreground); $selected = @(${entries}); $results = @(); foreach ($candidate in $selected) { try { $p = Get-Process -Id $candidate.pid -ErrorAction Stop; if ($p.Id -eq $foreground -or $p.StartTime.ToUniversalTime().ToString('o') -ne $candidate.started) { continue }; $handle = [VortexMemory]::OpenProcess(0x500, $false, [uint32]$p.Id); if ($handle -eq [IntPtr]::Zero) { $results += [pscustomobject]@{ pid = $p.Id; success = $false }; continue }; try { $ok = [VortexMemory]::EmptyWorkingSet($handle); $results += [pscustomobject]@{ pid = $p.Id; success = [bool]$ok } } finally { [void][VortexMemory]::CloseHandle($handle) } } catch { $results += [pscustomobject]@{ pid = $candidate.pid; success = $false } } }; ConvertTo-Json -InputObject $results -Compress -Depth 3`;
      const output = await executeJson(script);
      const results = Array.isArray(output) ? output : [];
      lastResult = { mode: valid.mode, attempted: selected.length, succeeded: results.filter(item => item.success).length,
        availableBefore: before, availableAfter: os.freemem(), at: new Date().toISOString() };
      return lastResult;
    } finally {
      running = false;
    }
  }

  async function autoCheck() {
    if (!canAutomate() || !auto.enabled || running || !shouldCleanMemory(os.freemem(), os.totalmem(), auto.thresholdPercent)) return;
    try {
      const metrics = telemetry ? await telemetry.snapshot() : null;
      const processes = metrics ? metrics.groups.flatMap(item => item.entries) : await getDesktopProcesses();
      const foregroundNames = new Set(processes.filter(item => item.foreground).map(item => item.name.toLowerCase()));
      const names = new Set(auto.processNames.map(name => name.toLowerCase().replace(/\.exe$/, '')));
      const targets = processes.filter(item => names.has(item.name.toLowerCase()) && !foregroundNames.has(item.name.toLowerCase()) && processAllowed(item.name)).slice(0, 8);
      if (targets.length) await clean({ mode: 'conservadora', pids: targets.map(item => item.pid) });
    } catch (error) {
      lastResult = { at: new Date().toISOString(), error: error.message };
    }
  }

  function refreshAutomaticSchedule() {
    if (timer) clearInterval(timer);
    timer = auto.enabled && canAutomate() ? setInterval(autoCheck, auto.intervalMinutes * 60_000) : null;
    timer?.unref?.();
  }

  function configureAuto(configuration) {
    auto = validateAutoMemory(configuration);
    store?.write({ memory: auto });
    refreshAutomaticSchedule();
    return { ...auto };
  }

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function config() { return { ...auto }; }
  configureAuto(auto);
  return { snapshot, clean, configureAuto, refreshAutomaticSchedule, config, dispose };
}
