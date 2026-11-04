import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanerTargets, validateCleanerSelection } from '../core/cleaner.js';
import { executeJson } from './powershell.js';

const recyclingScript = String.raw`
$ns = (New-Object -ComObject Shell.Application).Namespace(10)
$bytes = [int64]0
if ($null -ne $ns) {
  foreach ($item in @($ns.Items())) {
    try { $bytes += [int64]$item.Size } catch {}
  }
}
[pscustomobject]@{bytes=$bytes} | ConvertTo-Json -Compress
`;

const clearRecyclingScript = String.raw`
Clear-RecycleBin -Force -ErrorAction Stop
[pscustomobject]@{cleared=$true} | ConvertTo-Json -Compress
`;

const updateServicesScript = String.raw`
$running = @(Get-Service -Name 'wuauserv','bits','UsoSvc','DoSvc' -ErrorAction SilentlyContinue | Where-Object {$_.Status -eq 'Running'})
[pscustomobject]@{running = $running.Count -gt 0} | ConvertTo-Json -Compress
`;

function defaultPaths() {
  const windows = process.env.SystemRoot || 'C:\\Windows';
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return {
    temp: [os.tmpdir(), path.join(windows, 'Temp')],
    prefetch: [path.join(windows, 'Prefetch')],
    'windows-update': [path.join(windows, 'SoftwareDistribution', 'Download')],
    thumbnails: [path.join(local, 'Microsoft', 'Windows', 'Explorer')],
    errorreports: [path.join(local, 'CrashDumps')]
  };
}

function safeRoot(root) {
  const resolved = path.resolve(String(root || ''));
  const parsed = path.parse(resolved);
  if (resolved === parsed.root || !root || resolved.length <= parsed.root.length + 3) throw new Error('La ruta de limpieza no es segura.');
  return resolved;
}

export function createCleanerController(dependencies = {}) {
  const filesystem = dependencies.fs || fs;
  const paths = dependencies.paths || defaultPaths();
  const platform = dependencies.platform || process.platform;
  const query = dependencies.query || executeJson;
  const isAdmin = dependencies.isAdmin || (async () => false);
  const clock = dependencies.clock || (() => Date.now());
  let cache = null;
  let cacheAt = 0;
  let scanning = null;
  let cleaning = false;

  async function listEntries(directory, only = null) {
    const entries = await filesystem.readdir(directory, { withFileTypes: true }).catch(() => []);
    return entries.filter(entry => !entry.isSymbolicLink() && (!only || only(entry)));
  }

  async function sizeOf(root, deadline, only = null) {
    let bytes = 0;
    let files = 0;
    let limited = false;
    const stack = [{ directory: safeRoot(root), only }];
    while (stack.length > 0) {
      if (files > 60000 || clock() > deadline) { limited = true; break; }
      const { directory, only: filter } = stack.pop();
      const entries = await listEntries(directory, filter);
      for (const entry of entries) {
        if (files > 60000 || clock() > deadline) { limited = true; break; }
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) stack.push({ directory: file, only: null });
        else if (entry.isFile()) {
          files++;
          const stat = await filesystem.lstat(file).catch(() => null);
          if (stat?.isFile() && !stat.isSymbolicLink()) bytes += stat.size;
        }
      }
      if (limited) break;
    }
    return { bytes, files, limited };
  }

  const filterFor = id => id === 'thumbnails' ? entry => entry.isFile() && /^thumbcache_.*\.db$/i.test(entry.name) : null;

  async function measure(id) {
    if (id === 'recyclebin') {
      try { return { bytes: Math.max(0, Number((await query(recyclingScript))?.bytes) || 0), limited: false }; }
      catch { return { bytes: null, limited: true }; }
    }
    const roots = [...new Set(paths[id] || [])];
    let bytes = 0;
    let limited = false;
    for (const root of roots) {
      const count = await sizeOf(root, clock() + 8000, filterFor(id));
      bytes += count.bytes;
      limited ||= count.limited;
    }
    return { bytes, limited };
  }

  async function scan(force = false) {
    if (platform !== 'win32') throw new Error('El limpiador de archivos solo funciona en Windows.');
    if (scanning) return scanning;
    if (!force && cache && clock() - cacheAt < 30000) return cache;
    scanning = (async () => {
      const items = [];
      for (const target of cleanerTargets) {
        try { items.push({ ...target, ...(await measure(target.id)), error: null }); }
        catch (error) { items.push({ ...target, bytes: null, limited: false, error: error.message }); }
      }
      cache = { items, sampledAt: clock() };
      cacheAt = clock();
      return cache;
    })();
    try { return await scanning; }
    finally { scanning = null; }
  }

  async function removeTarget(id) {
    let freed = 0;
    let deleted = 0;
    let skipped = 0;
    const roots = [...new Set(paths[id] || [])];
    for (const root of roots) {
      const directory = safeRoot(root);
      const entries = await listEntries(directory, filterFor(id));
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        const stat = await filesystem.lstat(file).catch(() => null);
        if (!stat || stat.isSymbolicLink()) { skipped++; continue; }
        const item = entry.isDirectory() ? await sizeOf(file, clock() + 10000) : { bytes: stat.isFile() ? stat.size : 0, limited: false };
        if (item.limited) { skipped++; continue; }
        try {
          await filesystem.rm(file, { recursive: entry.isDirectory(), force: true, maxRetries: 1 });
          freed += item.bytes;
          deleted++;
        } catch { skipped++; }
      }
    }
    return { freed, deleted, skipped };
  }

  async function clean(ids, advancedAllowed = false) {
    const selected = validateCleanerSelection(ids, advancedAllowed);
    if (platform !== 'win32') throw new Error('El limpiador solo funciona en Windows.');
    if (cleaning || scanning) throw new Error('Ya hay una operacion del limpiador en curso.');
    cleaning = true;
    const results = [];
    try {
      for (const target of selected) {
        try {
          if (target.admin && !(await isAdmin())) throw new Error('Necesitas abrir VORTEX como administrador.');
          if (target.id === 'windows-update') {
            const state = await query(updateServicesScript);
            if (state?.running !== false) throw new Error('Windows Update o un servicio relacionado esta activo. No se modifico su cache.');
          }
          if (target.id === 'recyclebin') {
            const before = await measure('recyclebin');
            await query(clearRecyclingScript);
            const after = await measure('recyclebin');
            results.push({ id: target.id, freed: before.bytes === null || after.bytes === null ? null : Math.max(0, before.bytes - after.bytes), deleted: null, skipped: 0, error: null });
          } else results.push({ id: target.id, ...(await removeTarget(target.id)), error: null });
        } catch (error) {
          results.push({ id: target.id, freed: 0, deleted: 0, skipped: 0, error: error.message || 'No fue posible limpiar esta categoria.' });
        }
      }
      cache = null;
      return { results, cleanedAt: clock() };
    } finally { cleaning = false; }
  }

  return { scan, clean };
}
