import { executeJson } from './powershell.js';
import { visualSettings, validateVisualChoice, validateStartupIo, ioRegistryValues, ioLevelFromRegistry, describeRebar } from '../core/windows-tweaks.js';
import { getHardwareDetails } from './system.js';

const visualRegistry = {
  animations: String.raw`HKCU:\Control Panel\Desktop\WindowMetrics`,
  transparency: String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`
};
const graphicKey = String.raw`HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`;
const imageBase = String.raw`HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options`;

export async function readVisualSettings(execute = executeJson) {
  const script = String.raw`$animation = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name MinAnimate -ErrorAction SilentlyContinue; $transparency = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name EnableTransparency -ErrorAction SilentlyContinue; [pscustomobject]@{ animations = $(if ($null -eq $animation) { $null } else { [string]$animation.MinAnimate -eq '1' }); transparency = $(if ($null -eq $transparency) { $null } else { [int]$transparency.EnableTransparency -eq 1 }) } | ConvertTo-Json -Compress`;
  const result = await execute(script);
  return { animations: result?.animations ?? null, transparency: result?.transparency ?? null };
}

export async function changeVisualSetting(key, enabled, settings, execute = executeJson) {
  validateVisualChoice(key, enabled);
  const before = await readVisualSettings(execute);
  const backups = { ...(settings.read().visualBackups || {}) };
  if (!Object.hasOwn(backups, key)) backups[key] = before[key];
  settings.write({ visualBackups: backups });
  const path = visualRegistry[key];
  const property = visualSettings[key].property;
  const value = key === 'animations' ? `'${enabled ? '1' : '0'}'` : enabled ? '1' : '0';
  await execute(`New-Item -Path '${path}' -Force | Out-Null; New-ItemProperty -Path '${path}' -Name '${property}' -Value ${value} -PropertyType ${key === 'animations' ? 'String' : 'DWord'} -Force | Out-Null; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  const after = await readVisualSettings(execute);
  if (after[key] !== enabled) throw new Error('Windows no confirmo el ajuste visual.');
  return { key, enabled, verified: true, note: 'Puede requerir cerrar sesion para reflejarse completamente.' };
}

export async function restoreVisualSetting(key, settings, execute = executeJson) {
  if (!Object.hasOwn(visualSettings, key)) throw new Error('Ajuste no admitido.');
  const backups = { ...(settings.read().visualBackups || {}) };
  if (!Object.hasOwn(backups, key)) throw new Error('No hay un valor original guardado.');
  const previous = backups[key];
  const path = visualRegistry[key];
  const property = visualSettings[key].property;
  if (previous === null) {
    await execute(`Remove-ItemProperty -Path '${path}' -Name '${property}' -ErrorAction SilentlyContinue; [pscustomobject]@{ restored = $true } | ConvertTo-Json -Compress`);
  } else {
    const value = key === 'animations' ? `'${previous ? '1' : '0'}'` : previous ? '1' : '0';
    await execute(`New-ItemProperty -Path '${path}' -Name '${property}' -Value ${value} -PropertyType ${key === 'animations' ? 'String' : 'DWord'} -Force | Out-Null; [pscustomobject]@{ restored = $true } | ConvertTo-Json -Compress`);
  }
  const actual = await readVisualSettings(execute);
  if (actual[key] !== previous) throw new Error('No se pudo verificar la restauracion.');
  delete backups[key];
  settings.write({ visualBackups: backups });
  return { key, restored: true };
}

export async function readGraphicsStatus(execute = executeJson, hardware = getHardwareDetails) {
  const data = await execute(`$item = Get-ItemProperty -LiteralPath '${graphicKey}' -Name HwSchMode -ErrorAction SilentlyContinue; [pscustomobject]@{ registryValue = $(if ($null -eq $item) { $null } else { [int]$item.HwSchMode }) } | ConvertTo-Json -Compress`);
  const details = await hardware();
  return {
    hags: data?.registryValue === 2 ? 'solicitado-activado' : data?.registryValue === 1 ? 'solicitado-desactivado' : 'controlado-por-windows',
    hagsValue: data?.registryValue ?? null,
    hagsNote: 'Este valor del registro no confirma que la GPU y el controlador admitan HAGS. Comprueba el ajuste efectivo en Configuracion de Windows y reinicia.',
    rebar: describeRebar(details?.gpus || []),
    gpus: details?.gpus || []
  };
}

export async function changeHags(enabled, settings, execute = executeJson) {
  if (typeof enabled !== 'boolean') throw new Error('Selecciona activar o desactivar HAGS.');
  const read = async () => (await execute(`$item = Get-ItemProperty -LiteralPath '${graphicKey}' -Name HwSchMode -ErrorAction SilentlyContinue; [pscustomobject]@{ value = $(if ($null -eq $item) { $null } else { [int]$item.HwSchMode }) } | ConvertTo-Json -Compress`))?.value ?? null;
  const current = await read();
  const stored = settings.read();
  if (!Object.hasOwn(stored, 'hagsOriginal')) settings.write({ hagsOriginal: current });
  const next = enabled ? 2 : 1;
  await execute(`New-ItemProperty -Path '${graphicKey}' -Name HwSchMode -Value ${next} -PropertyType DWord -Force | Out-Null; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  const actual = await read();
  if (actual !== next) throw new Error('Windows no confirmo el valor solicitado.');
  return { requested: enabled, verifiedRegistry: true, effectiveVerified: false, requiresRestart: true };
}

export async function restoreHags(settings, execute = executeJson) {
  const stored = settings.read();
  if (!Object.hasOwn(stored, 'hagsOriginal')) throw new Error('No hay un valor previo de HAGS guardado.');
  const previous = stored.hagsOriginal;
  if (previous === null) {
    await execute(`Remove-ItemProperty -LiteralPath '${graphicKey}' -Name HwSchMode -ErrorAction SilentlyContinue; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  } else {
    await execute(`New-ItemProperty -Path '${graphicKey}' -Name HwSchMode -Value ${previous} -PropertyType DWord -Force | Out-Null; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  }
  const result = await execute(`$item = Get-ItemProperty -LiteralPath '${graphicKey}' -Name HwSchMode -ErrorAction SilentlyContinue; [pscustomobject]@{ value = $(if ($null -eq $item) { $null } else { [int]$item.HwSchMode }) } | ConvertTo-Json -Compress`);
  if ((result?.value ?? null) !== previous) throw new Error('No se pudo confirmar la restauracion de HAGS.');
  const { hagsOriginal, ...remaining } = settings.read();
  settings.write({ ...remaining, hagsOriginal: undefined });
  return { restored: true, requiresRestart: true, effectiveVerified: false };
}

export async function readStartupIoRule(exe, execute = executeJson) {
  validateStartupIo(exe, null);
  const key = `${imageBase}\\${exe}\\PerfOptions`;
  const data = await execute(`$item = Get-ItemProperty -LiteralPath '${key}' -Name IoPriority -ErrorAction SilentlyContinue; [pscustomobject]@{ value = $(if ($null -eq $item) { $null } else { [int]$item.IoPriority }) } | ConvertTo-Json -Compress`);
  return { exe, level: ioLevelFromRegistry(data?.value), rawValue: data?.value ?? null };
}

export async function changeStartupIoRule(exe, level, settings, execute = executeJson) {
  validateStartupIo(exe, level);
  const before = await readStartupIoRule(exe, execute);
  const key = `${imageBase}\\${exe}\\PerfOptions`;
  const backups = { ...(settings.read().ioRegistryBackups || {}) };
  const id = exe.toLowerCase();
  if (!Object.hasOwn(backups, id)) backups[id] = before.rawValue;
  settings.write({ ioRegistryBackups: backups });
  if (level === null) await execute(`Remove-ItemProperty -LiteralPath '${key}' -Name IoPriority -ErrorAction SilentlyContinue; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  else await execute(`New-Item -Path '${key}' -Force | Out-Null; New-ItemProperty -LiteralPath '${key}' -Name IoPriority -Value ${ioRegistryValues[level]} -PropertyType DWord -Force | Out-Null; [pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress`);
  const after = await readStartupIoRule(exe, execute);
  if (after.rawValue !== (level === null ? null : ioRegistryValues[level])) throw new Error('Windows no confirmo la regla de E/S.');
  return { exe, level, verifiedRegistry: true, effectiveVerified: false, requiresGameRestart: true };
}

export async function restoreStartupIoRule(exe, settings, execute = executeJson) {
  validateStartupIo(exe, null);
  const backups = { ...(settings.read().ioRegistryBackups || {}) };
  const id = exe.toLowerCase();
  if (!Object.hasOwn(backups, id)) throw new Error('No existe una copia del valor anterior.');
  const value = backups[id];
  const key = `${imageBase}\\${exe}\\PerfOptions`;
  if (value === null) await execute(`Remove-ItemProperty -LiteralPath '${key}' -Name IoPriority -ErrorAction SilentlyContinue; [pscustomobject]@{ restored = $true } | ConvertTo-Json -Compress`);
  else await execute(`New-Item -Path '${key}' -Force | Out-Null; New-ItemProperty -LiteralPath '${key}' -Name IoPriority -Value ${value} -PropertyType DWord -Force | Out-Null; [pscustomobject]@{ restored = $true } | ConvertTo-Json -Compress`);
  const check = await readStartupIoRule(exe, execute);
  if (check.rawValue !== value) throw new Error('No se pudo verificar la restauracion de E/S.');
  delete backups[id];
  settings.write({ ioRegistryBackups: backups });
  return { exe, restored: true, requiresGameRestart: true };
}

export async function readSecurityStatus(execute = executeJson) {
  return execute(String.raw`$defender = Get-MpComputerStatus -ErrorAction SilentlyContinue; $update = Get-Service -Name wuauserv -ErrorAction SilentlyContinue; [pscustomobject]@{ antivirus = $(if ($null -eq $defender) { $null } else { [bool]$defender.RealTimeProtectionEnabled }); updateService = $(if ($null -eq $update) { 'No disponible' } else { [string]$update.Status }) } | ConvertTo-Json -Compress`);
}
