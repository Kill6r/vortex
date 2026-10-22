import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleHelp, Play, RefreshCw, ShieldCheck, Timer, Zap, Save } from 'lucide-react';
import { processAllowed } from '../core/performance.js';
import MemoryCleaner from './MemoryCleaner.jsx';

const mb = bytes => `${(Number(bytes || 0) / 1024 ** 2).toLocaleString('es-CO', { maximumFractionDigits: 0 })} MB`;
const percent = value => value == null ? '—' : `${Number(value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const pct = (part, total) => total ? Math.max(0, Math.min(100, Math.round(100 * part / total))) : 0;

export default function MemoryPage({ api, overview }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('conservadora');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState(null);
  const [confirmIntensive, setConfirmIntensive] = useState(false);
  const [autoNames, setAutoNames] = useState([]);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [thresholdPercent, setThresholdPercent] = useState(85);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState('Gaming');
  const [profileSelected, setProfileSelected] = useState('');
  const fetching = useRef(false);
  const [profileRevision, setProfileRevision] = useState(0);

  async function load() {
    if (!api || fetching.current) return;
    fetching.current = true;
    try { setData(await api.memorySnapshot()); }
    catch (e) { setError(e.message); }
    finally { fetching.current = false; }
  }

  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.all([api.memorySnapshot(), api.memoryProfiles()]).then(([next, list]) => {
      if (!active) return;
      setData(next); setProfiles(list); setAutoEnabled(next.auto.enabled);
      setAutoNames(next.auto.processNames); setIntervalMinutes(next.auto.intervalMinutes);
      setThresholdPercent(next.auto.thresholdPercent);
    }).catch(e => { if (active) setError(e.message); });
    const timer = setInterval(() => { if (active) load(); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const processes = useMemo(() => (data?.processes || []).filter(item => `${item.name} ${item.title}`.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const available = data?.available ?? overview?.ramAvailable ?? 0;
  const total = data?.total ?? overview?.ramTotal ?? 0;
  const used = pct(total - available, total);
  const eligible = processes.slice(0, 100).filter(item => processAllowed(item.name) && !item.entries?.some(entry => entry.foreground));
  const eligibleNames = eligible.map(item => item.name.toLowerCase());
  const selectedVisible = eligibleNames.filter(name => selected.includes(name));
  const allSelected = eligibleNames.length > 0 && selectedVisible.length === eligibleNames.length;
  const chosen = (data?.processes || []).filter(item => selected.includes(item.name.toLowerCase()) && processAllowed(item.name) && !item.entries?.some(entry => entry.foreground));
  const targetLimit = mode === 'intensiva' ? 30 : 8;
  const chosenPids = [...new Set(chosen.flatMap(item => item.entries.map(entry => entry.pid)))].slice(0, targetLimit);

  function selectAllVisible() {
    setSelected(current => allSelected ? current.filter(name => !eligibleNames.includes(name)) : [...new Set([...current, ...eligibleNames])]);
  }

  async function execute(operation, success) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await operation(); await load(); setMessage(typeof success === 'function' ? success(result) : success); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function run(approved = false) {
    if (!chosenPids.length || busy) return;
    if (mode === 'intensiva' && !approved) { setConfirmIntensive(true); return; }
    setConfirmIntensive(false);
    await execute(async () => { const result = await api.cleanMemory({ mode, pids: chosenPids }); setReport(result); if (!result.succeeded) throw new Error('Windows no permitió liberar memoria de los procesos seleccionados.'); return result; }, result => `Operación completada: ${result.succeeded} de ${result.attempted} procesos.`);
  }

  async function saveAutomatic() {
    await execute(async () => {
      const config = await api.configureMemory({ enabled: autoEnabled, intervalMinutes, thresholdPercent, processNames: autoNames });
      setData(previous => ({ ...previous, auto: config }));
    }, 'Supervisión guardada.');
  }

  async function saveProfile() {
    await execute(async () => {
      await api.configureMemory({ enabled: autoEnabled, intervalMinutes, thresholdPercent, processNames: autoNames });
      await api.saveMemoryProfile(profileName);
      setProfiles(await api.memoryProfiles());
      setProfileSelected(profileName.trim());
    }, 'Perfil de limpieza de memoria guardado.');
  }

  async function deleteProfile() {
    if (!profileSelected) return;
    await execute(async () => {
      await api.deleteMemoryProfile(profileSelected);
      setProfiles(await api.memoryProfiles());
      setProfileSelected('');
    }, 'Perfil eliminado.');
  }

  async function applyProfile() {
    if (!profileSelected) return;
    await execute(async () => {
      const next = await api.applyMemoryProfile(profileSelected);
      setAutoEnabled(next.memory.enabled); setIntervalMinutes(next.memory.intervalMinutes);
      setThresholdPercent(next.memory.thresholdPercent); setAutoNames(next.memory.processNames);
      setProfileRevision(current => current + 1);
    }, 'Perfil de memoria aplicado.');
  }

  return <>
    <div className="page-heading"><div><h1>Memoria RAM</h1><p>Consumo de las aplicaciones y mantenimiento configurable.</p></div><button className="btn btn-dark" onClick={load}><RefreshCw size={15}/> Actualizar</button></div>
    {error && <div className="inline-error"><AlertTriangle size={16}/>{error}</div>}
    {message && <div className="memory-report"><Check size={16}/>{message}</div>}
    <div className="section-caption"><h3>PERFILES GUARDADOS</h3><span>Supervisión y limpieza de memoria</span></div>
    <section className="panel memory-section vr-quick-profile"><div className="v06-controls"><label>Nombre del perfil<input value={profileName} onChange={e => setProfileName(e.target.value)} maxLength={42} placeholder="Mi perfil"/></label><button className="btn btn-dark" disabled={busy} onClick={saveProfile}><Save size={14}/> Guardar perfil</button><label>Perfil guardado<select value={profileSelected} onChange={e => setProfileSelected(e.target.value)}><option value="">Seleccionar perfil</option>{profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label><button className="btn btn-dark" disabled={!profileSelected || busy} onClick={applyProfile}>Aplicar perfil</button><button className="btn btn-dark" disabled={!profileSelected || busy} onClick={deleteProfile}>Eliminar</button></div></section>
    <div className="memory-hero panel"><div><span className="section-kicker">USO DE MEMORIA FÍSICA</span><div className="memory-big">{used}<span>%</span></div><p>{mb(total - available)} de {mb(total)} · {mb(available)} disponibles</p></div><div className="memory-meter"><div className="memory-meter-fill" style={{ width: `${used}%` }}/></div></div>
    <MemoryCleaner api={api} revision={profileRevision}/>
    <div className="section-caption"><h3>PROCESOS</h3><span>Datos actualizados cada 2 segundos · Agrupados por aplicación</span></div>
    <section className="panel memory-section">
      <div className="mem-toolbar"><strong>Consumo en tiempo real</strong><div className="mem-toolbar-actions"><button className="btn btn-dark" disabled={!eligibleNames.length} onClick={selectAllVisible}>{allSelected ? "Deseleccionar visibles" : "Seleccionar todos"}</button><input value={query} placeholder="Buscar aplicación" onChange={e => setQuery(e.target.value)}/></div></div>
      <div className="v06-scroll"><table className="v06-table"><thead><tr><th>Aplicación</th><th>CPU</th><th>RAM</th><th>RAM %</th><th>GPU</th><th>Limpiar</th><th>Auto</th></tr></thead><tbody>{processes.slice(0, 100).map(item => <tr key={item.name.toLowerCase()}><td><strong>{item.name}</strong><small>{item.count} {item.count === 1 ? 'proceso' : 'procesos'} · {item.title || 'Segundo plano'}</small></td><td>{percent(item.cpuPercent)}</td><td>{mb(item.memory)}</td><td>{percent(item.ramPercent)}</td><td title={data?.gpuSupported ? 'Actividad del motor GPU más ocupado; puede diferir del Administrador de tareas.' : 'Windows o el controlador no ofrece contadores de GPU'}>{percent(item.gpuPercent)}</td><td><input type="checkbox" aria-label={`Seleccionar ${item.name}`} disabled={!processAllowed(item.name) || item.entries?.some(entry => entry.foreground)} title={!processAllowed(item.name) || item.entries?.some(entry => entry.foreground) ? "Protegido o en primer plano" : "Seleccionar para limpieza manual"} checked={selected.includes(item.name.toLowerCase())} onChange={e => setSelected(current => e.target.checked ? [...current, item.name.toLowerCase()] : current.filter(name => name !== item.name.toLowerCase()))}/></td><td><input type="checkbox" aria-label={`Supervisar ${item.name}`} checked={autoNames.includes(item.name.toLowerCase())} onChange={e => setAutoNames(current => e.target.checked ? [...new Set([...current, item.name.toLowerCase()])] : current.filter(name => name !== item.name.toLowerCase()))}/></td></tr>)}</tbody></table></div>
      <div className="v06-note">La CPU agrupa los procesos de una misma aplicación. RAM % es la proporción de la memoria física total y GPU es una estimación por motor gráfico. El Administrador de tareas puede usar otra definición de memoria.</div>
      <div className="mode-picker"><button className={mode === 'conservadora' ? 'mode-picked' : ''} onClick={() => setMode('conservadora')}><ShieldCheck size={17}/><strong>Conservadora</strong><small>Hasta 8 procesos. Sin cerrar aplicaciones.</small></button><button className={mode === 'intensiva' ? 'mode-picked' : ''} onClick={() => setMode('intensiva')}><Zap size={17}/><strong>Intensiva</strong><small>Hasta 30 procesos. Puede causar recargas.</small></button></div>
      <div className="memory-actions"><span>{selected.length} aplicaciones marcadas · se intentará limpiar un máximo de {targetLimit} procesos elegibles por operación</span><button className="btn btn-dark" disabled={busy || !chosenPids.length} onClick={() => run()}><Play size={15}/> Liberar memoria seleccionada</button></div>
      {report && <div className="memory-report"><Check size={16}/>Intentos: {report.attempted} · Completados: {report.succeeded} · Antes: {mb(report.availableBefore)} · Después: {mb(report.availableAfter)}</div>}
    </section>
    <div className="section-caption"><h3>SUPERVISIÓN AUTOMÁTICA</h3><span>Se guarda en este equipo</span></div>
    <section className="panel memory-section"><div className="section-with-icon"><Timer size={19}/><div><h3>Limpiar según el uso de RAM</h3><p>Cuando el uso total supere el porcentaje elegido, VORTEX puede reducir memoria de las aplicaciones marcadas como «Auto», evitando la aplicación en primer plano.</p></div></div>
      <div className="v06-controls"><label>Comprobar cada<select value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))}>{[1,2,5,10,15,30,60].map(v => <option key={v} value={v}>{v} {v === 1 ? 'minuto' : 'minutos'}</option>)}</select></label><label>Cuando RAM en uso llegue a<select value={thresholdPercent} onChange={e => setThresholdPercent(Number(e.target.value))}>{[60,70,75,80,85,90,95,98].map(v => <option key={v} value={v}>{v} %</option>)}</select></label><label className="v06-check"><input type="checkbox" checked={autoEnabled} onChange={e => setAutoEnabled(e.target.checked)}/> Habilitar supervisión</label></div>
      <div className="memory-actions"><span>{data?.auto?.enabled ? `Activa · ${data.auto.thresholdPercent} %` : 'Desactivada'} · {autoNames.length} aplicaciones incluidas</span><button className="btn btn-dark" disabled={busy || (autoEnabled && !autoNames.length)} onClick={saveAutomatic}>Guardar supervisión</button></div>
    </section>

    <div className="bottom-explanation"><CircleHelp size={16}/><span>Seleccionar todos solo incluye aplicaciones permitidas y visibles en el filtro. Se excluyen procesos protegidos y en primer plano. Tener más RAM libre no garantiza un mejor rendimiento.</span></div>
    {confirmIntensive && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><div className="modal-top"><AlertTriangle size={23}/></div><h2>Limpieza intensiva</h2><p>Se intentará reducir la memoria de trabajo de hasta 30 procesos. Algunas aplicaciones pueden congelarse brevemente o recargar información.</p><div className="modal-buttons"><button className="btn btn-dark" onClick={() => setConfirmIntensive(false)}>Cancelar</button><button className="btn btn-dark" onClick={() => run(true)}>Confirmar</button></div></div></div>}
  </>;
}
