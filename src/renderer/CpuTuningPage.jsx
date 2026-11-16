import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronDown, ClipboardCopy, Cpu, Gauge, LayoutDashboard, Play, RefreshCw, Save, SlidersHorizontal, Square, Trash2 } from 'lucide-react';
import { compareCpuBenchmarks, cpuTuningAdvice, RYZEN_5_9600X_PROFILES } from '../core/cpu-tuning.js';
import { chartSegments, gaugeStatus, validateCpuProfile } from '../core/cpu-dashboard.js';
import { nativeTuningTarget, NATIVE_LIMITS } from '../core/cpu-native.js';
import { BENCHMARK_MAX_SECONDS, BOOST_STEPS, RYZEN_9600X_BOOST_ZERO_MHZ, benchmarkProfileRecommendations, boostOverrideFromTargetMHz, sweepBoostLimit } from '../core/cpu-benchmark-analysis.js';

const DRAFT_KEY = 'vortex.cpu.pbo.9600x.v2';
const DURATION_KEY = 'vortex.cpu.recording.minutes';
const BENCH_SECONDS_KEY = 'vortex.cpu.benchmark.seconds';
const parseIntegerDraft = value => /^\d+$/.test(String(value)) ? Number(value) : NaN;
const timeLabel = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
const REFERENCE_KEY = 'vortex.cpu.benchmark.reference.v1';
const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('es-CO', { maximumFractionDigits: digits }) : '—';
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('es-CO') : '—';

function SensorGauge({ label, value, unit, limit, help }) {
  const status = gaugeStatus(value, limit);
  const percent = Number.isFinite(value) && limit > 0 ? Math.round(value / limit * 100) : null;
  return <div className={`cpu-gauge cpu-status-${status.level}`}>
    <div className="cpu-gauge-label"><span>{label}</span><span className="cpu-status-dot" role="img" aria-label={status.label} title={status.label}/></div>
    <div className="cpu-gauge-value"><svg viewBox="0 0 40 36" aria-hidden="true"><path className="cpu-gauge-track" d="M7 29a17 17 0 1 1 26 0" pathLength="100"/>{percent !== null && <path className="cpu-gauge-fill" d="M7 29a17 17 0 1 1 26 0" pathLength="100" strokeDasharray={`${Math.min(100, Math.max(0, percent))} 100`}/>}</svg><strong>{number(value, unit === '%' || unit === 'MHz' ? 0 : unit === 'V' ? 3 : 2)}<small> {unit}</small></strong></div>
    <small className="cpu-gauge-hint">{percent !== null ? `${percent}% de ${number(limit)} ${unit}` : Number.isFinite(value) ? help || 'Lectura del sensor' : 'No disponible'}</small>
  </div>;
}

function SensorChart({ label, rows, field, unit, color, maximum }) {
  const chart = useMemo(() => chartSegments(rows, field, 560, 130, maximum), [rows, field, maximum]);
  const digits = unit === '%' ? 0 : 2;
  const seconds = rows.length > 1 ? Math.round((rows.at(-1).sampledAt - rows[0].sampledAt) / 1000) : 0;
  return <article className="cpu-chart" style={{ '--chart-color': color }}>
    <header><span>{label}</span><strong>{number(rows.at(-1)?.[field], digits)}<small> {unit}</small></strong></header>
    {chart.segments.length ? <><svg viewBox="0 0 560 130" role="img" aria-label={`${label}: mínimo ${number(chart.minimum, digits)}, máximo ${number(chart.maximum, digits)} ${unit}`}>
      {[8, 65, 122].map(y => <line key={y} x1="8" x2="552" y1={y} y2={y} className="cpu-chart-grid"/>)}
      {chart.segments.map((segment, index) => segment.length > 1 ? <polyline key={index} points={segment.map(point => point.join(',')).join(' ')} fill="none"/> : <circle key={index} cx={segment[0][0]} cy={segment[0][1]} r="3"/>)}
    </svg><footer><span>−{seconds} s → ahora / fin</span><span>Mín. {number(chart.minimum, digits)} · Máx. {number(chart.maximum, digits)} {unit}</span></footer></> : <div className="cpu-chart-empty"><Activity size={22}/><span>No hay lecturas de {label.toLowerCase()} en este registro.</span></div>}
  </article>;
}

function IntegerDraftInput({ label, value, onChange, invalid }) {
  return <input type="text" inputMode="numeric" aria-label={label} aria-invalid={invalid || undefined} value={value}
    onChange={event => {
      const text = event.target.value;
      if (/^\d*$/.test(text)) onChange(text);
    }}/>;
}

function NumericRow({ label, value, unit, min, max, step = 1, onChange, help }) {
  return <label className="cpu-tuning-row"><span>{label}{help && <small>{help}</small>}</span><input type="number" aria-label={label} value={value} min={min} max={max} step={step} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))}/><span className="cpu-unit">{unit}</span></label>;
}

export default function CpuTuningPage({ api }) {
  const [tab, setTab] = useState('dashboard');
  const [cpuName, setCpuName] = useState('');
  const [coreCount, setCoreCount] = useState(0);
  const [threads, setThreads] = useState(1);
  const [limits, setLimits] = useState({ ppt: 75, tdc: 65, edc: 130 });
  const pptRevision = useRef(0);
  const [curve, setCurve] = useState([]);
  const [curveMode, setCurveMode] = useState('off');
  const [allCurve, setAllCurve] = useState(0);
  const [boostOverrideMHz, setBoostOverride] = useState(null);
  const [scalar, setScalar] = useState(1);
  const [boostReferenceMHz, setBoostReferenceMHz] = useState(null);
  const loadedHardware = useRef(false);
  const [profileName, setProfileName] = useState('');
  const [library, setLibrary] = useState({ profiles: [], benchmarks: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [live, setLive] = useState(null);
  const [liveRows, setLiveRows] = useState([]);
  const [liveError, setLiveError] = useState('');
  const [recorder, setRecorder] = useState({ running: false, series: [], sampleCount: 0 });
  const [durationChoice, setDurationChoice] = useState(() => { try { const value = Number(localStorage.getItem(DURATION_KEY)); return [1,5,10,30,60].includes(value) ? String(value) : value >= 1 && value <= 60 ? 'custom' : '5'; } catch { return '5'; } });
  const [customMinutes, setCustomMinutes] = useState(() => { try { const value = Number(localStorage.getItem(DURATION_KEY)); return Number.isInteger(value) && value >= 1 && value <= 60 ? value : 5; } catch { return 5; } });
  const [now, setNow] = useState(Date.now());
  const recordingMinutes = durationChoice === 'custom' ? customMinutes : Number(durationChoice);
  const validDuration = Number.isInteger(recordingMinutes) && recordingMinutes >= 1 && recordingMinutes <= 60;
  const [chartSource, setChartSource] = useState('live');
  const [benchmark, setBenchmark] = useState({ running: false, result: null });
  const [sweep, setSweep] = useState({ running: false, results: [] });
  const [sweepAnalysis, setSweepAnalysis] = useState(null);
  const [sweepObjective, setSweepObjective] = useState('balanced');
  const [sweepMaxBoost, setSweepMaxBoost] = useState(25);
  const [reference, setReference] = useState(null);
  const [benchMode, setBenchMode] = useState('single');
  const [benchSecondsDraft, setBenchSecondsDraft] = useState(() => {
    try {
      const saved = parseIntegerDraft(localStorage.getItem(BENCH_SECONDS_KEY));
      if (saved >= 10 && saved <= BENCHMARK_MAX_SECONDS) return String(saved);
    } catch {}
    return '60';
  });
  const benchSeconds = parseIntegerDraft(benchSecondsDraft);
  const [workers, setWorkers] = useState(1);
  const [historyFilter, setHistoryFilter] = useState('all');
  const activeRef = useRef(true);
  const recordingRef = useRef(false);
  const advice = cpuTuningAdvice(cpuName, live?.tuning);
  const fmaxMHz = boostOverrideMHz === null ? boostReferenceMHz : RYZEN_9600X_BOOST_ZERO_MHZ + boostOverrideMHz;
  const profile = { name: profileName || 'Perfil preparado', cpu: cpuName, coreCount, limits: { ...limits, ppt: parseIntegerDraft(limits.ppt) }, curveMode, curveOptimizer: curveMode === 'off' ? Array(coreCount).fill(0) : curveMode === 'all' ? Array(coreCount).fill(allCurve) : curve, boostOverrideMHz: boostOverrideMHz ?? 0, scalar, ...(fmaxMHz === null ? {} : {fmaxMHz}) };
  const actual = live?.tuning?.supported ? live.tuning : null;
  const activeBoostOffset = actual ? actual.fmaxMHz - RYZEN_9600X_BOOST_ZERO_MHZ : null;
  const tuningReady = live?.tuningReady === true;
  const tuningConnecting = live?.tuningConnecting === true;
  const availableSweepBoost = sweepBoostLimit(actual);
  const selectedSweepBoost = Math.min(sweepMaxBoost, availableSweepBoost ?? 0);
  const analysisReady = Boolean(sweepAnalysis && tuningReady && actual?.fingerprint === sweepAnalysis.fingerprint);
  let nativeError = '';
  try { nativeTuningTarget(profile); } catch(e) { nativeError = e.message; }
  const validation = validateCpuProfile(profile);
  const selectedWorkers = benchMode === 'single' ? 1 : benchMode === 'multi' ? threads : workers;
  const validWorkers = Number.isInteger(selectedWorkers) && selectedWorkers > 0 && selectedWorkers <= threads;
  const validBenchDuration = Number.isInteger(benchSeconds) && benchSeconds >= 10 && benchSeconds <= BENCHMARK_MAX_SECONDS;
  const gameProfiles = useMemo(() => benchmarkProfileRecommendations(library.benchmarks, cpuName, selectedWorkers, benchSeconds), [library.benchmarks, cpuName, selectedWorkers, benchSeconds]);
  const sweepBaseline = sweep.results[0];
  const sweepBest = useMemo(() => sweepBaseline ? benchmarkProfileRecommendations(
    sweep.results.map(row => ({ ...row, cpu: cpuName })), cpuName, sweepBaseline.workerCount, sweepBaseline.testDurationSeconds
  ) : null, [sweep.results, sweepBaseline, cpuName]);
  const preferredSweepProfile = sweepBest?.[sweep.objective]?.[0];
  const comparison = compareCpuBenchmarks(reference, benchmark.result ? { ...benchmark.result, cpu: cpuName } : null);
  const chartRows = chartSource === 'live' ? liveRows : recorder.series || [];

  function syncBoost(targetMHz) {
    setBoostReferenceMHz(targetMHz);
    setBoostOverride(boostOverrideFromTargetMHz(targetMHz));
  }

  function useHardwareValues(state, preservePpt = false) {
    if (Number.isInteger(state.coreCount)) setCoreCount(state.coreCount);
    setLimits(previous => ({ ...state.limits, ppt: preservePpt ? previous.ppt : state.limits.ppt }));
    setScalar(state.scalar); syncBoost(state.fmaxMHz);
    setCurve([...state.curveOptimizer]); setAllCurve(state.curveOptimizer[0]);
    setCurveMode(state.curveOptimizer.every(v=>v===0) ? 'off' : new Set(state.curveOptimizer).size===1 ? 'all' : 'per-core');
  }
  useEffect(() => {
    if (actual && !loadedHardware.current) { loadedHardware.current = true; useHardwareValues(actual, pptRevision.current > 0); }
  }, [actual]);

  useEffect(() => {
    if (validBenchDuration) {
      try { localStorage.setItem(BENCH_SECONDS_KEY, String(benchSeconds)); } catch {}
    }
  }, [benchSeconds, validBenchDuration]);

  useEffect(() => {
    if (!recorder.running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recorder.running]);
  useEffect(() => {
    if (validDuration) { try { localStorage.setItem(DURATION_KEY, String(recordingMinutes)); } catch {} }
  }, [recordingMinutes, validDuration]);
  const remainingSeconds = Number.isFinite(recorder.endsAt) ? Math.max(0, Math.ceil((recorder.endsAt - now) / 1000)) : recorder.remainingSeconds ?? 0;

  async function refreshLibrary() {
    if (!api?.cpuLibrary) throw new Error('Reinicia VORTEX para cargar el módulo CPU actualizado.');
    const data = await api.cpuLibrary();
    if (activeRef.current) setLibrary(data);
  }

  useEffect(() => {
    activeRef.current = true;
    let active = true;
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const saved = JSON.parse(localStorage.getItem(REFERENCE_KEY) || 'null');
      if (saved?.scoreMops > 0) setReference(saved);
      if (draft?.limits && Object.values(draft.limits).every(Number.isFinite)) setLimits(draft.limits);
      if (Number.isInteger(draft?.fmaxMHz)) syncBoost(draft.fmaxMHz);
      if (Number.isInteger(draft?.scalar)) setScalar(draft.scalar);
      if (typeof draft?.name === 'string') setProfileName(draft.name);
    } catch {}
    api?.overview?.().then(data => { if (active) { setCpuName(data?.cpu || ''); setThreads(Math.max(1, Number(data?.threads) || 1)); } }).catch(e => { if (active) setError(e.message); });
    api?.hardwareDetails?.().then(data => {
      if (!active || !Number.isInteger(data?.cores) || data.cores < 1) return;
      setCoreCount(data.cores);
      if (loadedHardware.current) return;
      const values = Array.from({ length: data.cores }, (_, i) => Number.isInteger(draft?.curveOptimizer?.[i]) ? draft.curveOptimizer[i] : 0);
      setCurve(values); setAllCurve(values[0]);
      setCurveMode(['off', 'all', 'per-core'].includes(draft?.curveMode) ? draft.curveMode : values.some(value => value !== 0) ? 'per-core' : 'off');
    }).catch(e => { if (active) setError(e.message); });
    void refreshLibrary().catch(e => { if (active) setError(e.message); });
    let benchmarkEvent = false; let recordingEvent = false;
    const receiveBenchmark = status => {
      if (!active || !status) return;
      setBenchmark(status);
      if (status.historyError) setError(status.historyError);
      if (status.completed && !status.automated) void refreshLibrary().catch(e => { if (active) setError(e.message); });
    };
    const receiveRecording = status => {
      if (!active || !status) return;
      if (status.running && !recordingRef.current) setChartSource('recording');
      recordingRef.current = status.running;
      setRecorder(status);
    };
    const unsubscribeBenchmark = api?.onCpuBenchmarkStatus?.(status => { benchmarkEvent = true; receiveBenchmark(status); });
    const unsubscribeRecording = api?.onCpuRecordingStatus?.(status => { recordingEvent = true; receiveRecording(status); });
    api?.cpuBenchmarkStatus?.().then(status => { if (!benchmarkEvent) receiveBenchmark(status); }).catch(e => { if (active) setError(e.message); });
    api?.cpuRecordingStatus?.().then(status => { if (!recordingEvent) receiveRecording(status); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; activeRef.current = false; unsubscribeBenchmark?.(); unsubscribeRecording?.(); };
  }, [api]);

  useEffect(() => {
    if (!api?.liveMetrics) return;
    let active = true; let pending = false;
    const sample = async () => {
      if (pending) return;
      pending = true;
      try {
        const [metricsResult, sensorsResult] = await Promise.allSettled([
          api.liveMetrics(), api.cpuSensors?.()
        ]);
        const metrics = metricsResult.value;
        const sensors = sensorsResult.value;
        const row = { ...metrics, ...sensors, cpuGHz: sensors?.cpuGHz ?? metrics?.cpuGHz, sampledAt: Date.now() };
        const failure = sensorsResult.reason ?? metricsResult.reason;
        if (active) { setLive(row); setLiveRows(rows => [...rows, row].slice(-120)); setLiveError(failure?.message ?? ''); }
      } catch (e) { if (active) { setLiveError(e.message); setLive(null); setLiveRows(rows => [...rows, {sampledAt:Date.now()}].slice(-120)); } }
      finally { pending = false; }
    };
    void sample();
    const timer = setInterval(sample, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [api]);

  useEffect(() => {
    if (!api?.cpuSweepStatus) return;
    let active = true;
    let pending = false;
    let savedCount = null;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await api.cpuSweepStatus();
        if (!active) return;
        setSweep(status);
        if (savedCount !== null && savedCount !== status.results.length) await refreshLibrary();
        savedCount = status.results.length;
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [api]);

  async function act(action, message = '') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (activeRef.current && message) setNotice(message); }
    catch (e) { if (activeRef.current) setError(e.message || 'No se pudo completar la operación.'); }
    finally { if (activeRef.current) setBusy(false); }
  }
  function loadProfile(value) {
    if (value.cpu && value.cpu !== cpuName || value.coreCount && value.coreCount !== coreCount) { setError('Este perfil corresponde a otro procesador o cantidad de núcleos.'); return; }
    setLimits({ ...value.limits }); setCurve([...value.curveOptimizer]); setCurveMode(value.curveMode); setAllCurve(value.curveOptimizer[0] || 0);
    loadedHardware.current = true;
    syncBoost(value.fmaxMHz ?? actual?.fmaxMHz ?? null); setScalar(value.scalar); setProfileName(value.name); setNotice(`Perfil ${value.name} cargado. Pulsa Aplicar para enviarlo al procesador.`); setError('');
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch { setError('El perfil se cargó, pero no se pudo recordar la selección.'); }
  }
  async function saveProfile() {
    if (!validation.valid || !profileName.trim()) return;
    await act(async () => {
      setLibrary(await api.saveCpuProfile({ ...profile, name: profileName.trim() }));
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(profile)); } catch {}
    }, 'Perfil guardado en este equipo. Puedes cargarlo y aplicarlo cuando quieras.');
  }
  function setReferenceTo(row) {
    try { localStorage.setItem(REFERENCE_KEY, JSON.stringify(row)); setReference(row); setNotice('Referencia seleccionada. Solo se comparan pruebas del mismo procesador, duración y cantidad de hilos.'); }
    catch { setError('No se pudo guardar la referencia.'); }
  }
  async function copyProfile() {
    const p = validation.profile;
    await api.copyText(`${cpuName}\nPerfil: ${p.name}\nPPT: ${p.limits.ppt} W\nTDC: ${p.limits.tdc} A\nEDC: ${p.limits.edc} A\nFMax: ${p.fmaxMHz ?? 'sin definir'} MHz\nPBO Scalar: ${p.scalar}X\nCurve Optimizer: ${p.curveMode}\n${p.curveOptimizer.map((v,i) => `Núcleo ${i}: ${v > 0 ? '+' : ''}${v}`).join('\n')}`);
  }
  function changeCurveMode(next) {
    if (next === 'per-core' && curveMode === 'all') setCurve(Array(coreCount).fill(allCurve));
    if (next === 'all' && curveMode === 'per-core') setAllCurve(curve[0] ?? 0);
    setCurveMode(next);
  }
  function prepareGameProfile(game, measured) {
    const source = measured?.configuration ?? actual;
    if (!source) return;
    useHardwareValues(source);
    setProfileName(game);
    if (!measured && game === 'Equilibrado') {
      setLimits({ ...source.limits, ppt: Math.max(10, Math.floor(source.limits.ppt * 0.9)) });
      setBoostOverride(null);
    } else if (!measured) {
      setBoostOverride(200);
    }
    setTab('tuning');
    setNotice('Perfil cargado para revisión. Pulsa Aplicar para probarlo.');
  }
  function startSweep() {
    if (!analysisReady || !validWorkers || !validBenchDuration) return;
    const prompt = `¿Buscar el mejor perfil con ${benchSeconds} s por prueba y ${selectedWorkers} hilo(s)?\n\nVORTEX medirá la configuración inicial y probará cambios de Curve Optimizer, PPT, TDC, EDC y los pasos de boost que elegiste. Al terminar intentará restaurar la configuración inicial. Guarda tu trabajo antes de empezar: un ajuste inestable puede reiniciar el equipo.`;
    if (!window.confirm(prompt)) return;
    void act(async () => {
      const status = await api.startCpuSweep({ durationSeconds: benchSeconds, workerCount: selectedWorkers,
        maxBoostMHz: selectedSweepBoost, analysisId: sweepAnalysis.id, objective: sweepObjective });
      setSweepAnalysis(null);
      setSweep(status);
    });
  }
  async function applyTuning() {
    if (!actual || !tuningReady || nativeError || !validation.valid) return;
    const target = nativeTuningTarget(profile);
    if (!window.confirm(`¿Aplicar al procesador?\nPPT ${target.limits.ppt} W · TDC ${target.limits.tdc} A · EDC ${target.limits.edc} A\nFMax ${target.fmaxMHz} MHz · Scalar ${target.scalar}X\nCO por núcleo: ${target.curveOptimizer.join(', ')}\n\nUn ajuste inestable puede reiniciar el equipo. VORTEX comprobará los valores tras escribirlos. No se aplicará automáticamente al iniciar Windows.`)) return;
    await act(async () => {
      const revision = pptRevision.current;
      try {
        const result = await api.applyCpuTuning(target, actual.fingerprint);
        useHardwareValues(result.after, pptRevision.current !== revision);
        setNotice(result.changed?.length === 0
          ? 'La configuración ya estaba activa. Se verificó con el procesador.'
          : 'Configuración aplicada y verificada con el procesador.');
      } finally {
        const sensors = await api.cpuSensors().catch(() => null);
        if (activeRef.current) setLive(previous => ({ ...previous, ...(sensors ?? { tuningReady: false }) }));
      }
    });
  }
  const gauges = [
    { label: live?.peakEstimated ? 'Frecuencia pico estimada' : 'Frecuencia pico', value: live?.peakClockMHz, unit: 'MHz', help: live?.peakEstimated ? 'Contadores de Windows · estimación' : 'Pico de los núcleos publicados' },
    { label: 'Temperatura CPU', value: live?.temperatureC, unit: '°C', limit: advice.supported ? 95 : null },
    { label: 'Potencia CPU', value: live?.packagePowerW, unit: 'W' },
    { label: 'Potencia SoC', value: live?.socPowerW, unit: 'W' },
    { label: 'PPT', value: live?.pptW, unit: 'W', limit: live?.pptLimitW },
    { label: 'TDC (CPU)', value: live?.tdcA, unit: 'A', limit: live?.tdcLimitA },
    { label: Number.isFinite(live?.edcA) ? 'EDC (CPU)' : 'Límite EDC', value: live?.edcA ?? live?.edcLimitA, unit: 'A', limit: Number.isFinite(live?.edcA) ? live?.edcLimitA : null, help: 'Límite configurado · no corriente instantánea' },
    { label: 'Voltaje CPU', value: live?.cpuVoltageV, unit: 'V' },
    { label: 'Voltaje SoC', value: live?.socVoltageV, unit: 'V' },
    { label: 'FCLK (Infinity Fabric)', value: live?.fabricClockMHz, unit: 'MHz' },
    { label: 'Uso CPU', value: live?.cpuUsage, unit: '%', help: 'Carga del sistema · no indica estabilidad' },
    { label: 'Frecuencia media', value: live?.cpuGHz, unit: 'GHz', help: live?.frequencyEstimated ? 'Windows · estimación dinámica' : 'Media de los núcleos · sensor' }
  ];
  const filteredHistory = library.benchmarks.filter(row => historyFilter === 'all' || (historyFilter === 'single' ? row.workerCount === 1 : row.workerCount > 1));

  return <div className="cpu-page">
    <header className="cpu-page-header"><div><span className="cpu-eyebrow">VORTEX / PROCESADOR</span><h1><Cpu size={25}/>CPU <span>— {cpuName || 'Identificando procesador…'}</span></h1><p>{coreCount || '—'} núcleos físicos · {threads} hilos lógicos</p></div><span className="cpu-native-tag"><Activity size={15}/>Control integrado</span></header>
    <nav className="cpu-tabs" aria-label="Vistas de CPU">{[['dashboard', 'Dashboard', LayoutDashboard], ['tuning', 'Tuning', SlidersHorizontal]].map(([id, label, Icon]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setNotice(''); }}><Icon size={16}/>{label}</button>)}</nav>
    <div className={`cpu-connection ${tuningReady ? 'connected' : ''}`} role="status">
      <Activity size={20}/><div>
        <strong>{tuningReady ? 'CPU conectada · ajustes disponibles' : tuningConnecting ? 'Conectando CPU…' : actual ? 'Sensores activos · falta autorizar los ajustes' : 'Conecta la CPU para activar los sensores'}</strong>
        <p>{tuningReady ? 'Lectura en vivo · PBO y Curve Optimizer disponibles' : actual ? 'Pulsa Conectar CPU y acepta el permiso de Windows para aplicar.' : live?.tuning?.error || live?.note || 'Iniciando el lector integrado…'}</p>
      </div>
      {!tuningReady && <button className="cpu-button primary" disabled={busy || tuningConnecting || sweep.running} onClick={() => act(async () => {
        if (live?.sensorStatus === 'driver-missing') await api.activateCpuSensors();
        else await api.authorizeCpuSensors();
        const sensors = await api.cpuSensors();
        if (activeRef.current) setLive(previous => ({ ...previous, ...sensors }));
      })}><RefreshCw size={14}/>{tuningConnecting ? 'Conectando…' : live?.sensorStatus === 'driver-missing' ? 'Instalar controlador' : 'Conectar CPU'}</button>}
    </div>
    {error && <div className="cpu-message error" role="alert"><AlertTriangle size={16}/>{error}</div>}
    {notice && <div className="cpu-message" role="status"><Check size={16}/>{notice}</div>}

    {tab === 'dashboard' ? <>
      <details className="cpu-section" open><summary><ChevronDown size={17}/><h2>Indicadores</h2><span>Actualización cada 1 s</span></summary>
        <div className="cpu-gauges">{gauges.map(item => <SensorGauge key={item.label} {...item}/>)}</div>
        <p className="cpu-muted cpu-source">{live?.source || 'Buscando sensores…'} · Verde: lectura disponible; amarillo/rojo: cercanía a un límite conocido. Gris: sin lectura. Los indicadores no certifican estabilidad.</p>
        {liveError && <p className="cpu-error-text">{liveError}</p>}
        {live?.note && <p className="cpu-muted">{live.note}</p>}
        {live?.sensorStatus === 'driver-missing' && <button className="cpu-button primary" disabled={busy} onClick={() => act(() => api.activateCpuSensors(), 'Completa la instalación oficial de PawnIO y acepta el aviso de Windows. Las lecturas se conectarán automáticamente.')}><Activity size={14}/>Activar sensores de hardware</button>}
        {live?.sensorStatus === 'access-denied' && <button className="cpu-button primary" disabled={busy} onClick={() => act(() => api.authorizeCpuSensors(), 'Permiso concedido al lector de hardware. Conectando sensores…')}>Permitir lectura de sensores</button>}
        {['sensor-error','stale'].includes(live?.sensorStatus) && <button className="cpu-button" disabled={busy} onClick={() => act(() => api.reconnectCpuSensors(), 'Reconectando el lector de sensores…')}><RefreshCw size={14}/>Reconectar sensores</button>}
      </details>
      <details className="cpu-section" open><summary><ChevronDown size={17}/><h2>Configuración activa</h2><span>{actual ? 'Leída del procesador' : 'Pendiente de conexión'}</span></summary><div className="cpu-summary-grid">
        {[['Modo', actual ? 'PBO avanzado' : '—'], ['PPT', actual ? `${actual.limits.ppt} W` : '—'], ['TDC', actual ? `${actual.limits.tdc} A` : '—'], ['EDC', actual ? `${actual.limits.edc} A` : '—'], ['Techo de boost (FMax)', actual ? `${actual.fmaxMHz} MHz` : '—'], ['PBO Scalar', actual ? `${actual.scalar}X` : '—'], ['Curve Optimizer', actual ? actual.curveOptimizer.join(' / ') : '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div><button className="cpu-link" onClick={() => setTab('tuning')}>Editar configuración <SlidersHorizontal size={13}/></button></details>

      <section className="cpu-section"><div className="cpu-section-header"><h2><Activity size={17}/>Gráficas de sensores</h2><div className="cpu-segments" aria-label="Fuente de las gráficas"><button aria-pressed={chartSource === 'live'} onClick={() => setChartSource('live')}>En vivo</button><button aria-pressed={chartSource === 'recording'} onClick={() => setChartSource('recording')}>Grabación</button></div></div>
        {!recorder.running && <div className="cpu-duration-controls"><label>Duración de grabación<select aria-label="Duración de grabación" value={durationChoice} onChange={e=>setDurationChoice(e.target.value)}>{[1,5,10,30,60].map(minutes=><option key={minutes} value={String(minutes)}>{minutes} min</option>)}<option value="custom">Personalizada</option></select></label>{durationChoice === 'custom' && <label>Minutos<input aria-label="Minutos de grabación" type="number" min="1" max="60" step="1" value={customMinutes} onChange={e=>setCustomMinutes(e.target.value === '' ? '' : Number(e.target.value))}/></label>}<span className="cpu-muted">Mínimo 1 min · máximo 60 min. Se detiene y guarda automáticamente.</span></div>}
        {!recorder.running && !validDuration && <p className="cpu-error-text">Introduce una cantidad entera de 1 a 60 minutos.</p>}
        <div className="cpu-chart-toolbar"><span className={recorder.running ? 'cpu-recording-indicator' : 'cpu-muted'}>{recorder.running ? `● Grabando · ${recorder.sampleCount} muestras · faltan ${timeLabel(remainingSeconds)}` : recorder.result ? `Última grabación · ${recorder.result.sampleCount} muestras${recorder.result.recovered ? ' · recuperada' : ''}` : 'Sin grabación guardada'}</span><button className={`cpu-button ${recorder.running ? 'danger' : 'primary'}`} disabled={busy || (!recorder.running && !validDuration)} onClick={() => act(() => recorder.running ? api.stopCpuRecording() : api.startCpuRecording({ durationSeconds: recordingMinutes * 60 }))}>{recorder.running ? <Square size={14}/> : <Play size={14}/>} {recorder.running ? 'Detener y guardar' : 'Grabar sensores'}</button></div>
        {!recorder.running && recorder.result?.stopReason === 'duration' && <p className="cpu-positive">Tiempo completado. Grabación guardada automáticamente{Number.isFinite(recorder.result.elapsedSeconds) ? ` (${timeLabel(recorder.result.elapsedSeconds)})` : ''}.</p>}
        {recorder.error && <p className="cpu-error-text">{recorder.error}</p>}
        <div className="cpu-charts"><SensorChart label="Uso CPU" field="cpuUsage" unit="%" maximum={100} color="#84c8b0" rows={chartRows}/><SensorChart label="Frecuencia" field="cpuGHz" unit="GHz" color="#9fbaf1" rows={chartRows}/><SensorChart label="Temperatura" field="temperatureC" unit="°C" color="#ecb17f" rows={chartRows}/><SensorChart label="Potencia CPU" field="packagePowerW" unit="W" color="#c0a4e8" rows={chartRows}/></div>
        <p className="cpu-muted">{chartSource === 'live' ? 'Últimas 120 muestras en vivo.' : 'Vista resumida de hasta 180 puntos. El archivo conserva hasta 1800 muestras.'} Los sensores ausentes se muestran sin datos.</p>
      </section>

      <section className="cpu-section cpu-benchmark"><div className="cpu-section-header"><h2><Gauge size={17}/>Benchmark</h2><span className="cpu-muted">Prueba sintética</span></div><div className="cpu-benchmark-controls"><label>{benchmark.running || sweep.running ? 'Próxima duración (segundos)' : 'Duración (segundos)'}<IntegerDraftInput label="Duración del benchmark" value={benchSecondsDraft} invalid={!validBenchDuration} onChange={setBenchSecondsDraft}/></label><label>Modo<select aria-label="Modo del benchmark" value={benchMode} disabled={benchmark.running || sweep.running} onChange={e => setBenchMode(e.target.value)}><option value="single">Single thread · 1 hilo</option><option value="multi">Multihilo · todos ({threads})</option><option value="custom">Personalizado</option></select></label>{benchMode === 'custom' && <label>Hilos<input aria-label="Hilos del benchmark" type="number" min="1" max={threads} value={workers} disabled={benchmark.running || sweep.running} onChange={e => setWorkers(e.target.value === '' ? '' : Number(e.target.value))}/></label>}<button className="cpu-button primary" disabled={benchmark.running || sweep.running || !validWorkers || !validBenchDuration || busy} onClick={() => act(() => api.startCpuBenchmark({durationSeconds:benchSeconds,workerCount:selectedWorkers}))}><Play size={14}/>Iniciar benchmark</button>{benchmark.running && !sweep.running && <button className="cpu-button danger" onClick={() => act(() => api.stopCpuBenchmark())}><Square size={14}/>Detener</button>}</div>
        {!validBenchDuration && <p className="cpu-muted">Ingresa una duración de 10 a {BENCHMARK_MAX_SECONDS} segundos.</p>}{benchmark.running && <div className="cpu-progress" role="progressbar" aria-label="Progreso del benchmark" aria-valuenow={benchmark.progress || 0} aria-valuemin="0" aria-valuemax="100"><span style={{width:`${benchmark.progress || 0}%`}}/><strong>{benchmark.progress || 0}%</strong></div>}
        {benchmark.error && <p className="cpu-error-text">{benchmark.error}</p>}
        {benchmark.cancelled && <p className="cpu-muted">Prueba detenida. Las pruebas incompletas no se añaden al historial.</p>}
        {benchmark.result && <div className="cpu-bench-result"><strong>{number(benchmark.result.scoreMops,2)} <small>Mops/s</small></strong><span>{benchmark.result.workerCount} hilo(s) · {number(benchmark.result.durationSeconds)} s</span>{comparison && <span className={comparison.changePercent >= 0 ? 'cpu-positive' : 'cpu-error-text'}>{comparison.changePercent > 0 ? '+' : ''}{number(comparison.changePercent)}% frente a referencia</span>}<button className="cpu-button" onClick={() => setReferenceTo({...benchmark.result,cpu:cpuName})}>Usar como referencia</button></div>}
        {benchmark.result?.sensors && <div className="cpu-summary-grid">
          <div><span>Frecuencia media / pico</span><strong>{number(benchmark.result.averageCpuGHz, 2)} / {number(benchmark.result.sensors.maxPeakGHz, 2)} GHz</strong></div>
          <div><span>Temperatura media / máxima</span><strong>{number(benchmark.result.sensors.averageTemperatureC)} / {number(benchmark.result.sensors.maxTemperatureC)} °C</strong></div>
          <div><span>PPT medio</span><strong>{number(benchmark.result.sensors.averagePptW)} W</strong></div>
          <div><span>Potencia media del CPU</span><strong>{number(benchmark.result.sensors.averagePowerW)} W</strong></div>
        </div>}
        <p className="cpu-muted">El benchmark inicia una grabación de sensores si no hay otra activa. Esa grabación termina junto con la prueba; una grabación iniciada manualmente continúa. Windows distribuye los hilos; no se fija afinidad. La prueba no certifica estabilidad.</p>
      </section>

      <section className="cpu-section">
        <div className="cpu-section-header"><h2>Optimización automática de CPU</h2></div>
        <p className="cpu-muted">Analiza los sensores y mide tu perfil actual. Luego prueba cambios de Curve Optimizer, PPT, TDC, EDC y boost. Cada etapa parte del mejor resultado medido para el objetivo elegido.</p>
        <p className="cpu-muted">Compatible con Ryzen 5 9600X y firmware reconocido. La curva cambia en pasos de 5 por núcleo y la prueba mantiene los límites de potencia y corriente en el nivel inicial o por debajo.</p>
        <button className="cpu-button" disabled={!api?.analyzeCpuSweep || !tuningReady || busy || benchmark.running || sweep.running} onClick={() => act(async () => {
          setSweepAnalysis(null);
          setSweepAnalysis(await api.analyzeCpuSweep());
        })}><Activity size={14}/>Analizar CPU</button>
        {sweepAnalysis && <p className={analysisReady ? 'cpu-muted' : 'cpu-error-text'} role="status">
          {analysisReady ? `${sweepAnalysis.cpu} · ${sweepAnalysis.configuration.limits.ppt} W PPT · ${sweepAnalysis.configuration.limits.tdc} A TDC · ${sweepAnalysis.configuration.limits.edc} A EDC · ${number(sweepAnalysis.temperatureC)} °C en el análisis · límite de prueba ${sweepAnalysis.ceiling} °C`
            : 'La configuración o la conexión cambió. Vuelve a pulsar Analizar CPU.'}
        </p>}
        <div className="cpu-benchmark-controls">
          <label>Objetivo<select value={sweep.running ? sweep.objective : sweepObjective} disabled={sweep.running} onChange={event => setSweepObjective(event.target.value)}>
            <option value="balanced">Equilibrado</option><option value="performance">Máximo rendimiento</option>
          </select></label>
          <label>Aumento máximo<select value={sweep.running ? sweep.maxBoostMHz : selectedSweepBoost} disabled={sweep.running || !analysisReady} onChange={event => setSweepMaxBoost(Number(event.target.value))}>
            {BOOST_STEPS.filter(step => step <= (sweep.running ? sweep.maxBoostMHz : sweepAnalysis?.boostLimit ?? availableSweepBoost ?? 0)).map(step => <option key={step} value={step}>{step ? `+${step} MHz` : 'Conservar boost'}</option>)}
          </select></label>
          <button className="cpu-button primary" disabled={!api?.startCpuSweep || !analysisReady || busy || benchmark.running || sweep.running || !validWorkers || !validBenchDuration} onClick={startSweep}><Play size={14}/>Buscar mejor perfil</button>
          {sweep.running && <button className="cpu-button danger" disabled={busy} onClick={() => act(async () => setSweep(await api.stopCpuSweep()))}><Square size={14}/>Detener y restaurar</button>}
        </div>
        {analysisReady && validBenchDuration && <p className="cpu-muted">{benchSeconds} s por perfil, hasta {9 + selectedSweepBoost / 25} pruebas, más el tiempo de enfriamiento.</p>}
        {sweep.running && <p role="status">{sweep.phase} · prueba {Math.max(1, sweep.current)} de hasta {sweep.total} · {sweep.profile || 'Configuración inicial'} · límite {sweep.ceiling} °C</p>}
        {sweep.error && <p className="cpu-error-text" role="alert">Ronda detenida. {sweep.error}</p>}
        {sweep.restoreError && <p className="cpu-error-text" role="alert">No se confirmó la restauración. {sweep.restoreError} Revisa la configuración activa antes de seguir.</p>}
        {sweep.historyError && <p className="cpu-error-text" role="alert">{sweep.historyError}</p>}
        {!sweep.running && sweep.restored && <p className="cpu-muted" role="status">{sweep.cancelled ? 'Ronda cancelada. ' : ''}Configuración inicial restaurada y verificada.</p>}
        {!sweep.running && sweep.restored && !sweep.cancelled && !sweep.error && preferredSweepProfile && <div className="cpu-bench-result">
          <span>Mejor perfil medido · {sweep.objective === 'performance' ? 'Máximo rendimiento' : 'Equilibrado'} · {preferredSweepProfile.label}</span>
          <strong>{number(preferredSweepProfile.scoreMops, 2)} <small>Mops/s</small></strong>
          <button className="cpu-button" disabled={busy || benchmark.running} onClick={() => prepareGameProfile('Perfil optimizado', preferredSweepProfile)}>Cargar recomendación</button>
        </div>}
        {!!sweep.results.length && <div className="cpu-table-scroll"><table className="cpu-history">
          <thead><tr><th>Perfil</th><th>CO por núcleo</th><th>Boost</th><th>GHz medios / pico</th><th>Temperatura media / máx.</th><th>PPT límite / medio</th><th>TDC / EDC</th><th>Rendimiento</th><th></th></tr></thead>
          <tbody>{sweep.results.map(row => {
            const change = sweepBaseline.scoreMops > 0 ? (row.scoreMops / sweepBaseline.scoreMops - 1) * 100 : null;
            const games = [sweepBest?.performance[0]?.id === row.id ? 'Máximo rendimiento' : '', sweepBest?.balanced[0]?.id === row.id ? 'Equilibrado' : ''].filter(Boolean);
            return <tr key={row.id}><td>{row.label}{!sweep.running && games.length > 0 && <small> · {games.join(' / ')}</small>}</td><td>{row.configuration.curveOptimizer.join(' / ')}</td><td>{row.configuration.fmaxMHz} MHz</td><td>{number(row.averageCpuGHz, 2)} / {number(row.sensors.maxPeakGHz, 2)}</td><td>{number(row.sensors.averageTemperatureC)} / {number(row.sensors.maxTemperatureC)} °C</td><td>{row.configuration.limits.ppt} / {number(row.sensors.averagePptW)} W</td><td>{row.configuration.limits.tdc} / {row.configuration.limits.edc} A</td><td>{number(row.scoreMops, 2)} Mops/s · {change > 0 ? '+' : ''}{number(change)}%</td><td><button className="cpu-link" disabled={sweep.running || busy} onClick={() => prepareGameProfile(`Prueba · ${row.label}`, row)}>Cargar</button></td></tr>;
          })}</tbody>
        </table></div>}
      </section>

      <section className="cpu-section">
        <div className="cpu-section-header"><h2>Perfiles recomendados</h2></div>
        <p className="cpu-muted">Aplica un perfil y repite el benchmark con los mismos hilos y duración. Equilibrado compara perfiles que quedan dentro del 3% de la mejor puntuación.</p>
        <div className="cpu-profile-list">
          {[['Máximo rendimiento', 'Prioriza la mejor puntuación medida.', gameProfiles.performance], ['Equilibrado', 'Prioriza una temperatura máxima más baja manteniendo el rendimiento.', gameProfiles.balanced]].map(([game, description, results]) => <article key={game}>
            <div><strong>{game}</strong><p>{description}</p>
              {results.map(row => <p key={row.id}>{row.configuration.limits.ppt} W de límite PPT · {number(row.sensors.averagePeakGHz, 2)} GHz de pico medio · {number(row.sensors.maxTemperatureC)} °C máx. · {number(row.scoreMops)} Mops/s <button className="cpu-link" disabled={busy || benchmark.running} onClick={() => prepareGameProfile(game, row)}>Cargar medido</button></p>)}
              {!results.length && <small>Faltan mediciones con sensores conectados para estos hilos y duración.</small>}
            </div>
            <button className="cpu-button" disabled={!actual || busy || benchmark.running || sweep.running} onClick={() => prepareGameProfile(game)}>Preparar prueba</button>
          </article>)}
        </div>
      </section>

      <section className="cpu-section"><div className="cpu-section-header"><h2>Historial de benchmarks</h2><select aria-label="Filtrar historial" value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}><option value="all">Todas las pruebas</option><option value="single">Single thread</option><option value="multi">Multihilo</option></select></div>
        {reference && <div className="cpu-reference"><span>Referencia: {number(reference.scoreMops,2)} Mops/s · {reference.workerCount} hilo(s)</span><button className="cpu-link" onClick={() => { try { localStorage.removeItem(REFERENCE_KEY); setReference(null); } catch { setError('No se pudo quitar la referencia.'); } }}>Quitar referencia</button></div>}
        {!filteredHistory.length ? <p className="cpu-empty">Los resultados completos aparecerán aquí automáticamente. Se conservan las últimas 100 pruebas.</p> : <div className="cpu-table-scroll"><table className="cpu-history"><thead><tr><th>Fecha</th><th>Hilos</th><th>Duración</th><th>Puntuación</th><th>Frente a referencia</th><th>Acciones</th></tr></thead><tbody>{filteredHistory.map(row => { const change=compareCpuBenchmarks(reference,row); return <tr key={row.id} className={reference?.id === row.id ? 'is-reference' : ''}><td>{date(row.completedAt)}</td><td>{row.workerCount}</td><td>{number(row.durationSeconds)} s</td><td><strong>{number(row.scoreMops,2)}</strong> Mops/s</td><td>{change ? `${change.changePercent > 0 ? '+' : ''}${number(change.changePercent)}%` : '— · no comparable'}</td><td><button className="cpu-link" onClick={() => setReferenceTo(row)}>Comparar</button><button className="cpu-icon-button" aria-label={`Eliminar benchmark ${date(row.completedAt)}`} disabled={busy} onClick={() => { if (window.confirm('¿Eliminar esta medición del historial?')) void act(async()=> {setLibrary(await api.deleteCpuBenchmark(row.id));}); }}><Trash2 size={14}/></button></td></tr>; })}</tbody></table></div>}
      </section>
    </> : <>
      <div className="cpu-tuning-intro"><SlidersHorizontal size={18}/><div><strong>Tuning directo del procesador</strong><p>Ajusta PBO y Curve Optimizer desde VORTEX. Cada cambio se verifica con el firmware. Los perfiles se aplican al pulsar Aplicar.</p></div><span>{tuningReady ? 'AJUSTES DISPONIBLES' : 'FALTA CONECTAR CPU'}</span></div>
      {!advice.canConfigurePbo ? <div className="cpu-message error">Los perfiles de esta versión están preparados para Ryzen 5 9600X. El dashboard sigue disponible para consultar las lecturas de tu equipo.</div> : <>
        <details className="cpu-section" open><summary><ChevronDown size={17}/><h2>PBO</h2><span>Límites y boost</span></summary><div className="cpu-tuning-grid">
          <label className="cpu-tuning-row"><span>PPT</span><IntegerDraftInput label="PPT" value={limits.ppt} invalid={!(profile.limits.ppt >= 10 && profile.limits.ppt <= NATIVE_LIMITS.ppt)} onChange={value => { pptRevision.current++; setLimits(previous => ({ ...previous, ppt: value })); }}/><span className="cpu-unit">W</span></label><NumericRow label="TDC" unit="A" value={limits.tdc} min={1} max={NATIVE_LIMITS.tdc} onChange={v=>setLimits({...limits,tdc:v})}/><NumericRow label="EDC" unit="A" value={limits.edc} min={1} max={NATIVE_LIMITS.edc} onChange={v=>setLimits({...limits,edc:v})}/><label className="cpu-tuning-row"><span>Aumento de boost</span><select aria-label="Aumento de boost" value={boostOverrideMHz ?? 'keep'} disabled={!actual} onChange={event => setBoostOverride(event.target.value === 'keep' ? null : Number(event.target.value))}><option value="keep">Conservar {number(boostReferenceMHz, 0)} MHz</option>{BOOST_STEPS.map(step => <option key={step} value={step}>{step === 0 ? '0 MHz (referencia de fábrica)' : `+${step} MHz`}</option>)}</select><span className="cpu-unit">MHz</span></label><NumericRow label="PBO Scalar" unit="X" value={scalar} min={1} max={10} onChange={setScalar}/>
        </div><p className="cpu-muted">Boost activo {number(actual?.fmaxMHz, 0)} MHz{Number.isFinite(activeBoostOffset) && ` (${activeBoostOffset > 0 ? '+' : ''}${activeBoostOffset} MHz)`} · Objetivo {number(fmaxMHz, 0)} MHz · Referencia {RYZEN_9600X_BOOST_ZERO_MHZ} MHz. Pulsa Aplicar para enviar el objetivo al procesador. La frecuencia real depende de la carga y la temperatura.</p></details>
        <details className="cpu-section" open><summary><ChevronDown size={17}/><h2>Curve Optimizer</h2><span>Pasos · no milivoltios</span></summary><div className="cpu-curve-mode"><span>Mode</span><div className="cpu-segments" aria-label="Modo Curve Optimizer">{[['off','OFF'],['all','All Cores'],['per-core','Per Core']].map(([id,label])=><button key={id} aria-pressed={curveMode===id} onClick={()=>changeCurveMode(id)}>{label}</button>)}</div></div>
          {curveMode==='all' && <div className="cpu-tuning-grid"><NumericRow label="Todos los núcleos" value={allCurve} unit="pasos" min={-30} max={10} onChange={setAllCurve}/></div>}
          {curveMode==='per-core' && <div className="cpu-core-grid">{curve.map((value,i)=><NumericRow key={i} label={`Núcleo ${i}`} value={value} unit="pasos" min={-30} max={10} onChange={next=>setCurve(current=>current.map((v,index)=>i===index?next:v))}/>)}</div>}
          <p className="cpu-muted">Negativo: reduce la curva. Positivo: la aumenta. −30 es editable, no una recomendación universal. Con OFF, el perfil guarda cero en todos los núcleos.</p>
        </details>
        {!validation.valid && <div className="cpu-message error" role="alert">{validation.errors.join(' ')}</div>}
        {nativeError && <p className="cpu-muted">Para aplicar: {nativeError}</p>}
        <div className="cpu-tuning-actions"><button className="cpu-button primary" disabled={!tuningReady || !actual || !validation.valid || !!nativeError || busy || benchmark.running || sweep.running} onClick={applyTuning}><Check size={14}/>{busy ? 'Procesando…' : 'Aplicar al procesador'}</button><button className="cpu-button" disabled={!tuningReady || !actual?.canUndo || busy || benchmark.running || sweep.running} onClick={()=>act(async()=>{const revision=pptRevision.current;const result=await api.undoCpuTuning(actual.fingerprint);useHardwareValues(result.after,pptRevision.current!==revision);setLive(previous=>({...previous,tuning:{...result.after,canUndo:false}}));},'Configuración anterior restaurada y verificada. Durante esta sesión se conserva el último ajuste anterior.')}><RefreshCw size={14}/>Deshacer último cambio</button><button className="cpu-button" disabled={!validation.valid || busy} onClick={()=>act(copyProfile,'Configuración copiada.')}><ClipboardCopy size={14}/>Copiar</button></div>
        <section className="cpu-section"><div className="cpu-section-header"><h2><Save size={17}/>Perfiles con nombre</h2><span className="cpu-muted">{library.profiles.length} / 30 guardados</span></div><div className="cpu-profile-save"><label>Nombre del perfil<input aria-label="Nombre del perfil CPU" maxLength={60} value={profileName} placeholder="Ej. Diario equilibrado" onChange={e=>setProfileName(e.target.value)}/></label><button className="cpu-button primary" disabled={busy || !validation.valid || !profileName.trim()} onClick={saveProfile}><Save size={14}/>{library.profiles.some(p=>p.name.toLowerCase()===profileName.trim().toLowerCase()&&p.cpu===cpuName)?'Actualizar perfil':'Guardar perfil'}</button></div>
          <div className="cpu-presets">{RYZEN_5_9600X_PROFILES.map(p=><button className="cpu-button" key={p.id} onClick={()=>{pptRevision.current++;setLimits({ppt:p.ppt,tdc:p.tdc,edc:p.edc});setNotice(`Límites ${p.name} cargados. Curve Optimizer se conserva.`);}}><RefreshCw size={13}/>{p.name}</button>)}</div>
          {!library.profiles.length && <p className="cpu-empty">Guarda tu primer perfil. Incluirá PBO, FMax, Scalar y Curve Optimizer.</p>}
          <div className="cpu-profile-list">{library.profiles.map(p=><article key={p.id}><div><strong>{p.name}</strong><p>{p.limits.ppt} W · {p.limits.tdc} A · {p.limits.edc} A · CO {p.curveMode}</p><small>{p.cpu} · {date(p.savedAt)}</small></div><button className="cpu-button" disabled={p.cpu!==cpuName||p.coreCount!==coreCount} onClick={()=>loadProfile(p)}>Cargar</button><button className="cpu-icon-button" aria-label={`Eliminar perfil ${p.name}`} disabled={busy} onClick={()=>{if(window.confirm(`¿Eliminar el perfil «${p.name}»?`))void act(async()=>setLibrary(await api.deleteCpuProfile(p.id)));}}><Trash2 size={15}/></button></article>)}</div>
        </section>
      </>}
    </>}
  </div>;
}
