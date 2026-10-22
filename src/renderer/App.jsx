import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Check,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Cpu, FileClock, Gamepad2, BookMarked,
  Info, LayoutDashboard, ListFilter, LockKeyhole, MemoryStick, Minimize2,
  Monitor, RefreshCw, RotateCcw, Search, Settings, ShieldCheck, SlidersHorizontal,
  Wrench, X, Zap, DatabaseZap
} from 'lucide-react';
import { defaultPreferences, preferenceOptions } from '../core/catalog.js';
import { recommendService, summarizeRecommendations } from '../core/recommendations.js';
import { preferenceDetails } from '../core/preferences.js';
import MemoryPage from './MemoryPage.jsx';
import GamesPage from './GamesPage.jsx';
import RulesPage from './RulesPage.jsx';
import StartupPage from './StartupPage.jsx';

const navigation = [
  { id: 'inicio', label: 'Panel principal', icon: LayoutDashboard },
  { id: 'servicios', label: 'Servicios', icon: ListFilter },
  { id: 'memoria', label: 'Memoria RAM', icon: MemoryStick },
  { id: 'juegos', label: 'Modo juego', icon: Gamepad2 },
  { id: 'reglas', label: 'Reglas de procesos', icon: BookMarked },
  { id: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
  { id: 'historial', label: 'Historial', icon: FileClock }
];

const labels = {
  Running: 'En ejecución', Stopped: 'Detenido', Automatic: 'Automático', AutomaticDelayed: 'Automático (retrasado)',
  Manual: 'Manual', Disabled: 'Deshabilitado', Auto: 'Automático'
};

const filters = [
  { id: 'relevant', label: 'Para tu equipo' },
  { id: 'optional', label: 'Opcionales' },
  { id: 'consider', label: 'Evaluar' },
  { id: 'all', label: 'Todos' }
];

function number(value) {
  return Number(value || 0).toLocaleString('es-CO');
}

function size(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(1)} GB` : '—';
}

function date(value) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Tag({ children, tone = 'muted' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function Heading({ title, description, action }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

function Bar({ value, tone = 'lime' }) {
  return <div className="bar"><div className={`bar-fill fill-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}/></div>;
}

function Stat({ icon: Icon, label, value, sub, percentage, tone }) {
  return (
    <div className="stat">
      <div className="stat-heading"><span>{label}</span><Icon size={17}/></div>
      <div className="stat-value">{value}</div>
      <div className="stat-bottom"><small>{sub}</small>{percentage !== undefined && <span>{Math.round(percentage)}%</span>}</div>
      {percentage !== undefined && <Bar value={percentage} tone={tone}/>}
    </div>
  );
}

function Empty({ title, description }) {
  return <div className="empty"><CircleHelp size={25}/><strong>{title}</strong><p>{description}</p></div>;
}

function App() {
  const api = window.vortex;
  const [page, setPage] = useState('inicio');
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const [admin, setAdmin] = useState({ enabled: false });
  const [elevating, setElevating] = useState(false);
  const [overview, setOverview] = useState(null);
  const [live, setLive] = useState(null);
  const [services, setServices] = useState([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const servicesRequest = useRef(null);
  const securityRequest = useRef(null);
  const [hvci, setHvci] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('relevant');
  const [startFilter, setStartFilter] = useState('all');
  const [contextMenu, setContextMenu] = useState(null);
  const [preferenceDetail, setPreferenceDetail] = useState(null);
  const [selectedName, setSelectedName] = useState(null);
  const [targetMode, setTargetMode] = useState('Manual');
  const [advanced, setAdvanced] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [preferences, setPreferences] = useState(() => {
    try {
      return { ...defaultPreferences, ...JSON.parse(localStorage.getItem('vortex:preferences') || '{}') };
    } catch {
      return { ...defaultPreferences };
    }
  });

  useEffect(() => { if (api?.adminStatus) api.adminStatus().then(setAdmin).catch(() => {}); }, []);
  useEffect(() => {
    if (!api?.liveMetrics) return;
    let active = true;
    let updating = false;
    const sample = async () => {
      if (!active || updating) return;
      updating = true;
      try { const result = await api.liveMetrics(); if (active) setLive(result); }
      catch {}
      finally { updating = false; }
    };
    void sample();
    const interval = setInterval(() => { if (page === 'inicio') void sample(); }, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [page]);


  useEffect(() => {
    if (!headerMenuOpen) return;
    const closeOutside = event => {
      if (!headerMenuRef.current?.contains(event.target)) setHeaderMenuOpen(false);
    };
    const closeEscape = event => {
      if (event.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [headerMenuOpen]);

  function goTo(nextPage) {
    setPage(nextPage);
    setHeaderMenuOpen(false);
  }


  async function elevate() {
    if (!api?.requestAdmin || elevating) return;
    setElevating(true);
    try { await api.requestAdmin(); }
    catch (error) { setMessage({ kind: 'error', text: error.message || 'No se pudo solicitar acceso de administrador.' }); setElevating(false); }
  }

  async function loadServices(force = false) {
    if (servicesRequest.current) return servicesRequest.current;
    if (servicesLoaded && !force) return;
    setServicesLoading(true);
    servicesRequest.current = api.services().then(result => {
      setServices(result);
      setServicesLoaded(true);
    }).catch(error => {
      setMessage({ kind: 'error', text: error.message || 'No se pudieron consultar los servicios.' });
    }).finally(() => {
      servicesRequest.current = null;
      setServicesLoading(false);
    });
    return servicesRequest.current;
  }

  async function loadSecurity(force = false) {
    if (securityRequest.current) return securityRequest.current;
    if (hvci && !force) return;
    securityRequest.current = api.hvci().then(setHvci).catch(error => {
      setMessage({ kind: 'error', text: error.message || 'No se pudo consultar la seguridad de Windows.' });
    }).finally(() => { securityRequest.current = null; });
    return securityRequest.current;
  }

  async function refresh(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setMessage(null);

    if (!api) {
      setMessage({ kind: 'error', text: 'Abre VORTEX desde Electron para consultar Windows.' });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const result = await api.overview();
      setOverview(previous => ({ ...result,
        windows: previous?.gpus?.length ? previous.windows : result.windows,
        gpus: previous?.gpus?.length ? previous.gpus : result.gpus
      }));
      api.history().then(setHistory).catch(() => {});
      if (!initial && page === 'servicios') await loadServices(true);
      if (!initial && page === 'seguridad') await loadSecurity(true);
    } catch (error) {
      setMessage({ kind: 'error', text: error.message || 'No se pudo consultar el equipo.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void refresh(true); }, []);
  useEffect(() => {
    if (page === 'servicios') void loadServices();
    if (page === 'seguridad') void loadSecurity();
  }, [page]);
  useEffect(() => {
    if (!api?.hardwareDetails) return;
    let active = true;
    const timer = setTimeout(() => {
      api.hardwareDetails().then(data => {
        if (active) setOverview(previous => previous ? { ...previous, ...data } : previous);
      }).catch(() => {});
    }, 3500);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { localStorage.setItem('vortex:preferences', JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const escape = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); window.removeEventListener('keydown', escape); };
  }, [contextMenu]);

  const ramTotal = live?.ramTotal ?? overview?.ramTotal;
  const ramAvailable = live?.ramAvailable ?? overview?.ramAvailable;
  const ramPercentage = ramTotal ? Math.round(100 * (1 - ramAvailable / ramTotal)) : 0;
  const totals = useMemo(() => summarizeRecommendations(services, preferences, overview?.ramTotal || 0), [services, preferences, overview?.ramTotal]);
  const analyzed = useMemo(() => services.map(service => ({
    ...service,
    advice: recommendService(service, preferences, overview?.ramTotal || 0)
  })), [services, preferences, overview?.ramTotal]);
  const featured = analyzed.filter(service => service.advice.featured);
  const possible = totals.optional + totals.consider;
  const startCounts = services.reduce((counts, service) => ({ ...counts, [service.startMode]: (counts[service.startMode] || 0) + 1 }), {});

  const visibleServices = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    const priority = { optional: 0, consider: 1, keep: 2, other: 3 };
    return analyzed.filter(service => {
      const matches = [service.name, service.displayName, service.advice.description].some(value => String(value).toLocaleLowerCase('es').includes(needle));
      if (!matches || (startFilter !== 'all' && service.startMode !== startFilter)) return false;
      if (filter === 'relevant') return service.advice.featured;
      if (filter === 'all') return true;
      return service.advice.level === filter;
    }).sort((a, b) => priority[a.advice.level] - priority[b.advice.level] || a.displayName.localeCompare(b.displayName, 'es'));
  }, [analyzed, filter, query, startFilter]);

  const selected = analyzed.find(service => service.name === selectedName);
  const eligible = selected?.advice.editable && (!selected.advice.advanced || advanced);
  const requiringName = pending?.kind === 'change' && (pending.advanced || pending.mode === 'Disabled');
  const canConfirm = !requiringName || confirmation.trim() === pending.name;

  function selectService(service) {
    setSelectedName(service.name);
    setTargetMode(['Automatic', 'AutomaticDelayed', 'Manual', 'Disabled'].includes(service.startMode) ? service.startMode : 'Manual');
  }

  function openPending(data) {
    setConfirmation('');
    setPending(data);
  }

  async function applyPending() {
    if (!pending || !api || !canConfirm || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (pending.kind === 'change') {
        await api.changeService(pending.name, pending.mode, pending.advanced);
        setMessage({ kind: 'success', text: 'Tipo de inicio actualizado. No se ha detenido el servicio en ejecución.' });
      } else {
        await api.restoreService(pending.id);
        setMessage({ kind: 'success', text: 'La configuración anterior se ha restaurado.' });
      }
      const [updatedServices, updatedHistory] = await Promise.all([api.services(), api.history()]);
      setServices(updatedServices);
      setHistory(updatedHistory);
    } catch (error) {
      setMessage({ kind: 'error', text: error?.message || 'No se pudo completar la operación.' });
    } finally {
      setPending(null);
      setBusy(false);
      setConfirmation('');
    }
  }

  function openServices(nextFilter = 'relevant') {
    setFilter(nextFilter);
    setPage('servicios');
  }

  function openPreferenceMenu(event, option) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ option, x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 65) });
  }

  function navigationButton(item) {
    const Icon = item.icon;
    return (
      <button key={item.id} className={`nav-item ${page === item.id ? 'selected' : ''}`} onClick={() => setPage(item.id)}>
        <Icon size={18} strokeWidth={1.8}/>
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <div className="app-shell">
      <header className="global-header">
        <div className="header-left">
          <button className="logo" onClick={() => goTo('inicio')} aria-label="VORTEX, inicio"><span className="logo-symbol"><Zap size={23} fill="currentColor"/></span><strong>VORTEX</strong><span className="logo-mini">OPTIMIZER</span></button>
          <button className={`header-settings ${page === 'startup' ? 'header-settings-active' : ''}`} onClick={() => goTo('startup')} title="Configuración de VORTEX"><Settings size={17}/><span>Ajustes</span></button>
        </div>
        <div className="header-right">
          <span className="version-text">VERSIÓN 0.80</span>
          <button className="refresh-icon" title="Actualizar datos" aria-label="Actualizar datos" disabled={refreshing || busy} onClick={() => refresh()}><RefreshCw size={17} className={refreshing ? 'rotate' : ''}/></button>
          <div className="header-actions" ref={headerMenuRef}>
            <button className="header-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={headerMenuOpen} aria-controls="vortex-actions-menu" onClick={() => setHeaderMenuOpen(open => !open)}><SlidersHorizontal size={16}/><span>Opciones</span><ChevronDown size={15} className={headerMenuOpen ? 'chevron-up' : ''}/></button>
            {headerMenuOpen && <div className="header-actions-menu" id="vortex-actions-menu" role="menu" aria-label="Opciones de VORTEX">
              <div className="header-actions-caption">ACCIONES RÁPIDAS</div>
              <button role="menuitem" onClick={() => goTo('startup')}><Settings size={16}/><span>Ajustes e inicio con Windows</span></button>
              <button role="menuitem" onClick={() => goTo('servicios')}><ListFilter size={16}/><span>Administrar servicios</span></button>
              <button role="menuitem" onClick={() => goTo('memoria')}><MemoryStick size={16}/><span>Limpiar memoria</span></button>
              <button role="menuitem" onClick={() => goTo('reglas')}><BookMarked size={16}/><span>Reglas de procesos</span></button>
              <button role="menuitem" onClick={() => goTo('seguridad')}><ShieldCheck size={16}/><span>Seguridad y HVCI</span></button>
              <button role="menuitem" onClick={() => goTo('historial')}><FileClock size={16}/><span>Historial de cambios</span></button>
              <button role="menuitem" onClick={() => { setHeaderMenuOpen(false); void api.minimizeToTray(); }}><Minimize2 size={16}/><span>Minimizar a la bandeja</span></button>
              <div className="header-actions-divider"/>
              <div className="header-admin-status"><span className={`header-admin-dot ${admin.enabled ? 'elevated' : ''}`}/>{admin.enabled ? 'Permisos de administrador activos' : 'Ejecutando en modo normal'}</div>
              <button role="menuitem" disabled={admin.enabled || elevating || !api?.requestAdmin} onClick={() => { setHeaderMenuOpen(false); void elevate(); }}><LockKeyhole size={16}/><span>{admin.enabled ? 'Administrador habilitado' : elevating ? 'Solicitando permisos…' : 'Activar administrador'}</span></button>
            </div>}
          </div>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-title">TU EQUIPO</div>
        <div className="device-info">
          <div className="device-ring"><Monitor size={35}/></div>
          <div className="device-name">Equipo Windows</div>
          <div className="device-system">{overview?.windows || 'Esperando análisis'}</div>
          <div className="device-status"><span className="live-dot"/> {overview?.compatible ? 'Detectado' : 'Sin conectar'}</div>
        </div>
        <div className="side-stat"><span>MEMORIA EN USO</span><strong>{ramPercentage}%</strong><Bar value={ramPercentage} tone="teal"/></div>
        <div className="side-group"><span>GENERAL</span>{navigation.map(item => navigationButton(item))}</div>
        
        <div className="side-bottom"><span>VORTEX / DESKTOP</span><span>WINDOWS 10 — 11</span></div>
      </aside>

      <main className="main">
        <div className="workspace">
          {message && <div className={`message message-${message.kind}`}><span>{message.kind === 'error' ? <AlertTriangle size={17}/> : <CheckCircle2 size={17}/>} {message.text}</span><button aria-label="Cerrar" onClick={() => setMessage(null)}><X size={16}/></button></div>}
          {loading && !overview ? <div className="loading"><span className="loader"/><p>Analizando Windows…</p></div> : <>
            {page === 'inicio' && <>
              <Heading title="Resumen del sistema" description="Rendimiento y configuración de este equipo." action={<button className="btn btn-dark" onClick={() => refresh()} disabled={refreshing}><RefreshCw size={16}/> Actualizar</button>}/>
              <div className="win-overview">
                <div className="win-overview-title"><span><Monitor size={17}/> Estado del equipo</span><small>Información actual del sistema</small></div>
                <div className="win-overview-grid">
                  <div><span>Procesador</span><strong>{overview?.cpu || 'No detectado'}</strong><small>{overview?.threads || '—'} hilos lógicos</small></div>
                  <div><span>Tarjeta gráfica</span><strong>{overview?.gpus?.[0] || 'No detectada'}</strong><small>Configuración del dispositivo</small></div>
                  <div><span>Memoria instalada</span><strong>{size(overview?.ramTotal)}</strong><small>{ramPercentage}% en uso</small></div>
                  <div><span>Servicios opcionales</span><strong>{servicesLoaded ? number(totals.optional) : "—"}</strong><small>Según tus preferencias</small></div>
                </div>
                <div className="win-overview-actions"><button className="btn btn-dark" onClick={() => setPage('servicios')}>Administrar servicios <ArrowRight size={15}/></button><button className="btn btn-dark" onClick={() => setPage('juegos')}>Configurar juegos <Gamepad2 size={15}/></button><button className="btn btn-dark" onClick={() => setPage('memoria')}>Limpiar memoria <MemoryStick size={15}/></button></div>
              </div>
              <div className="section-caption"><h3>ESTADO DE RECURSOS</h3><span>Datos recientes · GPU estimada, puede diferir del Administrador de tareas</span></div>
              <div className="stat-grid">
                <Stat icon={Cpu} label="PROCESADOR" value={Number.isFinite(live?.cpuUsage) ? `${live.cpuUsage.toFixed(1)}%` : '—'} sub={`${overview?.threads || '—'} hilos · actualización cada 2 s`} percentage={live?.cpuUsage ?? undefined} tone="lime"/>
                <Stat icon={Gamepad2} label="GPU" value={Number.isFinite(live?.gpuUsage) ? `${live.gpuUsage.toFixed(1)}%` : '—'} sub={live?.gpuEstimated ? 'Estimación por motores GPU' : 'Contadores no disponibles'} percentage={live?.gpuUsage ?? undefined} tone="teal"/>
                <Stat icon={MemoryStick} label="MEMORIA RAM" value={`${ramPercentage}%`} sub={`${size((ramTotal || 0) - (ramAvailable || 0))} / ${size(ramTotal)}`} percentage={ramPercentage} tone="teal"/>
                <Stat icon={SlidersHorizontal} label="SERVICIOS" value={servicesLoaded ? number(services.length) : "—"} sub="Consultados al abrir Servicios"/>
                <Stat icon={Wrench} label="OPCIONALES" value={servicesLoaded ? number(totals.optional) : "—"} sub="Según tus preferencias"/>
              </div>
              <div className="section-caption"><h3>INFORMACIÓN DEL EQUIPO</h3></div>
              <div className="info-grid">
                <div className="panel information-panel">
                  <div className="panel-title"><h3>Hardware</h3><Cpu size={17}/></div>
                  <div className="info-line"><span>Procesador</span><strong>{overview?.cpu || '—'}</strong></div>
                  <div className="info-line"><span>Gráficos</span><strong>{overview?.gpus?.join(', ') || 'No detectados'}</strong></div>
                  <div className="info-line"><span>RAM instalada</span><strong>{size(overview?.ramTotal)}</strong></div>
                  <div className="info-line"><span>Sistema operativo</span><strong>{overview?.windows || '—'}</strong></div>
                </div>
                <div className="panel information-panel">
                  <div className="panel-title"><h3>Accesos rápidos</h3><ArrowUpRight size={17}/></div>
                  <button className="quick-link" onClick={() => openServices('optional')}><span className="quick-icon"><SlidersHorizontal size={19}/></span><span><strong>Servicios opcionales</strong><small>Consulta funciones que has marcado como no utilizadas.</small></span><ChevronRight size={18}/></button>
                  <button className="quick-link" onClick={() => setPage('seguridad')}><span className="quick-icon"><ShieldCheck size={19}/></span><span><strong>Seguridad de Windows</strong><small>Comprueba el estado de integridad de memoria (HVCI).</small></span><ChevronRight size={18}/></button>
                </div>
              </div>
            </>}

            {page === 'servicios' && <>
              <Heading title="Servicios de Windows" description="Administra servicios según su función, estado y utilidad." action={<button className="btn btn-dark" onClick={() => refresh()} disabled={refreshing}><RefreshCw size={16}/> Actualizar</button>}/>
              <div className="overview-strip">
                <div><span>SERVICIOS DETECTADOS</span><strong>{number(services.length)}</strong></div>
                <div><span>OPCIONALES PARA TI</span><strong className="text-teal">{number(totals.optional)}</strong></div>
                <div><span>QUE CONVIENE EVALUAR</span><strong>{number(totals.consider)}</strong></div>
                <div><span>DESHABILITADOS</span><strong>{number(startCounts.Disabled || 0)}</strong></div>
              </div>
              {servicesLoading && <div className="neutral-note">Consultando servicios de Windows en segundo plano. Puedes seguir utilizando VORTEX.</div>}
              <div className="startup-summary"><span>Inicio automático <strong>{number((startCounts.Automatic || 0) + (startCounts.AutomaticDelayed || 0))}</strong></span><span>Manual <strong>{number(startCounts.Manual || 0)}</strong></span><span>Deshabilitados <strong>{number(startCounts.Disabled || 0)}</strong></span></div>
              <section className="preferences-block">
                <button className="preferences-toggle" onClick={() => setPreferencesOpen(value => !value)}><span><Settings size={18}/><strong>Funciones que utilizas</strong><small>Personaliza las recomendaciones</small></span><ChevronDown size={18} className={preferencesOpen ? 'chevron-up' : ''}/></button>
                {preferencesOpen && <div className="preferences-grid">{preferenceOptions.map(option => <div className="preference preference-help" key={option.key} onContextMenu={event => openPreferenceMenu(event, option)}><label><input type="checkbox" checked={preferences[option.key] !== false} onChange={event => setPreferences(previous => ({ ...previous, [option.key]: event.target.checked }))}/><span>{option.label}</span></label><button type="button" className="preference-info" aria-label={`Ver detalles de ${option.label}`} onClick={() => setPreferenceDetail(option)}><Info size={14}/></button><span className="preference-tooltip">{preferenceDetails[option.key]?.short}</span></div>)}</div>}
              </section>
              <div className="service-toolbar">
                <div className="search"><Search size={17}/><input placeholder="Buscar por nombre, función o descripción" aria-label="Buscar servicio" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Borrar búsqueda"><X size={15}/></button>}</div>
                <select className="startup-filter" aria-label="Filtrar por tipo de inicio" value={startFilter} onChange={event => setStartFilter(event.target.value)}><option value="all">Cualquier inicio</option><option value="Automatic">Automático</option><option value="AutomaticDelayed">Auto. retrasado</option><option value="Manual">Manual</option><option value="Disabled">Deshabilitado</option></select>
                <div className="filter-group">{filters.map(item => <button key={item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? 'active-filter' : ''}>{item.label}</button>)}</div>
              </div>
              <div className="service-columns">
                <section className="panel services-panel">
                  <div className="list-heading"><strong>Servicios</strong><span>{number(visibleServices.length)} de {number(services.length)}</span></div>
                  <div className="service-scroll">{visibleServices.length ? visibleServices.map(service => <button key={service.name} onClick={() => selectService(service)} className={`service-row ${selected?.name === service.name ? 'row-selected' : ''}`}>
                    <span className={`service-state ${service.state === 'Running' ? 'is-running' : ''}`}/>
                    <span className="service-row-main"><strong>{service.displayName}</strong><small>{service.name}</small></span>
                    <span className={`start-badge start-${service.startMode}`} title="Tipo de inicio del servicio">{labels[service.startMode] || service.startMode}</span>
                    <Tag tone={service.advice.level === 'optional' ? 'teal' : service.advice.level === 'consider' ? 'amber' : service.advice.protected ? 'locked' : 'muted'}>{service.advice.title}</Tag>
                    <ChevronRight size={15} className="row-chevron"/>
                  </button>) : <Empty title="Sin resultados" description="Prueba otro filtro, o busca un servicio por nombre."/>}</div>
                </section>
                <section className="panel details-panel">
                  {selected ? <>
                    <div className="detail-header"><div><span className="detail-caption">DETALLES DEL SERVICIO</span><h2>{selected.displayName}</h2><p>{selected.name}</p></div><Tag tone={selected.advice.protected ? 'locked' : selected.advice.level === 'optional' ? 'teal' : selected.advice.level === 'consider' ? 'amber' : 'muted'}>{selected.advice.title}</Tag></div>
                    <div className="detail-split"><div><span>ESTADO</span><strong><i className={`state-dot ${selected.state === 'Running' ? 'state-on' : ''}`}/>{labels[selected.state] || selected.state}</strong></div><div><span>TIPO DE INICIO</span><strong>{labels[selected.startMode] || selected.startMode}</strong></div></div>
                    <div className="detail-section"><span className="detail-label">¿PARA QUÉ SIRVE?</span><p>{selected.advice.description}</p>{!selected.advice.description?.trim() && <p>Windows no ofrece una descripción para este servicio.</p>}</div>
                    <div className="recommendation"><div><Info size={17}/><strong>Recomendación de VORTEX</strong></div><p>{selected.advice.reason}</p></div>
                    <div className="change-section"><span className="detail-label">CAMBIAR TIPO DE INICIO</span><div className="mode-control"><select value={targetMode} onChange={event => setTargetMode(event.target.value)} disabled={!eligible || busy}><option value="Automatic">Automático</option><option value="AutomaticDelayed">Automático (retrasado)</option><option value="Manual">Manual</option><option value="Disabled">Deshabilitado</option></select><button className="btn btn-lime" disabled={!eligible || busy || targetMode === selected.startMode || !overview?.compatible} onClick={() => openPending({ kind: 'change', name: selected.name, displayName: selected.displayName, mode: targetMode, before: selected.startMode, advanced: advanced || selected.advice.advanced })}>Aplicar <ArrowRight size={16}/></button></div>
                    {selected.advice.protected ? <p className="helper-text"><LockKeyhole size={13}/> Componente crítico: los cambios están bloqueados.</p> : selected.advice.advanced && !advanced ? <p className="helper-text">Activa el modo avanzado para modificar este servicio.</p> : <p className="helper-text">El tipo de inicio cambia; no se detiene ningún proceso activo.</p>}
                    </div>
                    <div className="advanced-area"><label className="switch-row"><span><strong>Modo avanzado</strong><small>Permite modificar servicios no incluidos en las recomendaciones. Los críticos permanecen protegidos.</small></span><input type="checkbox" checked={advanced} onChange={event => setAdvanced(event.target.checked)}/><span className="switch"/></label></div>
                  </> : <Empty title="Selecciona un servicio" description="Elige un servicio de la lista para ver sus detalles y opciones de inicio."/>}
                </section>
              </div>
              <div className="bottom-explanation"><Info size={15}/><span>Se muestran primero los servicios relevantes. La pestaña «Todos» incluye servicios de Windows y aplicaciones, aunque no exista una recomendación específica. Ninguna modificación garantiza más FPS.</span></div>
            </>}

            {page === 'seguridad' && <>
              <Heading title="Seguridad del sistema" description="Consulta protecciones importantes antes de modificar Windows."/>
              <div className="security-layout"><section className="panel security-panel"><div className="security-top"><ShieldCheck size={24}/><Tag tone={hvci?.running ? 'teal' : hvci?.available ? 'amber' : 'muted'}>{hvci?.available ? hvci.running ? 'ACTIVA' : 'NO ACTIVA' : 'NO DISPONIBLE'}</Tag></div><h2>Integridad de memoria (HVCI)</h2><p>Protección del código del núcleo de Windows basada en virtualización.</p><div className="info-line"><span>Estado actual</span><strong>{hvci?.available ? hvci.running ? 'En funcionamiento' : hvci.configured ? 'Configurada, pero no activa' : 'No activa' : 'No se pudo consultar'}</strong></div><div className="neutral-note"><AlertTriangle size={19}/><span>HVCI es una medida importante de seguridad. Esta versión consulta su estado, pero no la desactiva en busca de rendimiento.</span></div></section><section className="panel security-panel"><div className="security-top"><LockKeyhole size={24}/><Tag>ACTIVO</Tag></div><h2>Protección de servicios</h2><p>VORTEX permite ajustes manuales avanzados sin desbloquear componentes críticos.</p><div className="rules"><div><Check size={17}/> Confirmación individual antes de cambiar</div><div><Check size={17}/> Registro del inicio anterior</div><div><Check size={17}/> Restauración desde el historial</div><div><Check size={17}/> Servicios críticos bloqueados</div></div></section></div>
            </>}

            {page === 'historial' && <>
              <Heading title="Historial de cambios" description="Revisa tus ajustes y restaura una configuración anterior."/>
              <section className="panel history-panel"><div className="list-heading"><strong>Movimientos registrados</strong><span>{number(history.length)} en total</span></div>{history.length ? history.map(entry => <div key={entry.id} className="history-row"><span className="history-icon"><FileClock size={18}/></span><span className="history-main"><strong>{entry.name}</strong><small>{labels[entry.previousMode] || entry.previousMode} <ArrowRight size={12}/> {labels[entry.newMode] || entry.newMode}<span className="history-date">{date(entry.createdAt)}</span></small></span>{entry.restoredAt ? <Tag tone="teal">Restaurado</Tag> : <button className="btn btn-dark btn-small" disabled={busy} onClick={() => openPending({ kind: 'restore', id: entry.id, name: entry.name, displayName: entry.name, mode: entry.previousMode })}><RotateCcw size={14}/> Restaurar</button>}</div>) : <Empty title="Aún no hay cambios" description="Tus cambios de servicios se guardarán aquí para poder restaurarlos."/>}</section>
            </>}

            {page === 'memoria' && <MemoryPage api={api} overview={overview}/>}
            {page === 'juegos' && <GamesPage api={api} onOpenRules={() => setPage('reglas')}/>}
            {page === 'reglas' && <RulesPage api={api}/>}
            {page === 'startup' && <StartupPage api={api} admin={admin} elevate={elevate}/>}
          </>}
          <div className="workspace-footer"><span>VORTEX · WINDOWS OPTIMIZER</span><span>Las optimizaciones requieren tu confirmación o una programación explícita.</span></div>
        </div>
      </main>

      {contextMenu && <div className="preference-context" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={event => { event.stopPropagation(); setPreferenceDetail(contextMenu.option); setContextMenu(null); }}><Info size={15}/> Ver detalles</button></div>}
      {preferenceDetail && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPreferenceDetail(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="preference-title"><div className="modal-top"><Info size={23}/><button onClick={() => setPreferenceDetail(null)} aria-label="Cerrar"><X size={18}/></button></div><h2 id="preference-title">{preferenceDetail.label}</h2><p>{preferenceDetails[preferenceDetail.key]?.full}</p><p><strong>Servicios relacionados:</strong> {preferenceDetails[preferenceDetail.key]?.services}</p><p className="modal-warning">Desmarcar esta función cambia las recomendaciones; no modifica Windows automáticamente.</p><div className="modal-buttons"><button className="btn btn-lime" onClick={() => setPreferenceDetail(null)}>Entendido</button></div></div></div>}
      {pending && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setPending(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading"><div className="modal-top"><AlertTriangle size={23}/><button aria-label="Cerrar" onClick={() => setPending(null)} disabled={busy}><X size={19}/></button></div><h2 id="modal-heading">{pending.kind === 'change' ? 'Confirmar modificación' : 'Restaurar servicio'}</h2><p>Estás a punto de modificar <strong>{pending.displayName}</strong>.</p><div className="modal-comparison"><span>{pending.kind === 'change' ? labels[pending.before] || pending.before : 'Configuración actual'}</span><ArrowRight size={16}/><strong>{labels[pending.mode] || pending.mode}</strong></div><p className="modal-warning">{pending.kind === 'change' ? 'El cambio puede afectar funciones de Windows y requerir reinicio. Se guardará el valor anterior para intentar restaurarlo después.' : 'El cambio solo puede restaurarse si la configuración sigue igual a la registrada.'}</p>{requiringName && <div className="confirmation-field"><label htmlFor="confirm-name">Para continuar, escribe <strong>{pending.name}</strong></label><input id="confirm-name" placeholder="Nombre exacto del servicio" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoFocus/></div>}<div className="modal-buttons"><button className="btn btn-dark" onClick={() => setPending(null)} disabled={busy}>Cancelar</button><button className="btn btn-lime" onClick={applyPending} disabled={!canConfirm || busy}>{busy ? 'Aplicando…' : 'Confirmar cambio'}</button></div></div></div>}
    </div>
  );
}

export default App;
