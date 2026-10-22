import { spawn } from 'node:child_process';
import { explainWindowsError } from '../core/errors.js';

export async function executePowerShell(command) {
  if (process.platform !== 'win32') {
    throw new Error('Esta función solamente está disponible en Windows 10 y 11.');
  }

  const script = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 25000,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let complete = false;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 25000);

    const fail = error => {
      if (!complete) {
        clearTimeout(timeout);
        complete = true;
        reject(error);
      }
    };

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 12_000_000) child.kill();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 1_000_000) child.kill();
    });

    child.on('error', fail);
    child.on('close', code => {
      if (complete) return;
      clearTimeout(timeout);
      if (timedOut) { fail(new Error('La operación tardó demasiado y se canceló.')); return; }
      if (code !== 0) {
        fail(new Error(explainWindowsError(stderr || stdout)));
        return;
      }
      complete = true;
      resolve(stdout.trim());
    });
  });
}

export async function executeJson(command) {
  const output = await executePowerShell(command);
  if (!output) return null;

  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Windows devolvió una respuesta que no pudo interpretarse.');
  }
}
