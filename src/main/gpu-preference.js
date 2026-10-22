import { executeJson } from './powershell.js';
import { validateGameProcess } from '../core/performance.js';
import { gpuPreferenceLevels } from '../core/advanced.js';

export function parseGpuPreference(value) {
  const match = String(value || '').match(/(?:^|;)\s*GpuPreference=(\d+)\s*(?:;|$)/i);
  return { '1': 'PowerSaving', '2': 'HighPerformance' }[match?.[1]] || 'System';
}

export function buildGpuPreferenceScript(pid, started, value = null) {
  validateGameProcess(pid);
  if (typeof started !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(started)) throw new Error('Identidad de proceso no válida.');
  if (value !== null && !gpuPreferenceLevels.includes(value)) throw new Error('Preferencia de GPU no válida.');
  const setting = { System: 0, PowerSaving: 1, HighPerformance: 2 }[value];
  return String.raw`
$p = Get-Process -Id ${pid} -ErrorAction Stop
if ($p.StartTime.ToUniversalTime().ToString('o') -ne '${started}') { throw 'El proceso cambió desde que se seleccionó.' }
$exe = $null
try { $exe = $p.Path } catch {}
if (-not $exe) { try { $exe = (Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop).ExecutablePath } catch {} }
if (-not $exe -or -not [System.IO.Path]::IsPathRooted($exe) -or -not $exe.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { throw 'No se pudo localizar el ejecutable del proceso.' }
$key = ${value === null ? "[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\DirectX\UserGpuPreferences', $false)" : "[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Microsoft\DirectX\UserGpuPreferences')"}
if (-not $key) {
  [pscustomobject]@{ path = $exe; preference = 'System'; before = ''; after = ''; verified = $true; requiresRestart = $false } | ConvertTo-Json -Compress
  return
}
try {
  $before = [string]$key.GetValue($exe, '')
  ${value === null ? '' : `$parts = @($before -split ';' | Where-Object { $_ -and $_ -notmatch '^\\s*GpuPreference=' })
  ${setting === 0 ? '' : `$parts += 'GpuPreference=${setting}'`}
  $next = if ($parts.Count) { ($parts -join ';') + ';' } else { '' }
  if ($next) { $key.SetValue($exe, $next, [Microsoft.Win32.RegistryValueKind]::String) } else { $key.DeleteValue($exe, $false) }`}
  $after = [string]$key.GetValue($exe, '')
  $actual = 'System'
  if ($after -match '(?:^|;)\s*GpuPreference=1(?:;|$)') { $actual = 'PowerSaving' }
  if ($after -match '(?:^|;)\s*GpuPreference=2(?:;|$)') { $actual = 'HighPerformance' }
  [pscustomobject]@{ path = $exe; preference = $actual; before = $before; after = $after; verified = ${value === null ? '$true' : `($actual -eq '${value}')`}; requiresRestart = $true } | ConvertTo-Json -Compress
} finally { $key.Dispose() }
`;
}

export async function readGpuPreference(pid, started, execute = executeJson) {
  const result = await execute(buildGpuPreferenceScript(pid, started));
  if (!result?.path || !gpuPreferenceLevels.includes(result.preference)) throw new Error('No se pudo consultar la preferencia gráfica.');
  return result;
}

export async function setGpuPreference(pid, started, value, execute = executeJson) {
  if (!gpuPreferenceLevels.includes(value)) throw new Error('Preferencia de GPU no válida.');
  const result = await execute(buildGpuPreferenceScript(pid, started, value));
  if (!result?.verified || result.preference !== value) throw new Error('No se confirmó la preferencia de GPU en Windows.');
  return { ...result, applied: true, note: 'Preferencia guardada en Windows. Reinicia el juego para solicitar la GPU elegida; el controlador decide el resultado real.' };
}
