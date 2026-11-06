import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);

export function parseNvidiaBarReport(output) {
  if (typeof output !== 'string') return [];
  const blocks = output.split(/(?=^GPU\s+\d+\s*:\s*|^GPU\s+[0-9A-F]{4,}:)/im).filter(Boolean);
  const rows = [];
  for (const block of blocks) {
    const bar = block.match(/BAR1 Memory Usage\s*\r?\n\s*Total\s*:\s*([\d.,]+)\s*(MiB|GiB|KiB)/i);
    if (!bar) continue;
    const factor = /gib/i.test(bar[2]) ? 1024 ** 3 : /kib/i.test(bar[2]) ? 1024 : 1024 ** 2;
    const amount = Number(bar[1].replace(/,/g, ''));
    const name = block.match(/Product Name\s*:\s*(.+)/i)?.[1]?.trim() || 'GPU NVIDIA';
    if (Number.isFinite(amount) && amount > 0) rows.push({ name, bar1Bytes: amount * factor, source: 'Controlador NVIDIA (BAR1)' });
  }
  return rows;
}

export async function readNvidiaBarReport(run = runFile, env = process.env) {
  if (process.platform !== 'win32' && run === runFile) return [];
  const candidates = [
    path.join(env.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
    path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
    'nvidia-smi.exe'
  ];
  for (const file of candidates) {
    if (file.includes('\\') && !fs.existsSync(file) && run === runFile) continue;
    try {
      const result = await run(file, ['-q', '-d', 'MEMORY'], { windowsHide: true, timeout: 9000, maxBuffer: 2 * 1024 ** 2 });
      const rows = parseNvidiaBarReport(result.stdout ?? result);
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}
