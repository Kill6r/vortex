import { executeJson } from './powershell.js';

export const hagsProbeScript = String.raw`
$ErrorActionPreference = 'Stop'
try {
 Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class VortexHagsDetector {
 [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint LowPart; public int HighPart; }
 [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct OpenAdapter {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
  public uint Handle;
  public Luid AdapterLuid;
  public uint Source;
 }
 [StructLayout(LayoutKind.Sequential)] public struct QueryAdapter {
  public uint Handle;
  public uint Type;
  public IntPtr Data;
  public uint Size;
 }
 [StructLayout(LayoutKind.Sequential)] public struct CloseAdapter { public uint Handle; }
 [DllImport("gdi32.dll", ExactSpelling = true)] public static extern int D3DKMTOpenAdapterFromGdiDisplayName(ref OpenAdapter data);
 [DllImport("gdi32.dll", ExactSpelling = true)] public static extern int D3DKMTQueryAdapterInfo(ref QueryAdapter data);
 [DllImport("gdi32.dll", ExactSpelling = true)] public static extern int D3DKMTCloseAdapter(ref CloseAdapter data);
 public static string[] Read() {
  List<string> results = new List<string>();
  for (int index = 1; index <= 16; index++) {
   string name = @"\\.\DISPLAY" + index;
   OpenAdapter opened = new OpenAdapter { DeviceName = name };
   if (D3DKMTOpenAdapterFromGdiDisplayName(ref opened) != 0) continue;
   IntPtr mem = Marshal.AllocHGlobal(4);
   try {
    Marshal.WriteInt32(mem, 0);
    QueryAdapter query = new QueryAdapter { Handle = opened.Handle, Type = 70, Data = mem, Size = 4 };
    if (D3DKMTQueryAdapterInfo(ref query) == 0) {
     uint flags = unchecked((uint)Marshal.ReadInt32(mem));
     results.Add(name + "|" + ((flags & 1) != 0 ? "1" : "0") + "|" + ((flags & 2) != 0 ? "1" : "0"));
    }
   } finally {
    Marshal.FreeHGlobal(mem);
    CloseAdapter closed = new CloseAdapter { Handle = opened.Handle };
    D3DKMTCloseAdapter(ref closed);
   }
  }
  return results.ToArray();
 }
}
'@ -ErrorAction Stop
 $items = @([VortexHagsDetector]::Read() | ForEach-Object {
  $parts = $_ -split '\|'
  [pscustomobject]@{ display = $parts[0]; supported = ($parts[1] -eq '1'); enabled = ($parts[2] -eq '1') }
 })
 [pscustomobject]@{ source = 'WDDM D3DKMT'; adapters = $items; error = $null } | ConvertTo-Json -Compress -Depth 4
} catch {
 [pscustomobject]@{ source = 'WDDM D3DKMT'; adapters = @(); error = [string]$_.Exception.Message } | ConvertTo-Json -Compress -Depth 4
}
`;

export async function readHagsEffective(query = executeJson) {
  if (process.platform !== 'win32' && query === executeJson) return { available: false, source: 'WDDM D3DKMT', adapters: [], error: 'Disponible en Windows.' };
  try {
    const data = await query(hagsProbeScript);
    const adapters = (Array.isArray(data?.adapters) ? data.adapters : data?.adapters ? [data.adapters] : [])
      .filter(row => typeof row?.supported === 'boolean' && typeof row?.enabled === 'boolean');
    return { available: adapters.length > 0, source: 'WDDM D3DKMT', adapters, enabled: adapters.length ? adapters.some(row => row.enabled) : null, supported: adapters.length ? adapters.some(row => row.supported) : null, error: data?.error || null };
  } catch (error) { return { available: false, source: 'WDDM D3DKMT', adapters: [], enabled: null, supported: null, error: String(error?.message || error) }; }
}
