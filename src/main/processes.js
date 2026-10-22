import os from 'node:os';
import { executeJson } from './powershell.js';
import { processAllowed, validateGameProcess } from '../core/performance.js';
import { validateAffinity, validatePriority } from '../core/gaming.js';

const processListScript = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VortexFocus {
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
'@
$foreground = [uint32]0; [void][VortexFocus]::GetWindowThreadProcessId([VortexFocus]::GetForegroundWindow(), [ref]$foreground)
$items = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  try {
    $affinity = $null
    $processPath = $null
    try { $processPath = $_.Path } catch {}
    try { $affinity = $_.ProcessorAffinity.ToInt64().ToString() } catch {}
    [pscustomobject]@{
      pid = $_.Id
      name = $_.ProcessName
      memory = [int64]$_.WorkingSet64
      priority = $_.PriorityClass.ToString()
      affinity = $affinity
      cpuSeconds = [double]$_.CPU
      started = $_.StartTime.ToUniversalTime().ToString('o')
      title = $_.MainWindowTitle
      path = $processPath
      foreground = ($_.Id -eq $foreground)
    }
  } catch {}
})
ConvertTo-Json -InputObject $items -Compress -Depth 4
`;

export async function getDesktopProcesses() {
  const result = await executeJson(processListScript);
  return (Array.isArray(result) ? result : []).filter(item => Number.isInteger(item.pid) && processAllowed(item.name))
    .sort((a, b) => b.memory - a.memory).slice(0, 100);
}

export async function inspectProcess(pid) {
  validateGameProcess(pid);
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class VortexForeground { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid); }'; $foreground = [uint32]0; [void][VortexForeground]::GetWindowThreadProcessId([VortexForeground]::GetForegroundWindow(), [ref]$foreground); $p = Get-Process -Id ${pid} -ErrorAction Stop; $processPath = $null; try { $processPath = $p.Path } catch {}; $affinity = $null; try { $affinity = $p.ProcessorAffinity.ToInt64().ToString() } catch {}; [pscustomobject]@{ pid = $p.Id; name = $p.ProcessName; memory = [int64]$p.WorkingSet64; priority = $p.PriorityClass.ToString(); affinity = $affinity; started = $p.StartTime.ToUniversalTime().ToString('o'); visible = ($p.MainWindowHandle -ne 0); path = $processPath; foreground = ($p.Id -eq $foreground); cpuSeconds = [double]$p.CPU } | ConvertTo-Json -Compress`;
  const process = await executeJson(script);
  if (!process || !processAllowed(process.name) || !process.visible) {
    throw new Error('Este proceso no se puede gestionar desde VORTEX.');
  }
  return process;
}

function validateIdentity(pid, started) {
  validateGameProcess(pid);
  if (typeof started !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(started)) {
    throw new Error('No se pudo validar la identidad del proceso.');
  }
  return `$p = Get-Process -Id ${pid} -ErrorAction Stop; if ($p.StartTime.ToUniversalTime().ToString('o') -ne '${started}') { throw 'La identidad del proceso cambió.' }; if ($p.MainWindowHandle -eq 0) { throw 'Proceso sin ventana.' };`;
}

export async function setProcessPriority(pid, priority, started) {
  validatePriority(priority);
  const script = `${validateIdentity(pid, started)} $p.PriorityClass = '${priority}'; [pscustomobject]@{ pid = $p.Id; name = $p.ProcessName; priority = $p.PriorityClass.ToString() } | ConvertTo-Json -Compress`;
  return executeJson(script);
}

export async function setProcessAffinity(pid, affinity, started) {
  validateAffinity(affinity, os.cpus().length);
  const script = `${validateIdentity(pid, started)} $p.ProcessorAffinity = [IntPtr]([int64]::Parse('${affinity}')); $p.Refresh(); [pscustomobject]@{ pid = $p.Id; name = $p.ProcessName; affinity = $p.ProcessorAffinity.ToInt64().ToString() } | ConvertTo-Json -Compress`;
  return executeJson(script);
}
