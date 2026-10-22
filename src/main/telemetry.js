import os from 'node:os';
import { executeJson } from './powershell.js';
import { processAllowed } from '../core/performance.js';
import { sampleProcesses, parseGpuEngines } from '../core/telemetry.js';

const processScript = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VortexTelemetryFocus {
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
}
'@
$focused = [uint32]0
[void][VortexTelemetryFocus]::GetWindowThreadProcessId([VortexTelemetryFocus]::GetForegroundWindow(), [ref]$focused)
$items = @(Get-Process | ForEach-Object {
 try {
  $p = $_
  $cpu = $p.CPU
  if ($null -eq $cpu) { $cpu = 0 }
  $start = $p.StartTime.ToUniversalTime().ToString('o')
  $affinity = $null
  try { if ($p.MainWindowHandle -ne 0) { $affinity = $p.ProcessorAffinity.ToInt64().ToString() } } catch {}
  [pscustomobject]@{
   pid = [int]$p.Id
   name = $p.ProcessName
   memory = [int64]$p.WorkingSet64
   privateMemory = [int64]$p.PrivateMemorySize64
   cpuSeconds = [double]$cpu
   started = $start
   visible = ($p.MainWindowHandle -ne 0)
   title = $p.MainWindowTitle
   foreground = ($p.Id -eq $focused)
   priority = if ($p.MainWindowHandle -ne 0) { $p.PriorityClass.ToString() } else { 'Normal' }
   affinity = $affinity
  }
 } catch {}
})
ConvertTo-Json -InputObject $items -Depth 3 -Compress
`;

const gpuScript = String.raw`
$items = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | Where-Object { $_.Name -match 'pid_\d+' } | ForEach-Object {
 [pscustomobject]@{ name = $_.Name; value = [double]$_.UtilizationPercentage }
})
ConvertTo-Json -InputObject $items -Compress -Depth 2
`;

export function createTelemetryController(dependencies = {}) {
  const query = dependencies.query || executeJson;
  const clock = dependencies.clock || (() => Date.now());
  const cpuCount = dependencies.cpuCount || os.cpus().length;
  const totalMem = dependencies.totalMem || (() => os.totalmem());
  let samples = new Map();
  let cache = null;
  let lastRead = 0;
  let pending = null;
  let gpuLastRead = 0;
  let gpuSamples = {};
  let gpuSupported = null;
  let gpuPending = null;

  async function refreshGpu() {
    if (gpuPending) return gpuPending;
    if (clock() - gpuLastRead < 12000) return;
    gpuLastRead = clock();
    gpuPending = query(gpuScript).then(result => {
      gpuSamples = parseGpuEngines(result);
      gpuSupported = true;
    }).catch(() => {
      gpuSamples = {};
      gpuSupported = false;
    }).finally(() => { gpuPending = null; });
    return gpuPending;
  }

  let gpuOverviewPending = null;
  let gpuOverviewCache = null;
  let gpuOverviewAt = -Infinity;

  async function gpuOverview() {
    if (gpuOverviewPending) return gpuOverviewPending;
    if (gpuOverviewCache !== null && clock() - gpuOverviewAt < 10000) return gpuOverviewCache;
    gpuOverviewPending = query(gpuScript).then(rows => {
      const engines = new Map();
      for (const row of Array.isArray(rows) ? rows : rows ? [rows] : []) {
        const name = String(row?.name || '');
        const match = name.match(/_luid_.+?_phys_\d+_eng_\d+_engtype_[^_]+/i);
        const value = Number(row?.value);
        if (!match || !Number.isFinite(value)) continue;
        const engine = match[0].toLowerCase();
        engines.set(engine, (engines.get(engine) || 0) + Math.max(0, value));
      }
      gpuOverviewCache = engines.size ? Math.min(100, Math.max(...engines.values())) : null;
      gpuOverviewAt = clock();
      return gpuOverviewCache;
    }).finally(() => { gpuOverviewPending = null; });
    return gpuOverviewPending;
  }

  async function snapshot() {
    if (pending) return pending;
    if (cache && clock() - lastRead < 4500) return cache;
    pending = (async () => {
      const rows = await query(processScript);
      const entries = (Array.isArray(rows) ? rows : rows ? [rows] : []).filter(item => processAllowed(item.name) && Number.isInteger(item.pid));
      const sampledAt = clock();
      const previous = samples;
      const aggregate = sampleProcesses(entries, previous, sampledAt, cpuCount, totalMem(), gpuSupported ? gpuSamples : {});
      samples = aggregate.samples;
      cache = { ...aggregate, sampledAt, gpuSupported, total: totalMem() };
      lastRead = sampledAt;
      refreshGpu().catch(() => {});
      return cache;
    })();
    try { return await pending; }
    finally { pending = null; }
  }

  function dispose() { cache = null; samples.clear(); }
  return { snapshot, gpuOverview, dispose };
}
