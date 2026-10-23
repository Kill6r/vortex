import { executeJson } from './powershell.js';
import { validateGameProcess } from '../core/performance.js';
import { gpuLevels, ioLevels, memoryLevels, ecoLevels } from '../core/advanced.js';

const native = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class VortexNative {
    [StructLayout(LayoutKind.Sequential)] public struct MemoryPriority { public uint Level; }
    [StructLayout(LayoutKind.Sequential)] public struct PowerThrottling { public uint Version; public uint ControlMask; public uint StateMask; }
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessInformation(IntPtr handle, int kind, ref MemoryPriority info, int size);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr handle, int kind, ref MemoryPriority info, int size);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr handle, int kind, ref PowerThrottling info, int size);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessInformation(IntPtr handle, int kind, ref PowerThrottling info, int size);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessPriorityBoost(IntPtr handle, out bool disabled);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessPriorityBoost(IntPtr handle, bool disabled);
    [DllImport("gdi32.dll")] public static extern int D3DKMTGetProcessSchedulingPriorityClass(IntPtr process, out int value);
    [DllImport("gdi32.dll")] public static extern int D3DKMTSetProcessSchedulingPriorityClass(IntPtr process, int value);
    [DllImport("ntdll.dll")] public static extern int NtQueryInformationProcess(IntPtr process, int kind, out int value, int length, out int returned);
    [DllImport("ntdll.dll")] public static extern int NtSetInformationProcess(IntPtr process, int kind, ref int value, int length);
    [DllImport("psapi.dll", SetLastError=true)] public static extern bool EmptyWorkingSet(IntPtr handle);
    public static IntPtr Open(uint pid) {
        IntPtr h = OpenProcess(0x1600, false, pid);
        if (h == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Acceso denegado al proceso.");
        return h;
    }
    public static object Read(uint pid) {
        IntPtr h = Open(pid);
        try {
            int gpu; int io; int returned;
            var mem = new MemoryPriority();
            object gpuValue = null;
            object ioValue = null;
            try { if (D3DKMTGetProcessSchedulingPriorityClass(h, out gpu) == 0) gpuValue = gpu; } catch (EntryPointNotFoundException) {}
            try { if (NtQueryInformationProcess(h, 33, out io, 4, out returned) == 0) ioValue = io; } catch (EntryPointNotFoundException) {}
            object memoryValue = GetProcessInformation(h, 0, ref mem, 4) ? (object)mem.Level : null;
            var power = new PowerThrottling { Version = 1 };
            object efficiency = null;
            if (GetProcessInformation(h, 4, ref power, 12)) {
                efficiency = (power.ControlMask & 1u) == 0u ? "System" : (power.StateMask & 1u) == 1u ? "Efficient" : "Performance";
            }
            bool disabled;
            object threadBoost = GetProcessPriorityBoost(h, out disabled) ? (object)(disabled ? "Disabled" : "Enabled") : null;
            return new { gpu = gpuValue, io = ioValue, memory = memoryValue, efficiency = efficiency, threadBoost = threadBoost };
        } finally { CloseHandle(h); }
    }
    public static int Change(uint pid, string field, int value) {
        IntPtr h = Open(pid);
        try {
            int status = 0;
            if (field == "gpu") status = D3DKMTSetProcessSchedulingPriorityClass(h, value);
            else if (field == "io") status = NtSetInformationProcess(h, 33, ref value, 4);
            else if (field == "memory") {
                var info = new MemoryPriority { Level = (uint)value };
                if (!SetProcessInformation(h, 0, ref info, 4)) throw new Win32Exception(Marshal.GetLastWin32Error());
            } else if (field == "efficiency") {
                var info = new PowerThrottling { Version = 1, ControlMask = value == 0 ? 0u : 1u, StateMask = value == 1 ? 1u : 0u };
                if (!SetProcessInformation(h, 4, ref info, 12)) throw new Win32Exception(Marshal.GetLastWin32Error());
            } else if (field == "threadBoost") {
                if (!SetProcessPriorityBoost(h, value == 1)) throw new Win32Exception(Marshal.GetLastWin32Error());
            } else if (field == "trim") {
                if (!EmptyWorkingSet(h)) throw new Win32Exception(Marshal.GetLastWin32Error());
            } else throw new ArgumentException("Acción desconocida.");
            return status;
        } finally { CloseHandle(h); }
    }
}
'@ -ErrorAction Stop
`;

const levels = { gpu: gpuLevels, io: ioLevels, memory: memoryLevels, efficiency: ecoLevels, threadBoost: ['Enabled', 'Disabled'] };
const offsets = { gpu: 0, io: 0, memory: 1, efficiency: 0, threadBoost: 0 };
const reverse = { io: ioLevels, gpu: gpuLevels, memory: memoryLevels };

function identity(pid, started) {
  validateGameProcess(pid);
  if (typeof started !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(started)) throw new Error('Identidad de proceso no válida.');
  return `$p = Get-Process -Id ${pid} -ErrorAction Stop; if ($p.StartTime.ToUniversalTime().ToString('o') -ne '${started}') { throw 'El proceso cambió o no tiene ventana visible.' };`;
}

export async function readAdvancedProcess(pid, started, execute = executeJson) {
  const data = await execute(`${identity(pid, started)}\n${native}\n[VortexNative]::Read([uint32]${pid}) | ConvertTo-Json -Compress`);
  if (!data) throw new Error('No se pudo consultar la configuración del proceso.');
  return { ...Object.fromEntries(['gpu', 'io', 'memory'].map(key => [key, data[key] == null ? null : reverse[key][data[key] - offsets[key]] ?? null])),
    efficiency: ['System', 'Efficient', 'Performance'].includes(data.efficiency) ? data.efficiency : null,
    threadBoost: ['Enabled', 'Disabled'].includes(data.threadBoost) ? data.threadBoost : null };
}

export async function setAdvancedProcess(pid, started, kind, value, execute = executeJson) {
  if (kind === 'trim') {
    if (value !== 'run') throw new Error('Acción SmartTrim inválida.');
  } else if (!levels[kind]?.includes(value)) {
    throw new Error('Opción de prioridad no admitida.');
  }
  const number = kind === 'trim' ? 0 : levels[kind].indexOf(value) + offsets[kind];
  const output = await execute(`${identity(pid, started)}\n${native}\n$status = [VortexNative]::Change([uint32]${pid}, '${kind}', ${number}); [pscustomobject]@{ status = [int64]$status } | ConvertTo-Json -Compress`);
  if (output?.status !== 0) throw new Error(`Windows rechazó la operación ${kind} (NTSTATUS ${output?.status ?? 'desconocido'}).`);
  if (kind === 'trim') return { pid, kind, value, applied: true, verified: false };
  const actual = await readAdvancedProcess(pid, started, execute);
  if (actual[kind] == null) throw new Error(`Windows no permite comprobar ${kind}. No se confirmará como aplicado.`);
  if (actual[kind] !== value) throw new Error(`Windows informa ${actual[kind]} para ${kind}, en lugar de ${value}.`);
  return { pid, kind, value, actual: actual[kind], applied: true, verified: true };
}
