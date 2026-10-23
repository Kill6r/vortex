import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Monitor, RotateCcw, RefreshCw, ShieldCheck } from 'lucide-react';
import { visualSettings } from '../core/windows-tweaks.js';

function Section({ title, description, children }) {
  return <section className="panel vt-card"><div className="vt-head"><h2>{title}</h2><p>{description}</p></div>{children}</section>;
}

function Message({ message }) {
  return message ? <div className={`vt-notice ${message.error ? 'vt-error' : ''}`}>{message.text}</div> : null;
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
        <div><strong>{item.title}</strong><small>{item.description}</small><span className="vt-status">{state?.[key] === null || state?.[key] === undefined ? 'Estado no determinado' : state[key] ? 'Activado' : 'Desactivado'}</span></div>
        <div className="vt-actions"><button className="btn btn-dark" disabled={busy} onClick={() => change(key, false)}>Desactivar</button><button className="btn btn-dark" disabled={busy} onClick={() => change(key, true)}>Activar</button><button className="vt-icon" title="Restaurar valor original" disabled={busy} onClick={() => restore(key)}><RotateCcw size={16}/></button></div>
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
  async function refresh() { try { setStatus(await api.graphicsStatus()); } catch (error) { setNotice({ error: true, text: error.message }); } }
  useEffect(() => { void refresh(); }, []);
  async function hags(enabled) {
    if (!window.confirm(`¿Quieres ${enabled ? 'solicitar la activacion' : 'solicitar la desactivacion'} de HAGS? Es necesario reiniciar Windows. Puede no ser compatible con tu hardware.`)) return;
    setBusy(true);
    try { await api.setHags(enabled); setNotice({ text: 'Valor de HAGS guardado. Reinicia el equipo y comprueba el ajuste real en Windows.' }); await refresh(); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  async function restoreHags() {
    if (!window.confirm('Restaurar el valor original de HAGS? Sera necesario reiniciar Windows.')) return;
    setBusy(true);
    try { await api.restoreHags(); setNotice({ text: 'Valor original de HAGS restaurado. Reinicia el equipo.' }); await refresh(); }
    catch (error) { setNotice({ error: true, text: error.message }); }
    finally { setBusy(false); }
  }
  return <div className="vt-wrap"><div className="page-heading"><div><h1>Graficos y GPU</h1><p>Opciones del controlador y del sistema, con verificacion de compatibilidad.</p></div><button className="btn btn-dark" onClick={refresh}><RefreshCw size={15}/> Actualizar</button></div>
    <Message message={notice}/>
    <Section title="Programacion de GPU acelerada por hardware (HAGS)" description="Este ajuste depende de Windows, del controlador y de la GPU.">
      <div className="vt-row"><div><strong>Estado solicitado</strong><small>{status?.hags === 'solicitado-activado' ? 'Activado en el registro. Pendiente de confirmar tras reiniciar.' : status?.hags === 'solicitado-desactivado' ? 'Desactivado en el registro. Pendiente de confirmar tras reiniciar.' : 'Controlado por Windows o sin valor explicito.'}</small><span className="vt-status">No confirma compatibilidad ni estado efectivo</span></div><div className="vt-actions"><button className="btn btn-dark" disabled={busy} onClick={() => hags(false)}>Desactivar</button><button className="btn btn-dark" disabled={busy} onClick={() => hags(true)}>Activar</button><button className="vt-icon" disabled={busy} title="Restaurar HAGS" onClick={restoreHags}><RotateCcw size={16}/></button></div></div>
      <div className="vt-row"><div><strong>Comprobar en Windows</strong><small>Verifica si HAGS esta disponible y activo en la configuracion grafica de Windows.</small></div><button className="btn btn-dark" onClick={() => api.openSystemSetting('graphics')}><ExternalLink size={15}/> Abrir ajustes</button></div>
    </Section>
    <Section title="Resizable BAR (ReBAR)" description="ReBAR se controla normalmente desde BIOS/UEFI y requiere soporte de GPU, placa, firmware y controlador.">
      <div className="vt-row"><div><strong>Estado de ReBAR</strong><small>{status?.rebar?.description || 'Consultando compatibilidad...'}</small><span className="vt-status">No verificado desde VORTEX</span></div></div>
      <div className="vt-row"><div><strong>GPU detectadas</strong><small>{status?.gpus?.join(', ') || 'Sin informacion disponible'}</small></div></div>
    </Section>
    <div className="vt-hint"><AlertTriangle size={17}/> No hay un interruptor universal y fiable para ReBAR desde Windows. No vamos a modificar la BIOS ni a inventar un estado activo.</div>
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
