import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Cpu, Gamepad2, HardDrive, Info, MemoryStick, RefreshCw, RotateCcw, Search, Settings2, Shield, SlidersHorizontal, Zap } from 'lucide-react';
import { coresFromMask, maskFromCores } from '../core/gaming.js';
import { advancedDefaults, ecoLevels, gpuLevels, ioLevels, memoryLevels, threadBoostLevels, gpuPreferenceLevels } from '../core/advanced.js';
import { findRuleForProcess } from '../core/rule-management.js';
import './game-advisor.css';

const cpuLevels = [['Normal', 'Normal'], ['AboveNormal', 'Superior'], ['High', 'Alta']];
const gpuNames = { Idle: 'Baja', BelowNormal: 'Inferior', Normal: 'Normal', AboveNormal: 'Superior', High: 'Alta' };
const ioNames = { VeryLow: 'Muy baja', Low: 'Baja', Normal: 'Normal', High: 'Alta' };
const memoryNames = { VeryLow: 'Muy baja', Low: 'Baja', Medium: 'Media', BelowNormal: 'Inferior', Normal: 'Normal' };
const efficiencyNames = { System: 'Control de Windows', Efficient: 'Eficiencia (EcoQoS)', Performance: 'Alto rendimiento (HighQoS)' };
const boostNames = { Enabled: 'Permitir impulso', Disabled: 'Desactivar impulso' };
const preferenceNames = { System: 'Decide Windows', PowerSaving: 'Ahorro energético', HighPerformance: 'Alto rendimiento' };
const diagnosticNames = { gpu: 'Prioridad de GPU', io: 'Prioridad de E/S', memory: 'Prioridad de memoria', efficiency: 'Modo de eficiencia', threadBoost: 'Impulso dinámico de hilos', gpuPreference: 'Preferencia de GPU' };
const formatRam = bytes => `${(Number(bytes || 0) / 1024 ** 2).toFixed(0)} MB`;
const formatPercent = value => value == null ? '—' : `${Number(value).toFixed(1)} %`;
const normalize = value => String(value || '').replace(/\.exe$/i, '').toLowerCase();

function Picker({ label, value, onChange, values, names, onApply, busy, description }) {
  return <label className="vg-field" title={description}>
    <span>{label}<small>{description}</small></span>
    <span className="vg-picker"><select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
      <option value="">No modificar</option>
      {values.map(item => <option key={item} value={item}>{names[item] || item}</option>)}
    </select>{onApply && <button type="button" disabled={!value || busy} onClick={onApply}>Aplicar</button>}</span>
  </label>;
}

function Toggle({ label, detail, checked, onChange }) {
  return <label className="vg-toggle"><span><b>{label}</b><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span className="vg-switch"/></label>;
}

export default function GamesPage({ api, onOpenRules }) {
  const [processes, setProcesses] = useState([]);
  const [rules, setRules] = useState([]);
  const [active, setActive] = useState(null);
  const [caps, setCaps] = useState({ logicalCpus: 0, affinitySupported: false });
  const [selectedPid, setSelectedPid] = useState(null);
  const [priority, setPriority] = useState('AboveNormal');
  const [advanced, setAdvanced] = useState({ ...advancedDefaults });
  const [cores, setCores] = useState([]);
  const [useAffinity, setUseAffinity] = useState(false);
  const [auto, setAuto] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('cpu');
  const [menu, setMenu] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const polling = useRef(false);
  const selected = processes.find(item => item.pid === selectedPid);
  const saved = selected ? findRuleForProcess(rules, selected) : null;

  async function load(silent = false) {
    if (!api || polling.current) return;
    polling.current = true;
    try {
      const [list, state, savedRules, capabilities] = await Promise.all([
        api.gameProcesses(), api.gameStatus(), api.gameRules(), api.gameCapabilities()
      ]);
      setProcesses(list);
      setActive(state);
      setRules(savedRules);
      setCaps(capabilities);
    } catch (error) {
      if (!silent) setNotice({ error: true, text: error.message });
    } finally { polling.current = false; }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 2000);
    return () => clearInterval(timer);
  }, []);

  function choose(item) {
    const rule = findRuleForProcess(rules, item);
    setSelectedPid(item.pid);
    setDiagnostic(null);
    setRecommendation(null);
    const preferred = rule?.priority || item.priority;
    setPriority(cpuLevels.some(([key]) => key === preferred) ? preferred : 'AboveNormal');
    setAdvanced({ ...advancedDefaults, ...rule?.advanced });
    const coresAvailable = Math.min(caps.logicalCpus, 62);
    const previous = coresFromMask(rule?.affinity || item.affinity, coresAvailable);
    setCores(previous.length ? previous : Array.from({ length: coresAvailable }, (_, i) => i));
    setUseAffinity(Boolean(rule?.affinity));
    setAuto(Boolean(rule?.auto));
  }

  const visible = useMemo(() => processes.filter(item => `${item.name} ${item.title}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'memory' ? (b.groupMemory ?? b.memory) - (a.groupMemory ?? a.memory) : (b.groupCpuPercent ?? b.cpuPercent ?? -1) - (a.groupCpuPercent ?? a.cpuPercent ?? -1)),
  [processes, query, sort]);

  const affinity = useAffinity && caps.affinitySupported && cores.length
    ? maskFromCores(cores, caps.logicalCpus) : null;
  const editorBusy = busy || Boolean(active && selected && active.pid !== selected.pid);

  async function run(operation, success) {
    setBusy(true);
    setNotice(null);
    setMenu(null);
    try {
      const result = await operation();
      setNotice({ text: result?.restored === false ? result.note || 'Algunos ajustes no se restauraron.' : result?.verified === false ? 'Operación ejecutada sin posibilidad de lectura posterior.' : success, error: result?.restored === false });
      await load();
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function verify(pid = selectedPid) {
    if (!pid) return;
    setDiagnosticBusy(true);
    try {
      const result = await api.inspectGameSettings(pid);
      setDiagnostic(result);
    } catch (error) { setDiagnostic({ error: error.message }); }
    finally { setDiagnosticBusy(false); }
  }
  function update(key, value) { setAdvanced(current => ({ ...current, [key]: value })); }
  function apply(kind, value) {
    if (!selected) return;
    if (kind === 'gpuPreference' && !window.confirm('La preferencia se guarda por ejecutable. Debes reiniciar el juego para que Windows intente aplicarla. ¿Continuar?')) return;
    const pid = selected.pid;
    run(async () => {
      const result = await api.changeGameProcess({ pid, started: selected.started, kind, value });
      await verify(pid);
      return result;
    }, kind === 'gpuPreference' ? 'Preferencia de GPU guardada. Reinicia el juego para solicitar el cambio.' : `${diagnosticNames[kind] || kind}: cambio verificado por Windows.`);
  }
  function openMenu(event, item) {
    event.preventDefault();
    choose(item);
    setMenu({ x: Math.max(8, Math.min(Number(event.clientX) || 25, window.innerWidth - 235)), y: Math.max(8, Math.min(Number(event.clientY) || 75, window.innerHeight - 295)), item });
  }
  async function analyze() {
    if (!selected || recommendationBusy) return;
    setRecommendationBusy(true);
    try {
      setRecommendation(await api.recommendGame(selected.pid));
      setNotice(null);
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setRecommendationBusy(false); }
  }
  function useRecommendation() {
    if (!recommendation) return;
    setPriority(recommendation.priority);
    setAdvanced({ ...advancedDefaults, ...recommendation.advanced });
    setUseAffinity(false);
    setAuto(false);
    setNotice({ text: 'Recomendación cargada en el editor. Guarda o aplica cuando quieras.' });
  }
  function start() {
    if (!selected) return;
    if (active) return run(() => api.stopGame(), 'Perfil restaurado.');
    run(() => api.activateGame(selected.pid, { priority, affinity, advanced }), 'Perfil aplicado temporalmente.');
  }
  function save() {
    if (!selected) return;
    run(() => api.saveGameRule({ match: saved?.match || selected.name, priority, affinity, auto, advanced }), 'Perfil guardado para este ejecutable.');
  }

  return <div className="vg-page" onClick={() => menu && setMenu(null)}>
    <div className="page-heading vg-heading"><div><h1>Modo juego</h1><p>Procesos, prioridades y perfiles por ejecutable.</p></div><div className="vr-actions"><button className="btn btn-dark" onClick={onOpenRules}>Ver reglas guardadas ({rules.length})</button><button className="btn btn-dark" onClick={() => load()}><RefreshCw size={15}/> Actualizar</button></div></div>
    {notice && <div className={`inline-error ${notice.error ? '' : 'inline-success'}`}>{notice.error ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {notice.text}</div>}
    <div className="vg-summary"><div><span>PROCESOS VISIBLES</span><strong>{processes.length}</strong></div><div><span>PERFILES GUARDADOS</span><strong>{rules.length}</strong></div><div><span>NÚCLEOS LÓGICOS</span><strong>{caps.logicalCpus || '—'}</strong></div><div><span>PERFIL EN EJECUCIÓN</span><strong className={active ? 'vg-green' : ''}>{active ? active.name : 'Ninguno'}</strong></div></div>
    <div className="vg-layout">
      <section className="vg-panel vg-processes"><div className="vg-panel-head"><div><h2><Cpu size={17}/> Procesos activos</h2><p>Valores aproximados actualizados cada 2 segundos.</p></div></div>
        <div className="vg-toolbar"><div className="search"><Search size={15}/><input placeholder="Buscar proceso..." value={query} onChange={event => setQuery(event.target.value)}/></div><select value={sort} onChange={event => setSort(event.target.value)}><option value="cpu">Mayor CPU</option><option value="memory">Mayor RAM</option><option value="name">Nombre</option></select></div>
        <div className="vg-table-wrap"><table className="vg-table"><thead><tr><th>Proceso</th><th>CPU</th><th>RAM</th><th>RAM %</th><th>GPU</th><th>Prioridad</th><th></th></tr></thead><tbody>{visible.map(item => <tr key={`${item.pid}-${item.started}`} className={selectedPid === item.pid ? 'selected' : ''} onClick={() => choose(item)} onContextMenu={event => openMenu(event, item)}><td><strong>{item.name}.exe</strong><small>PID {item.pid}{item.processCount > 1 ? ` · ${item.processCount} procesos` : ''}{item.foreground ? ' · En primer plano' : ''}{findRuleForProcess(rules, item) ? ' · Perfil' : ''}</small></td><td className="vg-mono">{formatPercent(item.groupCpuPercent ?? item.cpuPercent)}</td><td className="vg-mono">{formatRam(item.groupMemory ?? item.memory)}</td><td className="vg-mono">{formatPercent(item.ramPercent)}</td><td className="vg-mono">{formatPercent(item.gpuPercent)}</td><td>{cpuLevels.find(([key]) => key === item.priority)?.[1] || item.priority}</td><td><button className="vg-more" title="Acciones" onClick={event => { event.stopPropagation(); openMenu(event, item); }}>···</button></td></tr>)}</tbody></table>{!visible.length && <p className="vg-empty">No se encontraron procesos con ventana.</p>}</div>
        <div className="vg-help"><Info size={15}/> CPU normalizada entre todos los procesadores lógicos. Los juegos pueden rechazar cambios por sus protecciones.</div>
      </section>
      <section className="vg-panel vg-editor"><div className="vg-panel-head"><div><h2><Settings2 size={17}/> Perfil del proceso</h2><p>Todos los ajustes se guardan por nombre de ejecutable.</p></div></div>
        {selected ? <div className="vg-editor-body">
          <div className="vg-selection"><div><strong>{selected.name}.exe</strong><small>PID {selected.pid} · {formatRam(selected.memory)} en RAM</small></div>{saved && <span className="vg-profile-tag">Perfil guardado</span>}</div><div className="vg-actions vg-actions-top"><button className="btn btn-dark" onClick={analyze} disabled={busy || recommendationBusy}>{recommendationBusy ? 'Analizando...' : 'Analizar equipo y juego'}</button><button className="btn btn-dark" disabled={busy} onClick={save}>Guardar perfil</button><button className="btn btn-lime" disabled={busy || editorBusy || Boolean(useAffinity && !affinity)} onClick={start}>{active?.pid === selected.pid ? 'Restaurar original' : 'Aplicar perfil'}</button><label className="vg-top-auto"><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)}/> Automático</label></div>
          {recommendation && <div className="game-advice">
            <div className="game-advice-top"><div><span className="game-advice-eyebrow">ANÁLISIS PERSONALIZADO</span><strong>{recommendation.title}</strong><small>{recommendation.caveat}</small></div><button type="button" onClick={useRecommendation} disabled={busy}>Usar recomendación</button></div>
            <div className="game-advice-items">{recommendation.reasons.map((reason, i) => <p key={i}>{reason}</p>)}</div>
          </div>}
          <label className="vg-field"><span>Prioridad de CPU<small>Define la preferencia del planificador de Windows.</small></span><span className="vg-picker"><select value={priority} onChange={event => setPriority(event.target.value)}>{cpuLevels.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select><button disabled={busy || active?.pid === selected.pid} onClick={() => apply('priority', priority)}>Aplicar</button></span></label>
          <div className="vg-affinity"><label><input type="checkbox" disabled={!caps.affinitySupported} checked={useAffinity} onChange={event => setUseAffinity(event.target.checked)}/> Personalizar afinidad de CPU</label>{useAffinity && <div className="vg-cores">{Array.from({ length: caps.logicalCpus }, (_, i) => <label key={i}><input type="checkbox" checked={cores.includes(i)} onChange={() => setCores(items => items.includes(i) ? items.filter(value => value !== i) : [...items, i].sort((a,b) => a-b))}/> {i}</label>)}</div>}{useAffinity && <button className="vg-small-button" disabled={!affinity || busy || active?.pid === selected.pid} onClick={() => apply('affinity', affinity)}>Aplicar afinidad</button>}</div>
          <button className="vg-expand" onClick={() => setAdvancedOpen(value => !value)}><span><SlidersHorizontal size={15}/> Prioridades y reglas avanzadas</span><ChevronDown size={16} className={advancedOpen ? 'chevron-up' : ''}/></button>
          {advancedOpen && <div className="vg-advanced">
            <Picker label="Prioridad de GPU" description="Prioridad de programación gráfica, si el controlador lo admite." value={advanced.gpu} onChange={value => update('gpu', value)} values={gpuLevels} names={gpuNames} busy={busy} onApply={() => apply('gpu', advanced.gpu)}/>
            <Picker label="Prioridad de E/S" description="Alta es experimental: Windows puede rechazarla o devolverla a Normal. Se comprueba el valor aplicado." value={advanced.io} onChange={value => update('io', value)} values={ioLevels} names={ioNames} busy={busy} onApply={() => apply('io', advanced.io)}/>
            <Picker label="Prioridad de memoria" description="Preferencia de páginas; no reserva ni libera RAM." value={advanced.memory} onChange={value => update('memory', value)} values={memoryLevels} names={memoryNames} busy={busy} onApply={() => apply('memory', advanced.memory)}/>
            <Picker label="Modo de alta eficiencia" description="EcoQoS reduce consumo en segundo plano. Alto rendimiento pide HighQoS, sin prometer más FPS." value={advanced.efficiency} onChange={value => update('efficiency', value)} values={ecoLevels} names={efficiencyNames} busy={busy} onApply={() => apply('efficiency', advanced.efficiency)}/>
            <Picker label="Impulso dinámico de hilos" description="Permite o bloquea los impulsos temporales del planificador para los hilos de este proceso. No sube la prioridad base." value={advanced.threadBoost} onChange={value => update('threadBoost', value)} values={threadBoostLevels} names={boostNames} busy={busy} onApply={() => apply('threadBoost', advanced.threadBoost)}/>
            <Picker label="Preferencia de GPU por juego" description="Guarda una preferencia por ruta .exe en Windows. Requiere reiniciar el juego y no garantiza una GPU concreta." value={advanced.gpuPreference} onChange={value => update('gpuPreference', value)} values={gpuPreferenceLevels} names={preferenceNames} busy={busy} onApply={() => apply('gpuPreference', advanced.gpuPreference)}/>
            <div className="game-background-options">
              <div className="game-background-heading"><strong>Procesos secundarios</strong><small>Solo actúan cuando el juego está en primer plano, sobre lanzadores permitidos. Nunca sobre el juego.</small></div>
              <Toggle label="ProBalance" detail="Reduce temporalmente la prioridad de lanzadores autorizados que mantengan alto consumo de CPU. Se restaura al detener el perfil." checked={advanced.proBalance} onChange={value => update('proBalance', value)}/>
              {advanced.proBalance && <label className="game-number-setting">Umbral de CPU sostenido (%) <input type="number" min="10" max="90" value={advanced.proBalanceCpu} onChange={e => update('proBalanceCpu', Number(e.target.value))}/></label>}
              <Toggle label="IdleSaver" detail="Reduce temporalmente la prioridad de lanzadores inactivos. No suspende procesos ni interrumpe el juego." checked={advanced.idleSaver} onChange={value => update('idleSaver', value)}/>
              {advanced.idleSaver && <label className="game-number-setting">Inactividad (segundos) <input type="number" min="30" max="900" value={advanced.idleSeconds} onChange={e => update('idleSeconds', Number(e.target.value))}/></label>}
              <Toggle label="SmartTrim" detail="Experimental: puede descargar páginas de RAM de lanzadores secundarios y provocar recargas. Recomendado: apagado." checked={advanced.smartTrim} onChange={value => update('smartTrim', value)}/>
              {advanced.smartTrim && <div className="game-number-group"><label className="game-number-setting">RAM disponible por debajo de (%) <input type="number" min="5" max="60" value={advanced.trimThreshold} onChange={e => update('trimThreshold', Number(e.target.value))}/></label><label className="game-number-setting">Pausa entre limpiezas (min) <input type="number" min="5" max="120" value={advanced.trimMinutes} onChange={e => update('trimMinutes', Number(e.target.value))}/></label></div>}
              <p className="game-background-warning">Solo supervisa una lista limitada de lanzadores. Chrome, VALORANT y los procesos de Windows quedan excluidos. Se necesita un perfil activo y VORTEX abierto. Ninguna opción garantiza más FPS.</p>
            </div>
            <div className="vg-help">La prioridad de GPU afecta al planificador gráfico del proceso actual. La preferencia de GPU es una opción distinta de Windows y se aplica al volver a abrir el ejecutable. El perfil guarda la preferencia, pero no la cambia automáticamente sin tu confirmación.</div>
            <div className="vg-help"><strong>Juego protegido:</strong> ProBalance, IdleSaver y SmartTrim solo podrán actuar sobre procesos secundarios permitidos; nunca reducirán la prioridad ni recortarán memoria del juego. Puedes supervisar el valor real desde «Verificar en Windows».</div>
          </div>}
          <div className="vg-verification">
            <div className="vg-verification-head"><strong>Comprobar ajustes reales</strong><button className="vg-small-button" disabled={diagnosticBusy || busy} onClick={() => verify()}>{diagnosticBusy ? 'Comprobando...' : 'Verificar en Windows'}</button></div>
            <p>Consulta los valores del proceso seleccionado, no solo los interruptores del perfil.</p>
            {diagnostic?.error && <p className="vg-verification-error">{diagnostic.error}</p>}
            {diagnostic && !diagnostic.error && <div className="vg-verification-grid">
              <div><span>Prioridad CPU</span><b>{diagnostic.priority || 'No disponible'}</b></div>
              <div><span>Afinidad CPU</span><b>{diagnostic.affinity || 'No disponible'}</b></div>
              {Object.entries(diagnosticNames).map(([key, label]) => { const actual = key === 'gpuPreference' ? diagnostic.gpuPreference : diagnostic.advanced?.[key]; const expected = advanced[key]; const mismatch = expected != null && actual != null && actual !== expected; return <div key={key}><span>{label}</span><b className={mismatch ? 'vg-verification-error' : ''}>{actual || 'No comprobable'}{mismatch ? ' · distinto al perfil' : expected === actual ? ' · coincide' : ''}</b></div>; })}
              {diagnostic.advancedError && <p className="vg-verification-error">Diagnóstico avanzado: {diagnostic.advancedError}</p>}
              {diagnostic.gpuPreferenceError && <p className="vg-verification-error">Preferencia gráfica: {diagnostic.gpuPreferenceError}</p>}
            </div>}
            {active?.pid === selected.pid && <p>{active.safetyNote && <span>{active.safetyNote} </span>}{active.moderation ? `Regla activa: ${active.moderation}. ` : ''}{active.lastCheck ? `Última supervisión: ${new Date(active.lastCheck).toLocaleTimeString('es-CO')}.` : 'Supervisión pendiente.'}{active.lastProblem && <span className="vg-verification-error"> Fallo detectado: {active.lastProblem}</span>}</p>}
          </div>
          <Toggle label="Aplicar automáticamente" detail="VORTEX debe seguir abierto para vigilar el juego y aplicar el perfil." checked={auto} onChange={setAuto}/>
          
          {saved && <button className="vg-remove" disabled={busy} onClick={() => run(() => api.deleteGameRule(saved.match || saved.name), 'Perfil eliminado.')}>Eliminar perfil guardado</button>}
        </div> : <div className="vg-empty vg-empty-editor"><Gamepad2 size={30}/> Selecciona un proceso para configurarlo.</div>}
      </section>
    </div>
    <div className="vg-footnote"><Shield size={16}/> Las preferencias de GPU necesitan reiniciar el juego y su lectura solo comprueba el ajuste guardado, no la GPU efectiva. Los ajustes de GPU y E/S dependen de permisos y compatibilidad. ProBalance, SmartTrim e IdleSaver nunca modifican el ejecutable del juego; si están habilitados, solo consideran lanzadores secundarios permitidos. SmartTrim puede provocar recargas en otros procesos y los cambios no garantizan más FPS.</div>
    {menu && <div className="vg-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}><div className="vg-menu-title">{menu.item.name}.exe</div><button onClick={() => { setMenu(null); document.querySelector('.vg-editor')?.scrollIntoView({ block: 'nearest' }); }}>Editar perfil...</button><button onClick={() => { const p = menu.item; run(() => api.activateGame(p.pid), 'Perfil activado.'); }}>Activar perfil guardado</button><button onClick={() => { const p = menu.item; run(() => api.changeGameProcess({ pid: p.pid, started: p.started, kind: 'priority', value: 'AboveNormal' }), 'Prioridad modificada.'); }}>CPU: superior a normal</button><button onClick={() => { const p = menu.item; run(() => api.changeGameProcess({ pid: p.pid, started: p.started, kind: 'priority', value: 'Normal' }), 'Prioridad restaurada a normal.'); }}>CPU: normal</button><button onClick={() => { const p = menu.item; run(() => api.changeGameProcess({ pid: p.pid, started: p.started, kind: 'trim', value: 'run' }), 'Memoria de trabajo procesada.'); }}>Limpiar memoria del proceso</button></div>}
  </div>;
}
