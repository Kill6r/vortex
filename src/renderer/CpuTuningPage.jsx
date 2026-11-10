import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ClipboardCopy, Cpu, ExternalLink, Gauge, Info, Play, RefreshCw, Save, ShieldAlert, Square, Thermometer, Upload, Zap } from 'lucide-react';
import { compareCpuBenchmarks, cpuTuningAdvice, parseCpuSensorCsv, RYZEN_5_9600X_PROFILES, RYZEN_5_9600X_STOCK_LIMITS, validatePboLimits } from '../core/cpu-tuning.js';

const STORAGE_KEY = 'vortex.cpu.pbo.9600x.v2';
const REFERENCE_KEY = 'vortex.cpu.benchmark.reference.v1';
const initialLimits = { ppt: 75, tdc: 65, edc: 130 };

function number(value, digits = 1) {
  return Number.isFinite(value) ? value.toLocaleString('es-CO', { maximumFractionDigits: digits }) : '—';
}

function Metric({ label, value, unit, hint }) {
  return <div className="v92-cpu-metric"><span>{label}</span><strong>{value === null || value === undefined ? '—' : `${number(value)} ${unit}`}</strong>{hint && <small>{hint}</small>}</div>;
}

export default function CpuTuningPage({ api }) {
  const [cpuName, setCpuName] = useState('');
  const [limits, setLimits] = useState(initialLimits);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [benchmark, setBenchmark] = useState({ running: false, progress: 0, result: null });
  const [reference, setReference] = useState(null);
  const [sensorLog, setSensorLog] = useState(null);
  const [sensorError, setSensorError] = useState('');
  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState('');
  const fileRef = useRef(null);
  const runningRef = useRef(false);
  const advice = cpuTuningAdvice(cpuName);
  const validation = useMemo(() => validatePboLimits(limits), [limits]);
  const comparison = useMemo(() => compareCpuBenchmarks(reference, benchmark.result), [reference, benchmark.result]);

  useEffect(() => {
    let active = true;
    api?.overview?.().then(data => { if (active) setCpuName(data?.cpu || ''); }).catch(() => {});
    try {
      const profile = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (profile?.limits) setLimits({ ppt: Number(profile.limits.ppt), tdc: Number(profile.limits.tdc), edc: Number(profile.limits.edc) });
      const savedReference = JSON.parse(localStorage.getItem(REFERENCE_KEY) || 'null');
      if (savedReference?.scoreMops) setReference(savedReference);
    } catch {}
    const unsubscribe = api?.onCpuBenchmarkStatus?.(status => {
      if (!active) return;
      setBenchmark(status);
      runningRef.current = status.running === true;
    });
    api?.cpuBenchmarkStatus?.().then(status => {
      if (active && status) {
        setBenchmark(status);
        runningRef.current = status.running === true;
      }
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
      if (runningRef.current) api?.stopCpuBenchmark?.().catch(() => {});
    };
  }, [api]);

  useEffect(() => {
    if (!advice.candidate || !api?.liveMetrics) return;
    let active = true;
    let pending = false;
    const sample = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await api.liveMetrics();
        if (active) { setLive(data); setLiveError(''); }
      } catch (e) { if (active) setLiveError(e.message || 'No se pudieron leer las métricas.'); }
      finally { pending = false; }
    };
    void sample();
    const timer = window.setInterval(sample, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, advice.candidate]);

  function selectProfile(profile) {
    setLimits({ ppt: profile.ppt, tdc: profile.tdc, edc: profile.edc });
    setSaved(false);
    setNotice(`Perfil ${profile.name} cargado. Todavia no se ha aplicado al procesador.`);
    setError('');
  }

  function updateLimit(key, value) {
    setLimits(current => ({ ...current, [key]: value === '' ? '' : Number(value) }));
    setSaved(false);
    setNotice('');
  }

  function saveProfile() {
    if (!validation.valid) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cpu: 'Ryzen 5 9600X', limits: validation.values, savedAt: new Date().toISOString() }));
    setSaved(true);
    setNotice('Perfil guardado en VORTEX. Abre Ryzen Master para introducir y aplicar estos limites.');
    setError('');
  }

  async function openRyzenMaster() {
    setError('');
    try { await api?.openRyzenMaster?.(); }
    catch (e) { setError(e.message || 'No se pudo abrir Ryzen Master.'); }
  }

  async function copyLimits() {
    if (!validation.valid) return;
    const text = `Ryzen 5 9600X\nPPT: ${validation.values.ppt} W\nTDC: ${validation.values.tdc} A\nEDC: ${validation.values.edc} A`;
    try { await api?.copyText?.(text); setNotice('Valores copiados. Puedes pegarlos como referencia en Ryzen Master o en la BIOS.'); }
    catch (e) { setError(e.message || 'No se pudieron copiar los valores.'); }
  }

  async function openMonitoringSdk() {
    try { await api?.openExternalUrl?.('amd-ryzen-monitoring-sdk'); }
    catch (e) { setError(e.message || 'No se pudo abrir la pagina del SDK de AMD.'); }
  }

  async function startBenchmark() {
    if (benchmark.running || !api?.startCpuBenchmark) return;
    setError('');
    setNotice('La prueba utiliza varios hilos durante 20 segundos. Vigila la temperatura en Ryzen Master.');
    try {
      await api.startCpuBenchmark({ durationSeconds: 20, workerCount: 6 });
      const status = await api.cpuBenchmarkStatus?.();
      if (status) setBenchmark(status);
    } catch (e) { setError(e.message || 'No se pudo iniciar la prueba de CPU.'); }
  }

  async function stopBenchmark() {
    try { await api?.stopCpuBenchmark?.(); }
    catch (e) { setError(e.message || 'No se pudo detener la prueba.'); }
  }

  function saveReference() {
    const result = benchmark.result;
    if (!result?.scoreMops) return;
    localStorage.setItem(REFERENCE_KEY, JSON.stringify(result));
    setReference(result);
    setNotice('Medicion guardada como referencia. Aplica el perfil desde Ryzen Master y repite el benchmark para comparar.');
  }

  function clearReference() {
    localStorage.removeItem(REFERENCE_KEY);
    setReference(null);
    setNotice('Se elimino la medicion de referencia.');
  }

  async function importSensorLog(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSensorError('');
    try {
      const parsed = parseCpuSensorCsv(await file.text());
      if (!parsed.valid) {
        setSensorLog(null);
        setSensorError(parsed.error);
      } else {
        setSensorLog({ ...parsed, fileName: file.name });
      }
    } catch (e) { setSensorError(e.message || 'No se pudo leer el registro.'); }
    event.target.value = '';
  }

  const supported = advice.canConfigurePbo;

  return <div className="v92-cpu-wrap">
    <div className="v91-cpu-heading">
      <div className="v91-cpu-title"><Cpu size={20}/><h2>CPU, consumo y overclock</h2></div>
      <span className="v92-cpu-badge">AMD Ryzen</span>
    </div>

    <div className="v92-cpu-intro">
      <div className="v92-cpu-intro-icon"><Zap size={19}/></div>
      <div><strong>{advice.name}</strong><p>{advice.note}</p></div>
      <button type="button" className="btn btn-dark" onClick={openRyzenMaster} disabled={!advice.external}><ExternalLink size={15}/> Abrir Ryzen Master</button>
    </div>

    {advice.candidate && <div className="v92-cpu-live" role="status"><strong>Lectura en vivo</strong><span>Uso CPU: {Number.isFinite(live?.cpuUsage) ? `${number(live.cpuUsage)} %` : '—'}</span><span>Frecuencia: {Number.isFinite(live?.cpuGHz) ? `${number(live.cpuGHz)} GHz` : '—'}</span><small>Actualiza cada 2 segundos. Estas métricas no bastan para elegir un overclock estable.</small>{liveError && <small>{liveError}</small>}</div>}

    {!supported ? <div className="v91-cpu-warning"><ShieldAlert size={17}/><span>Los perfiles PPT/TDC/EDC de esta version estan preparados para el Ryzen 5 9600X. En otros Ryzen puedes abrir Ryzen Master, pero VORTEX no sugerira limites que no haya validado para ese modelo.</span></div> : <>
      <div className="v92-cpu-section-head"><div><h3>Limites de potencia PBO</h3><p>Selecciona un punto de partida, ajusta los valores y guardalos en VORTEX.</p></div><span className="v92-cpu-state">Pendiente de aplicar</span></div>
      <div className="v92-cpu-limit-grid">
        <div className="v92-cpu-limit-card"><span>PPT</span><strong>{limits.ppt || '—'} <small>W</small></strong><p>Potencia total permitida al socket del procesador.</p><input aria-label="Limite PPT en vatios" type="number" min="1" max={RYZEN_5_9600X_STOCK_LIMITS.ppt} step="1" value={limits.ppt} onChange={event => updateLimit('ppt', event.target.value)}/><small>Referencia: {RYZEN_5_9600X_STOCK_LIMITS.ppt} W</small></div>
        <div className="v92-cpu-limit-card"><span>TDC</span><strong>{limits.tdc || '—'} <small>A</small></strong><p>Limite de corriente sostenida bajo carga termica.</p><input aria-label="Limite TDC en amperios" type="number" min="1" max={RYZEN_5_9600X_STOCK_LIMITS.tdc} step="1" value={limits.tdc} onChange={event => updateLimit('tdc', event.target.value)}/><small>Referencia: {RYZEN_5_9600X_STOCK_LIMITS.tdc} A</small></div>
        <div className="v92-cpu-limit-card"><span>EDC</span><strong>{limits.edc || '—'} <small>A</small></strong><p>Limite de corriente maxima en picos cortos.</p><input aria-label="Limite EDC en amperios" type="number" min="1" max={RYZEN_5_9600X_STOCK_LIMITS.edc} step="1" value={limits.edc} onChange={event => updateLimit('edc', event.target.value)}/><small>Referencia: {RYZEN_5_9600X_STOCK_LIMITS.edc} A</small></div>
      </div>
      <div className="v92-cpu-profiles">
        <div className="v92-cpu-section-head"><div><h3>Perfiles de prueba</h3><p>Son objetivos experimentales mas bajos que la referencia, no presets oficiales de AMD.</p></div></div>
        <div className="v92-cpu-profile-grid">
          {RYZEN_5_9600X_PROFILES.map(profile => <button key={profile.id} type="button" className={`v92-cpu-profile ${limits.ppt === profile.ppt && limits.tdc === profile.tdc && limits.edc === profile.edc ? 'selected' : ''}`} onClick={() => selectProfile(profile)}><span>{profile.name}</span><strong>{profile.ppt} W <small>·</small> {profile.tdc} A <small>·</small> {profile.edc} A</strong><p>{profile.description}</p></button>)}
        </div>
      </div>
      <div className="v92-cpu-actions">
        <button type="button" className="btn btn-dark" onClick={() => selectProfile(RYZEN_5_9600X_PROFILES[0])}><RefreshCw size={15}/> Restaurar referencia</button>
        <button type="button" className="btn btn-dark" disabled={!validation.valid} onClick={copyLimits}><ClipboardCopy size={15}/> Copiar valores</button>
        <button type="button" className="btn btn-dark" disabled={!validation.valid} onClick={saveProfile}><Save size={15}/> {saved ? 'Perfil guardado' : 'Guardar perfil'}</button>
        <button type="button" className="btn btn-lime" onClick={openRyzenMaster}><ExternalLink size={15}/> Abrir para aplicar</button>
      </div>
      {!validation.valid && <div className="v92-cpu-error"><AlertTriangle size={15}/><div>{validation.errors.map(item => <span key={item}>{item}</span>)}</div></div>}
      {notice && <div className="v92-cpu-notice"><Info size={15}/>{notice}</div>}
      <div className="v92-cpu-warning"><ShieldAlert size={17}/><span><strong>VORTEX no aplica estos limites directamente.</strong> Ryzen Master y la BIOS son quienes escriben PBO. En Ryzen Master usa un modo PBO/AMD Spec compatible, introduce PPT/TDC/EDC y revisa la confirmacion antes de aplicar. Los valores reales pueden variar por placa y BIOS.</span></div>

      <div className="v92-cpu-test-grid">
        <div className="v92-cpu-test-card">
          <div className="v92-cpu-section-head"><div><h3>Comparar rendimiento</h3><p>Benchmark sintetico de 20 segundos con 6 hilos para comparar el mismo PC antes y despues.</p></div><Gauge size={19}/></div>
          <div className="v92-cpu-test-actions">
            <button type="button" className="btn btn-lime" disabled={benchmark.running} onClick={startBenchmark}>{benchmark.running ? <RefreshCw size={15} className="rotate"/> : <Play size={15}/>} {benchmark.running ? 'Probando...' : 'Iniciar benchmark'}</button>
            {benchmark.running && <button type="button" className="btn btn-dark" onClick={stopBenchmark}><Square size={14}/> Detener</button>}
            {benchmark.result && !benchmark.running && <button type="button" className="btn btn-dark" onClick={saveReference}><Save size={14}/> Guardar como referencia</button>}
          </div>
          {benchmark.running && <div className="v92-cpu-progress"><div><span>Prueba en curso</span><strong>{benchmark.progress || 0}%</strong></div><div className="v92-cpu-progress-track"><span style={{ width: `${benchmark.progress || 0}%` }}/></div><small>Uso CPU: {benchmark.cpuUsage === null || benchmark.cpuUsage === undefined ? '—' : `${number(benchmark.cpuUsage)}%`} · Frecuencia: {benchmark.cpuGHz ? `${number(benchmark.cpuGHz)} GHz` : '—'}</small></div>}
          {benchmark.result && <div className="v92-cpu-benchmark-result"><Metric label="Puntuacion" value={benchmark.result.scoreMops} unit="Mops/s"/><Metric label="Uso promedio" value={benchmark.result.averageCpuUsage} unit="%"/><Metric label="Frecuencia media" value={benchmark.result.averageCpuGHz} unit="GHz"/></div>}
          {comparison && <div className={`v92-cpu-comparison ${comparison.changePercent >= 0 ? 'positive' : 'negative'}`}><Activity size={16}/><strong>{comparison.changePercent > 0 ? '+' : ''}{number(comparison.changePercent)}%</strong><span>frente a la referencia guardada</span></div>}
          {reference && <div className="v92-cpu-reference"><span>Referencia guardada: {number(reference.scoreMops, 2)} Mops/s</span><button type="button" onClick={clearReference}>Borrar referencia</button></div>}
          {benchmark.error && <div className="v92-cpu-error"><AlertTriangle size={15}/>{benchmark.error}</div>}
          <div className="v92-cpu-footnote">Este benchmark compara rendimiento bajo una carga sintetica. <strong>No certifica estabilidad, no mide PPT/TDC/EDC ni sustituye OCCT o el test de Ryzen Master.</strong></div>
        </div>

        <div className="v92-cpu-test-card">
          <div className="v92-cpu-section-head"><div><h3>Registro de sensores</h3><p>Importa un CSV de HWiNFO o AMD Ryzen Master Monitoring SDK para analizar consumo y temperatura.</p></div><Thermometer size={19}/></div>
          <input ref={fileRef} className="v92-cpu-file-input" type="file" accept=".csv,text/csv" onChange={importSensorLog}/>
          <button type="button" className="btn btn-dark" onClick={() => fileRef.current?.click()}><Upload size={15}/> Importar registro CSV</button>
          {sensorError && <div className="v92-cpu-error"><AlertTriangle size={15}/>{sensorError}</div>}
          {sensorLog && <>
            <div className="v92-cpu-log-name"><CheckCircle2 size={14}/>{sensorLog.fileName} · {sensorLog.sampleCount} muestras</div>
            <div className="v92-cpu-sensor-grid">
              <Metric label="PPT promedio / pico" value={sensorLog.pptW.average} unit="W" hint={`Pico ${number(sensorLog.pptW.maximum)} W`}/>
              <Metric label="TDC promedio / pico" value={sensorLog.tdcA.average} unit="A" hint={`Pico ${number(sensorLog.tdcA.maximum)} A`}/>
              <Metric label="EDC promedio / pico" value={sensorLog.edcA.average} unit="A" hint={`Pico ${number(sensorLog.edcA.maximum)} A`}/>
              <Metric label="Temperatura promedio" value={sensorLog.temperatureC.average} unit="°C" hint={`Maxima ${number(sensorLog.temperatureC.maximum)} °C`}/>
              <Metric label="Potencia CPU promedio" value={sensorLog.packagePowerW.average} unit="W" hint={`Pico ${number(sensorLog.packagePowerW.maximum)} W`}/>
            </div>
          </>}
          <div className="v92-cpu-footnote">El SDK de monitorizacion de AMD es de solo lectura. VORTEX no incluye sus archivos propietarios; se instala y acepta su licencia por separado.</div>
          <button type="button" className="v92-cpu-link" onClick={openMonitoringSdk}>Consultar AMD Ryzen Master Monitoring SDK <ExternalLink size={13}/></button>
        </div>
      </div>

      <div className="v92-cpu-steps">
        <div><span>1</span><p><strong>Medir stock.</strong> Ejecuta el benchmark y guarda el resultado como referencia.</p></div>
        <div><span>2</span><p><strong>Probar limites menores.</strong> Guarda un perfil, abre Ryzen Master y aplica PPT/TDC/EDC manualmente.</p></div>
        <div><span>3</span><p><strong>Validar.</strong> Repite el benchmark y usa Apply & Test de Ryzen Master u OCCT para estabilidad. Compara tambien los registros CSV.</p></div>
      </div>
    </>}
    {error && <div className="v92-cpu-error"><AlertTriangle size={15}/>{error}</div>}
    <div className="v92-cpu-next"><Activity size={17}/><p>El Ryzen 5 9600X tiene TDP de 65 W y un limite termico maximo especificado de 95 °C. Deten cualquier prueba si aparecen errores, reinicios, apagados o temperaturas anormales; no cambies voltajes manualmente para compensar un limite de potencia.</p></div>
  </div>;
}
