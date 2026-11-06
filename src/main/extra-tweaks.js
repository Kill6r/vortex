import { executeJson } from './powershell.js';
import { extraTweaks, getExtraTweak, inferExtraTweakState } from '../core/extra-tweaks.js';

function quote(value) { return `'${String(value).replace(/'/g, "''")}'`; }

function readValuesScript(tweaks) {
  const lines = ['$out = @()'];
  for (const tweak of tweaks) {
    lines.push('$vals = @()');
    for (const item of tweak.values) {
      lines.push(`$found = Get-ItemProperty -LiteralPath ${quote(item.path)} -Name ${quote(item.name)} -ErrorAction SilentlyContinue`);
      lines.push(`$vals += [pscustomobject]@{ value = $(if ($null -eq $found) { $null } else { $found.${item.name.match(/^[A-Za-z0-9]+$/) ? item.name : `PSObject.Properties[${quote(item.name)}].Value`} }) }`);
    }
    lines.push(`$out += [pscustomobject]@{ id = ${quote(tweak.id)}; values = @($vals) }`);
  }
  lines.push('ConvertTo-Json -InputObject $out -Compress -Depth 5');
  return lines.join('; ');
}

export async function readExtraTweaks(execute = executeJson) {
  const rows = await execute(readValuesScript(extraTweaks));
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return extraTweaks.map(tweak => {
    const current = items.find(item => item.id === tweak.id);
    const values = Array.isArray(current?.values) ? current.values.map(x => x?.value ?? null) : [];
    return { id: tweak.id, state: inferExtraTweakState(tweak, values), values, title: tweak.title, category: tweak.category };
  });
}

function writeScript(tweak, values) {
  const lines = [];
  for (let i = 0; i < tweak.values.length; i++) {
    const item = tweak.values[i];
    const value = values[i];
    if (value === null || value === undefined) {
      lines.push(`Remove-ItemProperty -LiteralPath ${quote(item.path)} -Name ${quote(item.name)} -ErrorAction SilentlyContinue`);
    } else {
      lines.push(`New-Item -Path ${quote(item.path)} -Force | Out-Null`);
      lines.push(`New-ItemProperty -LiteralPath ${quote(item.path)} -Name ${quote(item.name)} -PropertyType ${item.type} -Value ${quote(value)} -Force | Out-Null`);
    }
  }
  lines.push('[pscustomobject]@{ changed = $true } | ConvertTo-Json -Compress');
  return lines.join('; ');
}

export async function setExtraTweak(id, enabled, settings, execute = executeJson) {
  const tweak = getExtraTweak(id);
  if (!tweak || typeof enabled !== 'boolean') throw new Error('Selecciona un tweak disponible.');
  const current = await execute(readValuesScript([tweak]));
  const row = Array.isArray(current) ? current[0] : current;
  const values = Array.isArray(row?.values) ? row.values.map(x => x?.value ?? null) : [];
  if (values.length !== tweak.values.length) throw new Error('Windows no devolvio los ajustes anteriores.');
  const backups = { ...(settings.read().extraTweakBackups || {}) };
  if (!Object.hasOwn(backups, id)) backups[id] = values;
  settings.write({ extraTweakBackups: backups });
  const next = tweak.values.map(item => enabled ? item.on : item.off);
  await execute(writeScript(tweak, next));
  const actual = await execute(readValuesScript([tweak]));
  const result = Array.isArray(actual) ? actual[0] : actual;
  if (inferExtraTweakState(tweak, result?.values?.map(x => x?.value ?? null)) !== enabled) throw new Error('Windows no confirmo el cambio. Revisa los permisos.');
  return { id, enabled, restart: tweak.restart || null };
}

export async function restoreExtraTweak(id, settings, execute = executeJson) {
  const tweak = getExtraTweak(id);
  if (!tweak) throw new Error('Tweak no disponible.');
  const backups = { ...(settings.read().extraTweakBackups || {}) };
  if (!Object.hasOwn(backups, id)) throw new Error('No hay una copia anterior de este tweak.');
  const previous = backups[id];
  await execute(writeScript(tweak, previous));
  const actual = await execute(readValuesScript([tweak]));
  const result = Array.isArray(actual) ? actual[0] : actual;
  const current = result?.values?.map(x => x?.value ?? null);
  if (!Array.isArray(current) || current.length !== previous.length || current.some((value, index) => String(value) !== String(previous[index]))) throw new Error('No se pudo confirmar la restauracion.');
  delete backups[id];
  settings.write({ extraTweakBackups: backups });
  return { id, restored: true };
}
