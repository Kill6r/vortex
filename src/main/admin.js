import { app } from 'electron';
import { executeJson } from './powershell.js';

const statusScript = String.raw`
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
[pscustomobject]@{ enabled = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } | ConvertTo-Json -Compress
`;

export async function adminStatus() {
  try { return await executeJson(statusScript); }
  catch (error) { return { enabled: false, error: error.message }; }
}

function quoted(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

export async function requestElevation() {
  if (process.platform !== 'win32') throw new Error('La elevación solo funciona en Windows.');
  if ((await adminStatus()).enabled) return { elevated: true, launched: false };
  const executable = quoted(process.execPath);
  const applicationPath = quoted(app.getAppPath());
  const argumentsText = app.isPackaged ? '' : `-ArgumentList ('"' + ${applicationPath} + '"')`;
  const script = `$p = Start-Process -FilePath ${executable} ${argumentsText} -Verb RunAs -PassThru -ErrorAction Stop; [pscustomobject]@{ launched = ($null -ne $p); pid = $p.Id } | ConvertTo-Json -Compress`;
  const result = await executeJson(script);
  if (!result?.launched) throw new Error('No se pudo abrir la instancia con permisos de administrador.');
  setTimeout(() => app.quit(), 250);
  return result;
}
