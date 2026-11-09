import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Monitor, RotateCcw, RefreshCw, ShieldCheck } from 'lucide-react';
import { visualSettings } from '../core/windows-tweaks.js';

function Section({ title, description, children }) {
  return <section className="panel vt-card"><div className="vt-head"><h2>{title}</h2><p>{description}</p></div>{children}</section>;
}

function Message({ message }) {
  return message ? <div className={`vt-notice ${message.error ? 'vt-error' : ''}`}>{message.text}</div> : null;
}

function Status({ enabled, requested = false }) {
  const label = enabled === null || enabled === undefined ? 'No verificado' : enabled ? 'Activado' : 'Desactivado';
  const color = enabled === null || enabled === undefined ? 'unknown' : enabled ? 'on' : 'off';
  return <span className={`vt-status vt-status-${color}`} aria-live="polite"><span className="vt-status-dot"/>{requested ? 'Configurado: ' : ''}{label}</span>;
}

function Choice({ enabled, change, busy, refresh, refreshBusy = false, restore = null }) {
  return <div className="vt-actions vt-choice-actions">
    <button type="button" className={`v91-switch ${enabled === true ? 'v91-switch-on' : enabled === null || enabled === undefined ? 'v91-switch-unknown' : ''}`} role="switch" aria-checked={enabled === true} aria-label={enabled === true ? 'Desactivar ajuste' : 'Activar ajuste'} title={enabled === true ? 'Desactivar ajuste' : enabled === false ? 'Activar ajuste' : 'Aplicar ajuste y comprobar'} disabled={busy} onClick={() => change(enabled !== true)}><span className="v91-switch-knob"/></button>
    {refresh ? <button className="vt-icon vt-refresh-icon" type="button" title="Volver a comprobar en Windows" aria-label="Actualizar estado" disabled={busy || refreshBusy} onClick={refresh}><RefreshCw size={16} className={refreshBusy ? 'rotate' : ''}/></button> : null}
    {restore ? <button className="vt-icon" type="button" title="Restaurar valor original" aria-label="Restaurar valor original" disabled={busy} onClick={restore}><RotateCcw size={16}/></button> : null}
  </div>;
}

export function WindowsTweaksPage({ api }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  async function refresh() {
    try { setState(await api.visualSettings()); }
    catch (error) { setNotice({ error: true, text: error.message }); }
  }
  useEffect(() => { void refresh(); }, []);
  async function change(key, enabled) {
    if (!window.confirm(`¿Quieres ${enabled ? 'activar' : 'desactivar'} ${visualSettings[key].title.toLowerCase()}? VORTEX guardara el valor anterior.`)) return;
    setBusy(true);
    try {
      const result = await api.setVisualSetting(key, enabled);
      setNotice({ text: `${visualSettings[key].title}: cambio confirmado. ${result.note}` });
      await refresh();
    } catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  async function restore(key) {
    setBusy(true);
    try { await api.restoreVisualSetting(key); setNotice({ text: 'Valor original restaurado.' }); await refresh(); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="vt-wrap">
    <div className="page-heading"><div><h1>Ajustes de Windows</h1><p>Reduce efectos visuales sin modificar servicios ni jugar con prioridades.</p></div><button className="btn btn-dark" onClick={refresh}><RefreshCw size={15}/> Actualizar</button></div>
    <Message message={notice}/>
    <Section title="Efectos visuales" description="Los cambios se aplican al perfil actual de Windows, no a todos los usuarios.">
      {Object.entries(visualSettings).map(([key, item]) => <div className="vt-row" key={key}>
        <div className="vt-row-description"><strong>{item.title}</strong><small>{item.description}</small><Status enabled={state?.[key]}/></div>
        <Choice enabled={state?.[key]} change={enabled => change(key, enabled)} busy={busy} restore={() => restore(key)}/>
      </div>)}
    </Section>
    <Section title="Opciones de rendimiento" description="Windows permite ajustar otros efectos de forma individual.">
      <div className="vt-row"><div><strong>Configuracion visual avanzada</strong><small>Sombras, animaciones, desplazamientos y miniaturas. Puedes elegir Ajustar para obtener el mejor rendimiento.</small></div><button className="btn btn-dark" onClick={() => api.openSystemSetting('visualPerformance')}><ExternalLink size={15}/> Abrir</button></div>
      <div className="vt-row"><div><strong>Modo de energia</strong><small>El modo de alto rendimiento puede aumentar consumo y temperatura, especialmente en portatiles.</small></div><button className="btn btn-dark" onClick={() => api.openSystemSetting('power')}><ExternalLink size={15}/> Abrir</button></div>
    </Section>
    <div className="vt-hint"><Monitor size={17}/> Desactivar animaciones puede mejorar la respuesta del escritorio, pero no garantiza mas FPS.</div>
  </div>;
}

export function GraphicsPage({ api }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  async function refresh() {
    setRefreshBusy(true);
    try { setStatus(await api.graphicsStatus()); setNotice(null); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setRefreshBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function hags(enabled) {
    if (!window.confirm(`¿Quieres ${enabled ? 'solicitar la activacion' : 'solicitar la desactivacion'} de HAGS? Es necesario reiniciar Windows. Puede no ser compatible con tu hardware.`)) return;
    setBusy(true);
    try { await api.setHags(enabled); setNotice({ text: 'Valor de HAGS guardado. Reinicia el equipo y comprueba el ajuste real en Windows.' }); await refresh(); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="vt-wrap"><div className="page-heading"><div><h1>Graficos y GPU</h1><p>Opciones del controlador y del sistema, con verificacion de compatibilidad.</p></div><button className="btn btn-dark" onClick={refresh}><RefreshCw size={15}/> Actualizar</button></div>
    <Message message={notice}/>
    <Section title="Programacion de GPU acelerada por hardware (HAGS)" description="Lectura de HAGS desde el controlador WDDM y de la configuracion guardada en Windows.">
      <div className="vt-row vt-row-hags">
        <div className="vt-row-description">
          <strong>Estado de HAGS</strong>
          <small>{status?.hagsNote || 'Consultando el estado en Windows...'}</small>
          <Status enabled={status?.hagsEffective?.available ? status.hagsEffective.enabled : null}/>
          <span className="vt-source">{status?.hagsEffective?.available ? `Estado efectivo por WDDM · ${status.hagsEffective.adapters.length} pantalla(s) · ${status.hagsEffective.supported ? "compatible" : "sin soporte de HAGS"}` : `Estado efectivo no disponible · ${status?.hagsEffective?.error || "Sin respuesta de WDDM"}`}</span>
          <span className="vt-source">Configuracion guardada: {status?.hagsValue === 2 ? "activar" : status?.hagsValue === 1 ? "desactivar" : "predeterminada"}</span>
          {status?.hagsPendingRestart && <span className="vt-pending">Reinicio pendiente</span>}
        </div>
        <Choice enabled={status?.hagsEffective?.available ? status.hagsEffective.enabled : status?.hagsValue === 2 ? true : status?.hagsValue === 1 ? false : null} change={hags} busy={busy} refresh={refresh} refreshBusy={refreshBusy}/>
      </div>
      <div className="vt-row"><div><strong>Comprobacion del estado efectivo</strong><small>Actualizar consulta los bits HwSchSupported y HwSchEnabled del controlador WDDM y vuelve a leer el registro.</small></div><button className="btn btn-dark" onClick={() => api.openSystemSetting('graphics')}><ExternalLink size={15}/> Abrir en Windows</button></div>
    </Section>
    <Section title="Resizable BAR (ReBAR)" description="Verificacion automatica del tamano BAR1 con el controlador NVIDIA y respaldo de recursos PCI de Windows.">
      <div className="vt-row"><div className="vt-row-description"><strong>Estado de ReBAR</strong><small>{status?.rebar?.description || 'Consultando recursos PCI...'}</small><span className={`vt-status ${status?.rebar?.state === 'large-bar' ? 'vt-status-on' : status?.rebar?.state === 'small-bar' ? 'vt-status-indicative' : 'vt-status-unknown'}`}>{status?.rebar?.state === 'large-bar' ? 'BAR ampliada detectada' : status?.rebar?.state === 'small-bar' ? 'BAR pequena detectada' : 'No se pudo verificar'}</span><span className="vt-source">Fuente: {status?.rebar?.source || 'Windows'} · {status?.rebar?.adapter || 'GPU'}</span></div><button className="vt-icon vt-refresh-icon" title="Volver a comprobar ReBAR" aria-label="Actualizar ReBAR" disabled={refreshBusy || busy} onClick={refresh}><RefreshCw size={16} className={refreshBusy ? 'rotate' : ''}/></button></div>
      <div className="vt-row"><div><strong>GPU detectadas</strong><small>{status?.gpus?.join(', ') || 'Sin informacion disponible'}</small></div></div>
    </Section>
    <div className="vt-hint"><AlertTriangle size={17}/> ReBAR: el tamano BAR1 confirma la asignacion de memoria, pero no que el driver habilite la funcion para todos los juegos. VORTEX no modifica BIOS ni firmware.</div>
  </div>;
}

export function SecurityPage({ api, hvci }) {
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState(null);
  const [ack, setAck] = useState(false);
  async function load() { try { setStatus(await api.securityStatus()); } catch (error) { setNotice({ error: true, text: error.message }); } }
  useEffect(() => { void load(); }, []);
  const open = async key => { try { await api.openSystemSetting(key); } catch (error) { setNotice({ error: true, text: error.message }); } };
  return <div className="vt-wrap"><div className="page-heading"><div><h1>Seguridad de Windows</h1><p>Consulta las protecciones del equipo y accede a sus controles oficiales.</p></div><button className="btn btn-dark" onClick={load}><RefreshCw size={15}/> Actualizar</button></div>
    <Message message={notice}/>
    <Section title="Microsoft Defender" description="Desactivar el antivirus deja el equipo expuesto y no garantiza mejoras en los juegos.">
      <div className="vt-row"><div><strong>Proteccion en tiempo real</strong><small>{status?.antivirus === true ? 'Activada' : status?.antivirus === false ? 'Desactivada' : 'No disponible o administrada por una organizacion'}. Windows puede impedir cambios desde herramientas externas.</small></div><button className="btn btn-dark" onClick={() => open('defender')}><ShieldCheck size={15}/> Abrir Seguridad de Windows</button></div>
    </Section>
    <Section title="Windows Update" description="Es mejor pausar actualizaciones temporalmente que deshabilitar el servicio permanentemente.">
      <div className="vt-row"><div><strong>Servicio de actualizaciones</strong><small>{status?.updateService || 'No consultado'}. Las actualizaciones incluyen correcciones de seguridad.</small></div><button className="btn btn-dark" onClick={() => open('update')}><ExternalLink size={15}/> Administrar o pausar</button></div>
    </Section>
    <Section title="Integridad de memoria (HVCI)" description="Protege el nucleo del sistema usando seguridad basada en virtualizacion.">
      <div className="vt-row"><div><strong>Estado actual</strong><small>{hvci?.available ? hvci.running ? 'En funcionamiento' : hvci.configured ? 'Configurada, pero no activa' : 'No activa' : 'No se pudo verificar'}</small><label className="vt-ack"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/> Entiendo que desactivar HVCI reduce la seguridad y lo hago bajo mi propio riesgo.</label></div><button className="btn btn-dark" disabled={!ack} onClick={() => open('defender')}><ExternalLink size={15}/> Gestionar en Windows</button></div>
    </Section>
    <div className="vt-hint"><AlertTriangle size={17}/> VORTEX no desactiva el antivirus ni Windows Update por la fuerza. Sus protecciones y permisos siguen bajo control de Windows.</div>
  </div>;
}
