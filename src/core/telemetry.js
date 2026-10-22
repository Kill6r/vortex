import { measureCpu } from './advanced.js';

export function sampleProcesses(entries, previous, sampledAt, cpuCount, totalRam, gpu = {}) {
  const records = new Map();
  const next = new Map();
  for (const entry of entries) {
    if (!Number.isInteger(entry.pid) || !entry.name || !Number.isFinite(entry.cpuSeconds)) continue;
    const previousValue = previous.get(entry.pid);
    const current = { ...entry, sampledAt };
    const cpuPercent = measureCpu(previousValue, current, cpuCount);
    const name = String(entry.name).replace(/\.exe$/i, '').toLowerCase();
    next.set(entry.pid, current);
    if (!records.has(name)) records.set(name, { name: entry.name, count: 0, memory: 0, privateMemory: 0, cpuPercent: 0, cpuReady: false, gpuPercent: null, gpuReady: false, pids: [], foreground: false, visible: false, title: '', entries: [] });
    const group = records.get(name);
    group.count++;
    group.memory += Math.max(0, Number(entry.memory) || 0);
    group.privateMemory += Math.max(0, Number(entry.privateMemory) || 0);
    group.cpuPercent += cpuPercent || 0;
    group.cpuReady ||= cpuPercent !== null;
    group.pids.push(entry.pid);
    group.foreground ||= Boolean(entry.foreground);
    group.visible ||= Boolean(entry.visible);
    if (entry.title && !group.title) group.title = entry.title;
    group.entries.push({ ...entry, cpuPercent, gpuPercent: gpu[entry.pid] ?? null });
    if (Number.isFinite(gpu[entry.pid])) {
      group.gpuReady = true;
      group.gpuPercent = Math.min(100, (group.gpuPercent ?? 0) + gpu[entry.pid]);
    }
  }
  const groups = [...records.values()].map(group => ({
    ...group,
    cpuPercent: group.cpuReady ? Math.min(100, group.cpuPercent) : null,
    gpuPercent: group.gpuReady ? Math.min(100, group.gpuPercent) : null,
    ramPercent: totalRam > 0 ? group.memory / totalRam * 100 : null
  })).sort((a, b) => b.memory - a.memory);
  return { groups, samples: next };
}

export function parseGpuEngines(items) {
  if (!Array.isArray(items)) return {};
  const byPid = new Map();
  for (const row of items) {
    const name = String(row.name || '');
    const match = name.match(/(?:^|_)pid_(\d+)(?:_|$)/i);
    const engine = name.match(/engtype_([^_]+)/i)?.[1] || 'unknown';
    const usage = Number(row.value);
    if (!match || !Number.isFinite(usage) || usage < 0) continue;
    const pid = Number(match[1]);
    const engines = byPid.get(pid) || new Map();
    engines.set(engine, Math.max(engines.get(engine) || 0, usage));
    byPid.set(pid, engines);
  }
  return Object.fromEntries([...byPid].map(([pid, engines]) => [pid, Math.min(100, Math.max(...engines.values()))]));
}

export function validateMemoryProfileName(value) {
  const name = String(value || '').trim();
  if (!/^[\p{L}\p{N}_ .()-]{2,42}$/u.test(name)) throw new Error('El perfil debe tener entre 2 y 42 caracteres válidos.');
  return name;
}
