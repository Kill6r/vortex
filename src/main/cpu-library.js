import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateCpuProfile } from '../core/cpu-dashboard.js';

export function createCpuLibrary({ filename, storage = fs, clock = () => new Date().toISOString(), onChange = () => {} }) {
  let state = { profiles: [], benchmarks: [] };
  const validBenchmark = row => row && typeof row.id === 'string' && Number.isFinite(row.scoreMops) && row.scoreMops > 0 && Number.isInteger(row.workerCount) && row.workerCount > 0 && row.workerCount <= 1024 && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0 && typeof row.completedAt === 'string';
  try {
    const data = JSON.parse(storage.readFileSync(filename, 'utf8'));
    state.profiles = (Array.isArray(data?.profiles) ? data.profiles : []).filter(row => typeof row?.id === 'string' && validateCpuProfile(row).valid).slice(0, 30);
    state.benchmarks = (Array.isArray(data?.benchmarks) ? data.benchmarks : []).filter(validBenchmark).slice(0, 100);
  } catch {}
  const snapshot = () => structuredClone(state);
  function commit(next) {
    storage.writeFileSync(`${filename}.tmp`, JSON.stringify(next), 'utf8');
    storage.renameSync(`${filename}.tmp`, filename);
    state = next;
    try { onChange(snapshot()); } catch {}
    return snapshot();
  }
  function saveProfile(input) {
    const validated = validateCpuProfile(input);
    if (!validated.valid) throw new Error(validated.errors.join(' '));
    const existing = state.profiles.find(row => row.name.toLocaleLowerCase() === validated.profile.name.toLocaleLowerCase() && row.cpu === validated.profile.cpu);
    if (!existing && state.profiles.length >= 30) throw new Error('Puedes guardar hasta 30 perfiles. Elimina uno antes de añadir otro.');
    const profile = { ...validated.profile, id: existing?.id || randomUUID(), savedAt: clock() };
    return commit({ ...state, profiles: [profile, ...state.profiles.filter(row => row.id !== profile.id)] });
  }
  function deleteProfile(id) { return commit({ ...state, profiles: state.profiles.filter(row => row.id !== id) }); }
  function addBenchmark(row, cpu) {
    if (!validBenchmark(row)) throw new Error('Resultado de benchmark no válido.');
    if (state.benchmarks.some(value => value.id === row.id)) return snapshot();
    const result = { id: row.id, cpu: String(cpu).slice(0,180), scoreMops: row.scoreMops, workerCount: row.workerCount, durationSeconds: row.durationSeconds, testDurationSeconds: row.testDurationSeconds || 20, benchmarkVersion: row.benchmarkVersion ?? 1, averageCpuUsage: row.averageCpuUsage, averageCpuGHz: row.averageCpuGHz, completedAt: row.completedAt };
    result.configuration = row.configuration ?? null;
    result.sensors = row.sensors ?? null;
    return commit({ ...state, benchmarks: [result, ...state.benchmarks].slice(0, 100) });
  }
  function deleteBenchmark(id) { return commit({ ...state, benchmarks: state.benchmarks.filter(row => row.id !== id) }); }
  return { snapshot, saveProfile, deleteProfile, addBenchmark, deleteBenchmark };
}
