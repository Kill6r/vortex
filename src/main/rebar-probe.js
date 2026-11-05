import { executeJson } from './powershell.js';

const script = String.raw`
$results = @()
try {
 $adapters = @(Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { $_.PNPClass -eq 'Display' -and $_.DeviceID -like 'PCI\VEN_*' })
 foreach ($gpu in $adapters) {
  try {
   $ranges = @(Get-CimAssociatedInstance -InputObject $gpu -Association Win32_PnPAllocatedResource -ResultClassName Win32_DeviceMemoryAddress -ErrorAction Stop)
   $largest = [double]0
   foreach ($range in $ranges) {
    $bytes = ([double]$range.EndingAddress - [double]$range.StartingAddress) + 1
    if ($bytes -gt $largest -and $bytes -gt 0) { $largest = $bytes }
   }
   $results += [pscustomobject]@{ name = [string]$gpu.Name; largestBarBytes = $largest }
  } catch {}
 }
} catch {}
ConvertTo-Json -InputObject $results -Compress -Depth 3
`;

export async function readRebarResources(query = executeJson) {
  if (process.platform !== 'win32' && query === executeJson) return [];
  try {
    const data = await query(script);
    return Array.isArray(data) ? data : data ? [data] : [];
  } catch { return []; }
}
