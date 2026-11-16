import { spawn } from 'node:child_process';
import { explainWindowsError } from '../core/errors.js';

export async function executePowerShell(command, { timeoutMs = 25000 } = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Esta función solamente está disponible en Windows 10 y 11.');
  }

  const script = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const bootstrap = Buffer.from("& ([scriptblock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))))", 'utf16le').toString('base64');
  const timeout = Math.max(1000, Math.min(25000, Number(timeoutMs) || 25000));

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', bootstrap], {
      windowsHide: true,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let complete = false;
    let timedOut = false;
    const timeoutTimer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);

    const fail = error => {
      if (!complete) {
        clearTimeout(timeoutTimer);
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
    child.stdin.on('error', fail);
    child.stdin.end(encoded);
    child.on('close', code => {
      if (complete) return;
      clearTimeout(timeoutTimer);
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

export async function executeJson(command, options) {
  const output = await executePowerShell(command, options);
  if (!output) return null;

  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Windows devolvió una respuesta que no pudo interpretarse.');
  }
}
