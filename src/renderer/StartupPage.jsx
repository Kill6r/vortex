import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MonitorUp, RefreshCw, ShieldCheck, PanelTopClose } from 'lucide-react';

export default function StartupPage({ api, admin, elevate }) {
  const [startup, setStartup] = useState(null);
  const [optimizer, setOptimizer] = useState({ enabled: false });
  const [windowPrefs, setWindowPrefs] = useState({ minimizeToTray: true });
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api?.startupStatus().then(setStartup).catch(e => setError(e.message));
    api?.optimizerStatus().then(setOptimizer).catch(e => setError(e.message));
    api?.windowSettings().then(setWindowPrefs).catch(e => setError(e.message));
    api?.updateStatus().then(setUpdate).catch(() => {});
    const interval = setInterval(() => api?.updateStatus().then(setUpdate).catch(() => {}), 2500);
    return () => clearInterval(interval);
  }, []);

  async function checkUpdate() {
    setBusy(true); setError('');
    try { setUpdate(await api.checkUpdates()); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }


  async function changeStartup(enabled) {
    setBusy(true); setError(''); setMessage('');
    try { setStartup(await api.setStartup(enabled)); setMessage(enabled ? 'VORTEX se abrirá al iniciar sesión en Windows.' : 'VORTEX ya no se abrirá automáticamente.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading"><div><h1>Ajustes</h1><p>Personaliza el inicio de VORTEX y gestiona los permisos del sistema.</p></div><button className="btn btn-dark" onClick={() => api.startupStatus().then(setStartup)}><RefreshCw size={15}/> Actualizar</button></div>
    {error && <div className="inline-error"><AlertTriangle size={16}/>{error}</div>}
    {message && <div className="memory-report"><CheckCircle2 size={16}/>{message}</div>}
    <section className="panel memory-section"><div className="section-with-icon"><ShieldCheck size={20}/><div><h3>Protección del rendimiento</h3><p>Las reglas automáticas se encuentran pausadas después de esta actualización para evitar que afecten los juegos. Puedes reactivarlas manualmente cuando hayas revisado tus perfiles.</p></div></div><label className="v06-start-switch"><span><strong>Optimizaciones automáticas</strong><small>{optimizer.enabled ? 'Activas: pueden modificar procesos según las reglas guardadas.' : 'Pausadas: ninguna regla automática modifica procesos.'}</small></span><input type="checkbox" disabled={busy} checked={optimizer.enabled} onChange={async e => { setBusy(true); setError(''); try { setOptimizer(await api.setAutomaticOptimizations(e.target.checked)); } catch (error) { setError(error.message); } finally { setBusy(false); } }}/></label><p className="v06-note">Los cambios manuales siguen disponibles. Para una comparación fiable de FPS, deja las automatizaciones pausadas y prueba cada ajuste por separado.</p></section>
    <section className="panel memory-section"><div className="section-with-icon"><MonitorUp size={20}/><div><h3>Iniciar VORTEX con Windows</h3><p>Abre la aplicación al iniciar sesión. Esto permite recuperar tus perfiles y volver a iniciar sus supervisiones mientras VORTEX permanezca abierto.</p></div></div><label className="v06-start-switch"><span><strong>Inicio automático</strong><small>Se aplica a tu usuario de Windows.</small></span><input type="checkbox" disabled={busy || !startup?.supported || !startup?.packaged} checked={Boolean(startup?.enabled)} onChange={e => changeStartup(e.target.checked)}/></label>{startup && !startup.packaged && <div className="v06-note">En npm run dev no se puede iniciar VORTEX automáticamente sin el servidor Vite. Compila e instala la aplicación para activar esta opción de forma fiable.</div>}</section>
    <div className="section-caption"><h3>BANDEJA DEL SISTEMA</h3></div>
    <section className="panel memory-section"><div className="section-with-icon"><PanelTopClose size={20}/><div><h3>Minimizar junto al reloj</h3><p>Al minimizar, VORTEX se oculta en la bandeja de Windows, pero mantiene activos los perfiles y la supervisión. Haz clic en su icono para restaurarlo.</p></div></div><label className="v06-start-switch"><span><strong>Minimizar a la bandeja</strong><small>La X sigue cerrando el programa.</small></span><input type="checkbox" checked={windowPrefs.minimizeToTray} onChange={async e => { try { setWindowPrefs(await api.setWindowSettings({ minimizeToTray: e.target.checked })); } catch (error) { setError(error.message); } }}/></label><div className="memory-actions"><span>VORTEX seguirá ejecutándose en segundo plano</span><button className="btn btn-dark" onClick={() => api.minimizeToTray()}>Minimizar ahora</button></div></section>
    <div className="section-caption"><h3>ACTUALIZACIONES</h3></div>
    <section className="panel memory-section"><div className="section-with-icon"><MonitorUp size={20}/><div><h3>Actualizar VORTEX</h3><p>Las versiones instaladas pueden buscar, descargar e instalar actualizaciones sin tener que descargar el setup de nuevo.</p></div></div>
      <div className="memory-actions"><span>{update?.state === 'ready' ? `Versión ${update.available} descargada` : update?.state === 'downloading' ? `Descargando actualización: ${update.progress}%` : update?.state === 'up-to-date' ? 'Estás utilizando la versión más reciente' : update?.state === 'checking' ? 'Buscando actualizaciones…' : update?.state === 'available' ? `Nueva versión: ${update.available}` : update?.state === 'error' ? 'No se pudieron buscar actualizaciones' : update?.state === 'unconfigured' ? 'No disponible en modo desarrollo o sin canal configurado' : 'Listo para buscar actualizaciones'}</span>
        {update?.state === 'ready' ? <button className="btn btn-lime" onClick={() => api.installUpdate().catch(error => setError(error.message))}>Instalar y reiniciar</button> : <button className="btn btn-dark" disabled={busy || update?.state === 'unconfigured' || update?.state === 'downloading'} onClick={checkUpdate}>Buscar actualizaciones</button>}
      </div><p className="v06-note">{update?.detail || 'Las actualizaciones requieren un instalador NSIS y versiones publicadas en GitHub Releases o un servidor HTTPS configurado.'}</p></section>
    <div className="section-caption"><h3>PERMISOS</h3></div>
    <section className="panel memory-section"><div className="section-with-icon"><ShieldCheck size={20}/><div><h3>Administrador</h3><p>Algunas operaciones de servicios y limpieza de memoria necesitan permisos elevados. Puedes solicitarlos con el cuadro de confirmación de Windows.</p></div></div><div className="memory-actions"><span>{admin?.enabled ? 'Administrador activo' : 'Modo normal: sin permisos elevados'}</span><button className="btn btn-dark" disabled={admin?.enabled} onClick={elevate}>{admin?.enabled ? 'Ya está habilitado' : 'Activar administrador'}</button></div><p className="v06-note">Activar el inicio automático no concede privilegios de administrador. Windows requerirá la autorización UAC cuando solicites elevación. No se desactivará UAC ni se instalarán servicios privilegiados.</p></section>
  </>;
}
