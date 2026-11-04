import os from 'node:os';
import { executeJson } from './powershell.js';
import { processAllowed } from '../core/performance.js';
import { sampleProcesses, parseGpuEngines, parseSystemGpuEngines } from '../core/telemetry.js';

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
  $cpu = 0
  try { if ($null -ne $p.CPU) { $cpu = $p.CPU } } catch {}
  $start = $null
  try { $start = $p.StartTime.ToUniversalTime().ToString('o') } catch {}
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
   priority = $(try { $p.PriorityClass.ToString() } catch { 'No disponible' })
   affinity = $affinity
  }
 } catch {}
})
ConvertTo-Json -InputObject $items -Depth 3 -Compress
`;

export const gpuScript = String.raw`
$rows = @()
try {
  $readings = @(Get-Counter -Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 1 -MaxSamples 2 -ErrorAction Stop)
  if ($readings.Count -gt 0) {
    $last = $readings[$readings.Count - 1]
    $rows = @($last.CounterSamples | ForEach-Object {
      [pscustomobject]@{ name = [string]$_.InstanceName; value = [double]$_.CookedValue }
    })
  }
} catch {}
if ($rows.Count -eq 0 -or @($rows | Where-Object { $_.value -gt 0 }).Count -eq 0) {
  try {
    $fallback = @(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ name = [string]$_.Name; value = [double]$_.UtilizationPercentage }
    })
    if ($rows.Count -eq 0 -or @($fallback | Where-Object { $_.value -gt 0 }).Count -gt 0) { $rows = $fallback }
  } catch {}
}
if ($rows.Count -eq 0 -or @($rows | Where-Object { $_.value -gt 0 }).Count -eq 0) {
  try {
    $nvPaths = @((Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'), (Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'))
    foreach ($exe in $nvPaths) {
      if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { continue }
      $values = @(& $exe '--query-gpu=utilization.gpu' '--format=csv,noheader,nounits' 2>$null | ForEach-Object {
        if ([string]$_ -match '^\s*(\d+)\s*$') { [double]$Matches[1] }
      })
      if ($values.Count -gt 0) {
        $rows += [pscustomobject]@{ name = 'vortex_nvidia_total'; value = [double](@($values | Measure-Object -Maximum)[0].Maximum) }
      }
      break
    }
  } catch {}
}
ConvertTo-Json -InputObject $rows -Compress -Depth 2
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
  let gpuLastRead = -Infinity;
  let gpuSamples = {};
  let gpuSupported = null;
  let gpuOverviewValue = null;
  let gpuPending = null;
  const gpuIntervalMs = dependencies.gpuIntervalMs ?? 4000;

  async function refreshGpu() {
    if (gpuPending) return gpuPending;
    if (clock() - gpuLastRead < gpuIntervalMs) return;
    gpuLastRead = clock();
    gpuPending = query(gpuScript).then(rows => {
      const values = Array.isArray(rows) ? rows : rows ? [rows] : [];
      gpuSamples = parseGpuEngines(values);
      gpuOverviewValue = parseSystemGpuEngines(values);
      gpuSupported = gpuOverviewValue !== null;
    }).catch(() => {
      gpuSamples = {};
      gpuOverviewValue = null;
      gpuSupported = false;
    }).finally(() => { gpuPending = null; });
    return gpuPending;
  }

  async function gpuOverview() {
    await refreshGpu();
    return gpuOverviewValue;
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
