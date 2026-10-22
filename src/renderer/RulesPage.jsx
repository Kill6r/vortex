import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, FilePenLine, ListFilter, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { advancedDefaults, ecoLevels, gpuLevels, gpuPreferenceLevels, ioLevels, memoryLevels, threadBoostLevels } from '../core/advanced.js';
import { coresFromMask, maskFromCores } from '../core/gaming.js';
import { ruleMatchesProcess, ruleSummary, ruleTarget } from '../core/rule-management.js';
import './game-advisor.css';

const priorities = [['Normal', 'Normal'], ['AboveNormal', 'Superior'], ['High', 'Alta']];
const advancedFields = [
  ['gpu', 'Prioridad de GPU', gpuLevels, ['Baja', 'Inferior', 'Normal', 'Superior', 'Alta']],
  ['io', 'Prioridad de E/S', ioLevels, ['Muy baja', 'Baja', 'Normal', 'Alta']],
  ['memory', 'Prioridad de memoria', memoryLevels, ['Muy baja', 'Baja', 'Media', 'Inferior', 'Normal']],
  ['efficiency', 'Modo de eficiencia', ecoLevels, ['Control de Windows', 'EcoQoS', 'HighQoS']],
  ['threadBoost', 'Impulso de hilos', threadBoostLevels, ['Activado', 'Desactivado']],
  ['gpuPreference', 'Preferencia de GPU', gpuPreferenceLevels, ['Windows decide', 'Ahorro energético', 'Alto rendimiento']]
];
const priorityName = value => priorities.find(([name]) => name === value)?.[1] || value || '—';
const advancedName = (name, value) => {
  const field = advancedFields.find(([key]) => key === name);
  return field ? field[3][field[2].indexOf(value)] || '—' : '—';
};
const blank = () => ({ match: '', priority: 'Normal', affinity: null, auto: false, advanced: { ...advancedDefaults } });
const short = text => text?.length > 48 ? `${text.slice(0, 45)}…` : text;

function Choice({ label, value, options, onChange, empty = true }) {
  return <label className="vr-field"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
    {empty && <option value="">No modificar</option>}
    {options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
  </select></label>;
}

export default function RulesPage({ api, onOpenGame }) {
  const [rules, setRules] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [active, setActive] = useState(null);
  const [caps, setCaps] = useState({ logicalCpus: 0, affinitySupported: false });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(blank());
  const [showEditor, setShowEditor] = useState(false);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const [useAffinity, setUseAffinity] = useState(false);
  const [cores, setCores] = useState([]);
  const [showExtra, setShowExtra] = useState(false);
  const busyPoll = useRef(false);

  async function load(showError = true) {
    if (busyPoll.current) return;
    busyPoll.current = true;
    try {
      const [saved, live, game, available] = await Promise.all([api.gameRules(), api.gameProcesses(), api.gameStatus(), api.gameCapabilities()]);
      setRules(saved);
      setProcesses(live);
      setActive(game);
      setCaps(available);
    } catch (error) { if (showError) setNotification({ error: true, text: error.message }); }
    finally { busyPoll.current = false; }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(false), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = event => { if (event.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, [menu]);

  const decorated = useMemo(() => rules.map(rule => {
    const matches = processes.filter(process => ruleMatchesProcess(rule, process));
    const target = ruleTarget(rule);
    const applied = Boolean(active && active.ruleMatch === target && matches.some(process => active.pid === process.pid));
    const pathUnavailable = target.includes('\\') && !matches.length && processes.some(process =>
      process.name.toLowerCase().replace(/\.exe$/u, '') === rule.name && !process.path);
    return { ...rule, matches, applied, pathUnavailable, target };
  }), [rules, processes, active]);

  const visible = useMemo(() => decorated.filter(rule => {
    if (filter === 'auto' && !rule.auto) return false;
    if (filter === 'manual' && rule.auto) return false;
    if (filter === 'running' && !rule.matches.length) return false;
    return rule.target.includes(search.trim().toLowerCase()) || rule.priority.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => a.target.localeCompare(b.target, 'es')), [decorated, filter, search]);

  function edit(rule) {
    const coreCount = Math.min(caps.logicalCpus, 62);
    const available = rule?.affinity ? coresFromMask(rule.affinity, coreCount) : [];
    setSelected(rule ? ruleTarget(rule) : null);
    setDraft(rule ? { ...rule, priority: ['Idle', 'BelowNormal'].includes(rule.priority) ? 'Normal' : rule.priority, match: ruleTarget(rule), advanced: { ...advancedDefaults, ...rule.advanced } } : blank());
    setUseAffinity(Boolean(rule?.affinity));
    setCores(available);
    setShowExtra(Boolean(rule?.advanced && Object.values(rule.advanced).some(Boolean)));
    setShowEditor(true);
    setMenu(null);
    setNotification(null);
  }

  function updateAdvanced(name, value) { setDraft(old => ({ ...old, advanced: { ...old.advanced, [name]: value } })); }

  async function save(rule = draft, previous = selected) {
    if (busy) return;
    setBusy(true);
    setNotification(null);
    try {
      const affinity = useAffinity ? maskFromCores(cores, caps.logicalCpus) : null;
      const prepared = { ...rule, affinity };
      const next = await api.saveGameRule(prepared, previous);
      setRules(next);
      setSelected(ruleTarget({ match: prepared.match }));
      setShowEditor(false);
      setNotification({ text: `Regla guardada para ${prepared.match}.` });
      await load(false);
    } catch (error) { setNotification({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function toggleAuto(rule) {
    setBusy(true);
    setNotification(null);
    try {
      const next = await api.saveGameRule({ ...rule, auto: !rule.auto }, rule.target);
      setRules(next);
      setNotification({ text: `Aplicación automática ${rule.auto ? 'desactivada' : 'activada'} para ${rule.target}.` });
    } catch (error) { setNotification({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }

  async function remove(rule) {
    if (!window.confirm(`¿Eliminar la regla de ${rule.target}? Esto no restaura ajustes que ya hayas aplicado manualmente.`)) return;
    setBusy(true);
    try {
      const next = await api.deleteGameRule(rule.target);
      setRules(next);
      if (selected === rule.target) setShowEditor(false);
      setNotification({ text: 'Regla eliminada.' });
    } catch (error) { setNotification({ error: true, text: error.message }); }
    finally { setBusy(false); setMenu(null); }
  }

  function duplicate(rule) {
    edit({ ...rule, auto: false });
    setSelected(null);
    setDraft(previous => ({ ...previous, match: '', auto: false }));
  }

  function context(event, rule) {
    event.preventDefault();
    setMenu({ rule, x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 180) });
  }

  return <div className="vr-page">
    <div className="page-heading vr-heading"><div><h1>Reglas de procesos</h1><p>Gestiona todos los ajustes guardados, incluso cuando el juego no está abierto.</p></div>
      <div className="vr-actions"><button className="btn btn-dark" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Actualizar</button><button className="btn btn-lime" onClick={() => edit(null)} disabled={busy}><Plus size={15}/> Nueva regla</button></div></div>
    {notification && <div className={`vr-notice ${notification.error ? 'vr-notice-error' : ''}`}>{notification.error ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {notification.text}</div>}
    <div className="vr-counts"><span><strong>{rules.length}</strong> reglas configuradas</span><span><strong>{rules.filter(rule => rule.auto).length}</strong> automáticas</span><span><strong>{decorated.filter(rule => rule.matches.length).length}</strong> con proceso visible</span><span><strong>{decorated.filter(rule => rule.applied).length}</strong> perfiles activos</span></div>
    <section className="vr-panel"><div className="vr-tools"><div className="vr-search"><Search size={15}/><input aria-label="Buscar reglas" placeholder="Buscar ruta, ejecutable o prioridad..." value={search} onChange={event => setSearch(event.target.value)}/></div><div className="vr-filter"><ListFilter size={14}/><select aria-label="Filtrar reglas" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas</option><option value="auto">Automáticas</option><option value="manual">Manuales</option><option value="running">Procesos detectados</option></select></div></div>
      <div className="vr-table-scroll"><table className="vr-table"><thead><tr><th>Coincidencia de proceso</th><th>Estado</th><th>CPU</th><th>Afinidad de CPU</th><th>GPU</th><th>E/S</th><th>Memoria</th><th>Preferencia de GPU</th><th>EcoQoS</th><th>Impulso de hilos</th><th>Reglas extra</th><th>Automática</th><th></th></tr></thead>
      <tbody>{visible.map(rule => <tr key={rule.target} onDoubleClick={() => edit(rule)} onContextMenu={event => context(event, rule)} title="Doble clic para editar. Clic derecho para ver opciones.">
        <td className="vr-target" title={rule.target}><strong>{short(rule.target)}</strong><small>{rule.target.includes('\\') ? 'Ruta exacta' : 'Nombre del ejecutable'}</small></td>
        <td><span className={`vr-state ${rule.applied ? 'vr-state-active' : rule.matches.length ? 'vr-state-online' : ''}`}>{rule.applied ? 'Aplicado' : rule.matches.length ? 'Detectado' : rule.pathUnavailable ? 'Sin acceso a ruta' : 'Sin ejecutar'}</span></td>
        <td>{priorityName(rule.priority)}</td><td>{rule.affinity ? coresFromMask(rule.affinity, caps.logicalCpus).join(', ') || 'Personalizada' : 'Todos'}</td>
        <td>{advancedName('gpu', rule.advanced?.gpu)}</td><td>{advancedName('io', rule.advanced?.io)}</td><td>{advancedName('memory', rule.advanced?.memory)}</td><td>{advancedName('gpuPreference', rule.advanced?.gpuPreference)}</td><td>{advancedName('efficiency', rule.advanced?.efficiency)}</td><td>{advancedName('threadBoost', rule.advanced?.threadBoost)}</td><td>{ruleSummary(rule) - 1} adicionales</td>
        <td><input type="checkbox" aria-label={`Aplicación automática de ${rule.target}`} checked={rule.auto} disabled={busy} onChange={() => void toggleAuto(rule)} onClick={event => event.stopPropagation()}/></td>
        <td><button className="vr-row-action" title="Editar regla" onClick={() => edit(rule)}><FilePenLine size={15}/></button></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="vr-empty">{rules.length ? 'No hay reglas que coincidan con el filtro.' : 'Aún no hay reglas guardadas. Crea una o guarda un perfil desde Modo juego.'}</div>}
      <div className="vr-footer">Doble clic en una fila para editarla. Clic derecho para duplicar, activar o eliminar. Los cambios se guardan en tus perfiles locales.</div>
    </section>
    {showEditor && <div className="vr-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setShowEditor(false); }}>
      <section className="vr-editor" role="dialog" aria-modal="true" aria-label="Editar regla de proceso"><header><div><h2>{selected ? 'Editar regla' : 'Nueva regla'}</h2><p>Configura ajustes por ejecutable y guárdalos para próximas sesiones.</p></div><button className="btn btn-lime" disabled={busy || !draft.match.trim()} onClick={() => void save()}><Check size={15}/> Guardar</button><button aria-label="Cerrar" className="vr-close" onClick={() => setShowEditor(false)}><X size={18}/></button></header>
      <div className="vr-editor-scroll">
        <label className="vr-field"><span>Coincidencia de proceso</span><input autoFocus value={draft.match} placeholder="juego.exe o C:\\Juegos\\juego.exe" onChange={event => setDraft(old => ({ ...old, match: event.target.value }))}/><small>Por nombre se aplica a todos los ejecutables con ese nombre. La ruta exige una coincidencia exacta.</small></label>
        <Choice label="Prioridad de CPU" value={draft.priority} options={priorities} empty={false} onChange={value => setDraft(old => ({ ...old, priority: value }))}/>
        <label className="vr-check"><input type="checkbox" checked={useAffinity} disabled={!caps.affinitySupported} onChange={event => { setUseAffinity(event.target.checked); if (event.target.checked && !cores.length) setCores(Array.from({ length: caps.logicalCpus }, (_, index) => index)); }}/> Elegir núcleos de CPU</label>
        {useAffinity && <div className="vr-cores">{Array.from({ length: caps.logicalCpus }, (_, index) => <label key={index}><input type="checkbox" checked={cores.includes(index)} onChange={() => setCores(previous => previous.includes(index) ? previous.filter(core => core !== index) : [...previous, index].sort((a,b) => a-b))}/> {index}</label>)}</div>}
        <button className="vr-expand" onClick={() => setShowExtra(value => !value)}>{showExtra ? 'Ocultar ajustes avanzados' : 'Mostrar ajustes avanzados'}</button>
        {showExtra && <div className="vr-advanced">{advancedFields.map(([key, label, values, titles]) => <Choice key={key} label={label} value={draft.advanced[key]} options={values.map((name, index) => [name, titles[index]])} onChange={value => updateAdvanced(key, value)}/>)}
          <div className="vr-background-rules"><strong>Optimizaciones de segundo plano</strong><p>Solo lanzadores secundarios autorizados; nunca el ejecutable del juego. Mantén SmartTrim apagado salvo que compruebes presión de RAM.</p>
            <label className="vr-check"><input type="checkbox" checked={draft.advanced.proBalance} onChange={e => updateAdvanced('proBalance', e.target.checked)}/> ProBalance</label>
            {draft.advanced.proBalance && <label className="vr-field">Umbral CPU (%) <input type="number" min="10" max="90" value={draft.advanced.proBalanceCpu} onChange={e => updateAdvanced('proBalanceCpu', Number(e.target.value))}/></label>}
            <label className="vr-check"><input type="checkbox" checked={draft.advanced.idleSaver} onChange={e => updateAdvanced('idleSaver', e.target.checked)}/> IdleSaver</label>
            {draft.advanced.idleSaver && <label className="vr-field">Tiempo inactivo (segundos) <input type="number" min="30" max="900" value={draft.advanced.idleSeconds} onChange={e => updateAdvanced('idleSeconds', Number(e.target.value))}/></label>}
            <label className="vr-check"><input type="checkbox" checked={draft.advanced.smartTrim} onChange={e => updateAdvanced('smartTrim', e.target.checked)}/> SmartTrim (experimental)</label>
            {draft.advanced.smartTrim && <><label className="vr-field">RAM disponible debajo de (%) <input type="number" min="5" max="60" value={draft.advanced.trimThreshold} onChange={e => updateAdvanced('trimThreshold', Number(e.target.value))}/></label><label className="vr-field">Intervalo entre limpiezas (minutos) <input type="number" min="5" max="120" value={draft.advanced.trimMinutes} onChange={e => updateAdvanced('trimMinutes', Number(e.target.value))}/></label></>}
          </div>
          <p className="vr-hint">El juego nunca se recorta ni pierde prioridad mediante estas reglas. Chrome y los procesos del sistema quedan excluidos.</p>
        </div>}
        <label className="vr-check vr-auto"><input type="checkbox" checked={draft.auto} onChange={event => setDraft(old => ({ ...old, auto: event.target.checked }))}/>Aplicar automáticamente cuando se detecte el proceso</label>
        <p className="vr-hint">Guardar no modifica un juego ya abierto. El perfil automático necesita VORTEX en ejecución. La preferencia de GPU requiere volver a abrir el juego; puede no ser compatible con el controlador.</p>
      </div><footer><button className="btn btn-dark" onClick={() => setShowEditor(false)}>Cancelar</button><button className="btn btn-lime" disabled={busy || !draft.match.trim()} onClick={() => void save()}><Check size={15}/> {busy ? 'Guardando…' : 'Guardar regla'}</button></footer></section>
    </div>}
    {menu && <div className="vr-context" style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }} onClick={event => event.stopPropagation()}><strong>{short(menu.rule.target)}</strong><button onClick={() => edit(menu.rule)}><FilePenLine size={14}/> Editar regla</button><button onClick={() => duplicate(menu.rule)}><Copy size={14}/> Duplicar regla</button><button onClick={() => { void toggleAuto(menu.rule); setMenu(null); }}><Check size={14}/> {menu.rule.auto ? 'Desactivar' : 'Activar'} aplicación automática</button><button className="vr-delete" onClick={() => void remove(menu.rule)}><Trash2 size={14}/> Eliminar regla</button></div>}
    <div className="vr-bottom"><AlertTriangle size={15}/> Las reglas guardadas se aplican al proceso seleccionado al activar el perfil. La automatización funciona mientras VORTEX esté abierto y un proceso coincida. No se garantizan aumentos de FPS.</div>
  </div>;
}
