import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainWindowsError } from '../core/errors.js';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export function standbyRunnerPath({ packaged = false, resourcesPath = process.resourcesPath } = {}) {
  return packaged
    ? path.join(resourcesPath, 'helpers', 'standby-cleaner.ps1')
    : path.join(sourceDirectory, 'helpers', 'standby-cleaner.ps1');
}

export function runStandbyHelper(mode, options = {}) {
  if (!['low', 'all'].includes(mode)) throw new Error('Tipo de limpieza no válido.');
  if ((options.platform || process.platform) !== 'win32') throw new Error('La caché standby solo puede limpiarse en Windows.');

  const script = options.scriptPath || standbyRunnerPath(options);
  if (!fs.existsSync(script)) throw new Error('No se encontró el componente de limpieza standby.');

  const start = options.spawn || spawn;
  const timeoutMs = options.timeoutMs || 45000;

  return new Promise((resolve, reject) => {
    const child = start('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-Mode', mode
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: false });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let exceeded = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      exceeded = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', data => {
      stdout += data.toString('utf8');
      if (stdout.length > 64_000) child.kill();
    });
    child.stderr.on('data', data => {
      stderr += data.toString('utf8');
      if (stderr.length > 64_000) child.kill();
    });
    child.on('error', fail);
    child.on('close', code => {
      if (settled) return;
      clearTimeout(timer);
      if (exceeded) return fail(new Error('La limpieza tardó demasiado. Windows puede seguir procesando cambios de memoria.'));
      if (code !== 0) return fail(new Error(explainWindowsError(stderr || stdout)));
      try {
        const result = JSON.parse(stdout.trim());
        if (result?.status !== 0 || result?.mode !== mode) throw new Error('Respuesta inesperada del limpiador standby.');
        settled = true;
        resolve(result);
      } catch (error) {
        fail(error);
      }
    });
  });
}
