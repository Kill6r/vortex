import { executeJson, executePowerShell } from './powershell.js';
import { normalizeStartMode, validateServiceChange } from '../core/validation.js';

export async function listWindowsServices() {
  const script = String.raw`$items = @(Get-CimInstance -ClassName Win32_Service | ForEach-Object { $s = $_; $key = Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\' + $s.Name) -ErrorAction SilentlyContinue; $mode = if ($s.StartMode -eq 'Auto' -and $key.DelayedAutoStart -eq 1) { 'Delayed' } else { $s.StartMode }; [pscustomobject]@{ Name = $s.Name; DisplayName = $s.DisplayName; Description = $s.Description; State = $s.State; StartMode = $mode; ProcessId = $s.ProcessId; ServiceType = $s.ServiceType } }); ConvertTo-Json -InputObject $items -Compress -Depth 4`;
  const result = await executeJson(script);
  return (Array.isArray(result) ? result : []).map(service => ({
    name: service.Name,
    displayName: service.DisplayName || service.Name,
    windowsDescription: service.Description || '',
    state: service.State,
    startMode: normalizeStartMode(service.StartMode) || service.StartMode,
    pid: service.ProcessId || null,
    serviceType: service.ServiceType || ''
  }));
}

export async function inspectService(name) {
  validateServiceChange(name, 'Manual', true);
  const result = await executeJson(String.raw`$item = Get-CimInstance Win32_Service -Filter "Name='${name}'"; if (-not $item) { throw 'Servicio no encontrado' }; $service = Get-Service -Name '${name}' -ErrorAction Stop; $key = Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\' + $item.Name) -ErrorAction SilentlyContinue; $mode = if ($item.StartMode -eq 'Auto' -and $key.DelayedAutoStart -eq 1) { 'Delayed' } else { $item.StartMode }; [pscustomobject]@{ Name = $item.Name; StartMode = $mode; State = $item.State; Dependents = @($service.DependentServices | Where-Object { $_.Status -eq 'Running' } | Select-Object -ExpandProperty Name) } | ConvertTo-Json -Compress -Depth 3`);
  return {
    name: result.Name,
    mode: normalizeStartMode(result.StartMode),
    state: result.State,
    runningDependents: Array.isArray(result.Dependents) ? result.Dependents : result.Dependents ? [result.Dependents] : []
  };
}

export async function changeServiceStartup(name, mode, advanced = false) {
  validateServiceChange(name, mode, advanced);
  const before = await inspectService(name);

  if (!before.mode) throw new Error('Este servicio tiene un inicio no compatible con el editor.');
  if (before.mode === mode) throw new Error('El servicio ya tiene ese tipo de inicio.');
  if (mode === 'Disabled' && before.runningDependents.length && !advanced) {
    throw new Error(`Existen servicios dependientes activos: ${before.runningDependents.join(', ')}. Utiliza el modo avanzado tras revisar las consecuencias.`);
  }

  const startup = { Automatic: 'auto', AutomaticDelayed: 'delayed-auto', Manual: 'demand', Disabled: 'disabled' }[mode];
  await executePowerShell(`& sc.exe config '${name}' start= ${startup} | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Windows rechazó la modificación del servicio. Comprueba los permisos.' }`);
  const after = await inspectService(name);

  if (after.mode !== mode) {
    throw new Error('No fue posible verificar el cambio. Comprueba los permisos y revisa el Administrador de servicios.');
  }

  return { name, previousMode: before.mode, newMode: after.mode };
}
