import os from 'node:os';
import { executeJson } from './powershell.js';

function cpuTimes() {
  return os.cpus().reduce((sum, cpu) => {
    const all = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    sum.total += all;
    sum.idle += cpu.times.idle;
    return sum;
  }, { total: 0, idle: 0 });
}

export async function getSystemOverview() {
  return {
    platform: process.platform,
    compatible: process.platform === 'win32',
    windows: process.platform === 'win32' ? `Windows ${os.release()}` : `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0]?.model?.trim() || 'No identificado',
    threads: os.cpus().length,
    cpuUsage: null,
    ramTotal: os.totalmem(),
    ramAvailable: os.freemem(),
    gpus: []
  };
}

let hardwarePending = null;
let hardwareCache = null;

export async function getHardwareDetails() {
  if (hardwareCache) return hardwareCache;
  if (hardwarePending) return hardwarePending;
  if (process.platform !== 'win32') return { windows: `${os.type()} ${os.release()}`, gpus: [] };
  hardwarePending = executeJson(String.raw`
$win = Get-CimInstance Win32_OperatingSystem
$gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$cpu = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue)
$disk = @(Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Sort-Object Index | Select-Object -First 1)
$modules = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue)
$memoryLabel = ''
if ($modules.Count -gt 0) {
 $kind = [int]$modules[0].SMBIOSMemoryType
 $memoryLabel = switch ($kind) { 24 { 'DDR3' } 26 { 'DDR4' } 34 { 'DDR5' } default { '' } }
}
[pscustomobject]@{
 windows = [string]$win.Caption
 windowsBuild = [string]$win.Version
 gpus = $gpus
 cores = [int](@($cpu | Measure-Object -Property NumberOfCores -Sum)[0].Sum)
 currentClockMHz = $(if ($cpu.Count -gt 0) { [int]$cpu[0].CurrentClockSpeed } else { 0 })
 maxClockMHz = $(if ($cpu.Count -gt 0) { [int]$cpu[0].MaxClockSpeed } else { 0 })
 memoryType = $memoryLabel
 disk = $(if ($disk.Count -gt 0) { [pscustomobject]@{name=[string]$disk[0].Model; size=[int64]$disk[0].Size} } else {$null})
} | ConvertTo-Json -Compress -Depth 5
` )
    .then(data => {
      hardwareCache = { windows: data?.windows || `Windows ${os.release()}`, gpus: Array.isArray(data?.gpus) ? data.gpus : data?.gpus ? [data.gpus] : [], cores: Number(data?.cores) || null, currentClockMHz: Number(data?.currentClockMHz) || null, maxClockMHz: Number(data?.maxClockMHz) || null, memoryType: data?.memoryType || null, windowsBuild: data?.windowsBuild || null, disk: data?.disk?.name ? data.disk : null };
      return hardwareCache;
    })
    .finally(() => { hardwarePending = null; });
  return hardwarePending;
}

export async function getHvciStatus() {
  if (process.platform !== 'win32') {
    return { available: false, running: null, note: 'Consulta disponible únicamente en Windows.' };
  }

  try {
    const result = await executeJson(`$device = Get-CimInstance -Namespace 'root\\Microsoft\\Windows\\DeviceGuard' -ClassName Win32_DeviceGuard; [pscustomobject]@{ running = @($device.SecurityServicesRunning) -contains 2; configured = @($device.SecurityServicesConfigured) -contains 2 } | ConvertTo-Json -Compress`);

    return {
      available: true,
      running: Boolean(result?.running),
      configured: Boolean(result?.configured),
      note: 'HVCI ayuda a proteger el núcleo de Windows. No recomendamos desactivarlo para buscar más FPS.'
    };
  } catch {
    return { available: false, running: null, note: 'Windows no permitió consultar el estado de integridad de memoria.' };
  }
}
