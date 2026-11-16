import fs from 'node:fs';
import { downsampleCpuRows } from '../core/cpu-dashboard.js';
import { summarizeCpuRecording } from '../core/cpu-tuning.js';

const fields = ['cpuUsage', 'cpuGHz', 'temperatureC', 'packagePowerW', 'pptW', 'tdcA', 'edcA'];
const cleanSample = (row, now) => Object.fromEntries([
  ...fields.map(key => [key, typeof row?.[key] === 'number' && Number.isFinite(row[key]) ? row[key] : null]),
  ['sampledAt', now]
]);

export function createCpuRecordingController({ sample, filename, onStatus = () => {}, clock = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, setDeadlineTimer = setTimeout, clearDeadlineTimer = clearTimeout, maxSamples = 1800, storage = fs } = {}) {
  let session = null;
  let nextId = 0;
  let result = null;
  let error = '';
  let source = '';
  try {
    const saved = filename ? JSON.parse(storage.readFileSync(filename, 'utf8')) : null;
    if (Array.isArray(saved?.rows) && saved.rows.length) {
      const rows = saved.rows.slice(0, maxSamples).map(row => cleanSample(row, row.sampledAt));
      result = { ...summarizeCpuRecording(rows), rows, fileName: 'Registro de VORTEX', capturedAt: saved.capturedAt, durationSeconds: saved.durationSeconds ?? null, elapsedSeconds: saved.elapsedSeconds ?? null, stopReason: saved.stopReason || null, recovered: saved.running === true };
    }
  } catch { /* Un registro ausente o dañado no bloquea la página. */ }

  const status = () => {
    const { rows, ...summary } = result || {};
    return { running: session !== null, recordingId: session?.id ?? null, series: downsampleCpuRows(session?.rows || result?.rows || []), sampleCount: session ? session.rows.length : result?.sampleCount || 0, durationSeconds: session?.durationSeconds ?? result?.durationSeconds ?? null, endsAt: session?.endsAt ?? null, remainingSeconds: session ? Math.max(0, Math.ceil((session.endsAt - clock()) / 1000)) : 0, source, error, result: result ? summary : null };
  };
  function emit() { try { onStatus(status()); } catch {} }
  function persist(state, running) {
    if (!filename) return;
    try {
      storage.writeFileSync(`${filename}.tmp`, JSON.stringify({ rows: state.rows, running, durationSeconds: state.durationSeconds, elapsedSeconds: Math.max(0, Math.round((clock() - state.startedAt) / 1000)), stopReason: state.stopReason || null, capturedAt: new Date(clock()).toISOString() }), 'utf8');
      storage.renameSync(`${filename}.tmp`, filename);
    } catch { error = 'No se pudo guardar el registro en disco. Las muestras siguen disponibles mientras la app esté abierta.'; }
  }
  function stop(reason = 'manual') {
    if (!session) return status();
    const state = session;
    session = null;
    clearTimer(state.timer);
    clearDeadlineTimer(state.deadlineTimer);
    state.stopReason = reason;
    result = state.rows.length ? { ...summarizeCpuRecording(state.rows), rows: state.rows, fileName: 'Registro de VORTEX', capturedAt: new Date(clock()).toISOString(), durationSeconds: state.durationSeconds, elapsedSeconds: Math.max(0, Math.round((clock() - state.startedAt) / 1000)), stopReason: reason } : result;
    if (state.rows.length) persist(state, false);
    else error = 'La grabación se detuvo antes de recibir una muestra. El registro anterior se conserva.';
    emit();
    return status();
  }
  async function tick(state) {
    try {
      const row = await sample();
      if (session !== state) return;
      const cleaned = cleanSample(row, clock());
      if (!fields.some(key => cleaned[key] !== null)) throw new Error('No se recibieron lecturas de sensores.');
      state.rows.push(cleaned);
      source = typeof row?.source === 'string' ? row.source : 'Windows';
      error = '';
      if (state.rows.length === 1 || state.rows.length % 10 === 0) persist(state, true);
      if (state.rows.length >= maxSamples) { stop('sample-limit'); return; }
    } catch (e) {
      if (session !== state) return;
      error = e?.message || 'No se pudo leer esta muestra. Se reintentará.';
    }
    if (session === state) {
      emit();
      state.timer = setTimer(() => { void tick(state); }, 2000);
    }
  }
  function start(options = {}) {
    if (session) return status();
    const durationSeconds = options?.durationSeconds ?? 300;
    if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 3600) throw new Error('La duración debe ser un entero entre 10 y 3600 segundos.');
    const startedAt = clock();
    session = { id: ++nextId, rows: [], timer: null, durationSeconds, startedAt, endsAt: startedAt + durationSeconds * 1000 };
    const state = session;
    state.deadlineTimer = setDeadlineTimer(() => { if (session === state) stop('duration'); }, durationSeconds * 1000);
    state.deadlineTimer?.unref?.();
    error = ''; source = '';
    emit();
    void tick(session);
    return status();
  }
  return { start, stop, status, dispose: stop };
}
