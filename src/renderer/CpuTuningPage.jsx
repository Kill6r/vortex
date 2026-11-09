import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Cpu, ExternalLink, Gauge, RefreshCw, ShieldAlert } from 'lucide-react';
import { cpuBaselineSummary, cpuTuningAdvice } from '../core/cpu-tuning.js';

export default function CpuTuningPage({ api }) {
  const [cpuName, setCpuName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [baseline, setBaseline] = useState(null);
  const [error, setError] = useState('');
  const tokenRef = useRef(0);
  const advice = cpuTuningAdvice(cpuName);

  useEffect(() => {
    let active = true;
    api?.overview?.().then(data => { if (active) setCpuName(data?.cpu || ''); }).catch(() => {});
    return () => { active = false; tokenRef.current++; };
  }, []);

  async function sampleCpu() {
    if (!api?.liveMetrics || loading) return;
    const token = ++tokenRef.current;
    setLoading(true);
    setProgress(0);
    setError('');
    setBaseline(null);
    const samples = [];
    try {
      for (let index = 0; index < 10; index++) {
        if (tokenRef.current !== token) return;
        const row = await api.liveMetrics();
        samples.push(row);
        setProgress((index + 1) * 10);
        if (index < 9) await new Promise(resolve => setTimeout(resolve, 1100));
      }
      if (tokenRef.current === token) setBaseline(cpuBaselineSummary(samples));
    } catch (e) {
      if (tokenRef.current === token) setError(e.message || 'No se pudo leer la CPU.');
    } finally {
      if (tokenRef.current === token) setLoading(false);
    }
  }

  return <div className="v91-cpu-wrap">
    <div className="v91-cpu-heading"><div className="v91-cpu-title"><Cpu size={20}/><h2>CPU y overclock</h2></div><span className="v91-cpu-label">Controlado por el fabricante</span></div>
    <div className="v91-cpu-layout">
      <div className="v91-cpu-card">
        <h3>Compatibilidad y rendimiento</h3>
        <strong className="v91-cpu-model">{advice.name}</strong>
        <p>{advice.note}</p>
        <div className="v91-cpu-warning"><ShieldAlert size={17}/><span>Una lectura de CPU no equivale a una prueba de estabilidad. VORTEX no puede medir la temperatura de forma fiable en todos los equipos.</span></div>
        {advice.external ? <button type="button" className="btn btn-dark" onClick={() => api?.openRyzenMaster?.().catch(e => setError(e.message || 'No se pudo abrir Ryzen Master.'))}><ExternalLink size={15}/> Abrir Ryzen Master o descargar</button> : <span className="v91-cpu-unsupported">No se dispone de overclock automatico desde VORTEX.</span>}
      </div>
      <div className="v91-cpu-card">
        <h3>Lectura de referencia</h3>
        <p>Consulta el uso y la frecuencia actual durante 10 muestras. No fuerza la CPU ni modifica el sistema.</p>
        <button type="button" className="btn btn-dark" disabled={loading || !api?.liveMetrics} onClick={sampleCpu}>{loading ? <RefreshCw size={15} className="rotate"/> : <Gauge size={15}/>} {loading ? 'Midiendo...' : 'Medir CPU durante 10 s'}</button>
        {loading && <div className="v91-cpu-progress" role="progressbar" aria-label="Progreso de lectura de CPU" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }}/></div>}
        {baseline && <div className="v91-cpu-results"><div><span>Uso promedio</span><strong>{baseline.averageUsage === null ? 'No disponible' : `${baseline.averageUsage}%`}</strong></div><div><span>Frecuencia promedio</span><strong>{baseline.averageGhz === null ? 'No disponible' : `${baseline.averageGhz.toLocaleString('es-CO')} GHz`}</strong></div><div><span>Pico de uso</span><strong>{baseline.peakUsage === null ? 'No disponible' : `${baseline.peakUsage}%`}</strong></div></div>}
        {error && <div className="vt-notice vt-error"><AlertTriangle size={16}/>{error}</div>}
      </div>
    </div>
    <div className="v91-cpu-next"><Activity size={17}/><p>Para probar OC automatico real en procesadores Ryzen compatibles, abre Ryzen Master, configura Auto Overclock y ejecuta su Smart Stress Test. El fabricante debe confirmar compatibilidad y temperaturas seguras. No se puede garantizar estabilidad con una lectura de 10 segundos.</p></div>
  </div>;
}
