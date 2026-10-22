param(
  [ValidateSet('low', 'all')]
  [string]$Mode = 'low'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
  $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'La limpieza necesita permisos de administrador.'
  }

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VortexStandbyRunner {
    [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint LowPart; public int HighPart; }
    [StructLayout(LayoutKind.Sequential)] public struct Privileges { public uint Count; public Luid Luid; public uint Attributes; }
    [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true)] public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool LookupPrivilegeValue(string system, string name, out Luid value);
    [DllImport("advapi32.dll", SetLastError = true)] public static extern bool AdjustTokenPrivileges(IntPtr token, bool disable, ref Privileges privileges, uint bufferLength, IntPtr previous, IntPtr returned);
    [DllImport("ntdll.dll")] public static extern int NtSetSystemInformation(int infoClass, ref int command, int length);
    public static int Purge(bool all) {
        IntPtr token;
        if (!OpenProcessToken(GetCurrentProcess(), 0x28, out token)) throw new Exception("No se pudo abrir el token de seguridad.");
        try {
            Luid luid;
            if (!LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", out luid)) throw new Exception("No se pudo consultar el privilegio requerido.");
            Privileges privilege = new Privileges { Count = 1, Luid = luid, Attributes = 2 };
            if (!AdjustTokenPrivileges(token, false, ref privilege, 0, IntPtr.Zero, IntPtr.Zero) || Marshal.GetLastWin32Error() == 1300)
                throw new Exception("No se pudo habilitar el privilegio. Ejecuta VORTEX como administrador.");
            int command = all ? 4 : 5;
            return NtSetSystemInformation(80, ref command, 4);
        } finally { CloseHandle(token); }
    }
}
'@ -ErrorAction Stop

  $status = [VortexStandbyRunner]::Purge($Mode -eq 'all')
  if ($status -ne 0) {
    throw "Windows rechazó la limpieza de caché (NTSTATUS $status)."
  }
  [pscustomobject]@{ status = 0; mode = $Mode } | ConvertTo-Json -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
