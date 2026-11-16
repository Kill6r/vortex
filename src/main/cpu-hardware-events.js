import { executeJson } from './powershell.js';

export async function readCpuHardwareEvents(startMs, endMs, execute = executeJson) {
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs < startMs) {
    throw new Error('No se pudo determinar el intervalo de validación.');
  }
  const result = await execute(`
    $from = [DateTimeOffset]::FromUnixTimeMilliseconds(${startMs}).LocalDateTime
    $until = [DateTimeOffset]::FromUnixTimeMilliseconds(${endMs}).LocalDateTime
    try {
      $entries = @(Get-WinEvent -FilterHashtable @{
        LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = $from; EndTime = $until
      } -MaxEvents 20 -ErrorAction Stop | ForEach-Object {
        [pscustomobject]@{ id = [int]$_.Id; at = ([DateTimeOffset]$_.TimeCreated).ToUnixTimeMilliseconds() }
      })
    } catch {
      if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound,*') { throw }
      $entries = @()
    }
    [pscustomobject]@{ events = $entries } | ConvertTo-Json -Compress
  `, { timeoutMs: 6000 });
  if (!Array.isArray(result?.events) || result.events.some(event => !Number.isInteger(event?.id) ||
    !Number.isSafeInteger(event.at) || event.at < startMs || event.at > endMs)) {
    throw new Error('Windows no devolvió un registro de hardware verificable.');
  }
  return result.events;
}
