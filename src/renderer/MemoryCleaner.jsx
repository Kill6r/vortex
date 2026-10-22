import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, HardDrive, RefreshCw, ShieldAlert, Timer, Save } from 'lucide-react';

const megabytes = value => value == null ? '—' : `${Math.round(Number(value) / 1048576).toLocaleString('es-CO')} MB`;

export default function MemoryCleaner({ api, revision = 0 }) {
  const [state, setState] = useState(null);
  const [schedule, setSchedule] = useState({ enabled: false, intervalMinutes: 60, mode: 'low', acknowledged: false });
  const [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState('low');
  const [force, setForce] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elevating, setElevating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const fetching = useRef(false);

  async function refresh(updateSchedule = false) {
    if (!api || fetching.current) return;
    fetching.current = true;
    try {
      const response = await api.standbySnapshot();
      setState(response);
      if (updateSchedule) setSchedule(response.schedule);
    } catch (cause) {
      setError(cause.message || 'No se pudo consultar la memoria.');
    } finally {
      fetching.current = false;
    }
  }

  useEffect(() => {
    void refresh(true);
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [api, revision]);

  async function applyClean() {
    if (busy) return;
    setConfirm(false);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.purgeStandby({
        mode,
        confirmed: true,
        force: force || mode === 'all',
        riskAccepted: true
      });
      setResult(response);
      setNotice('La operación terminó. Comprueba si el equipo responde con normalidad.');
      await refresh();
    } catch (cause) {
      setError(cause.message || 'No se pudo ejecutar la limpieza.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.configureStandby({ ...schedule, mode: 'low', acknowledged: false });
      setSchedule(response);
      setNotice('Programación guardada. También se incluye en los perfiles de memoria.');
      await refresh();
    } catch (cause) {
      setError(cause.message || 'No se pudo guardar la programación.');
    } finally {
      setBusy(false);
    }
  }

  async function enableAdmin() {
    if (elevating) return;
    setElevating(true);
    try {
      await api.requestAdmin();
    } catch (cause) {
      setError(cause.message || 'No se pudieron solicitar permisos.');
      setElevating(false);
    }
  }

  return <>
    <div className="section-caption"><h3>LIMPIAR MEMORIA</h3><span>Herramientas de Windows</span></div>
    <section className="panel memory-section clean-memory-panel">
      <div className="clean-memory-head">
        <div><h3>Limpiar memoria en espera</h3><p>Opción principal: liberar caché de baja prioridad. Windows normalmente reutiliza esta memoria sin intervención.</p></div>
        <button className="btn btn-dark" disabled={busy} aria-label="Actualizar estado de memoria" onClick={() => refresh()}><RefreshCw size={15}/> Actualizar</button>
      </div>
      <div className="clean-memory-stats">
        <div><span>Memoria en espera</span><strong>{state?.supported ? megabytes(state.standby) : 'No disponible'}</strong></div>
        <div><span>Baja prioridad</span><strong>{state?.supported ? megabytes(state.low) : '—'}</strong></div>
        <div><span>RAM disponible</span><strong>{state?.supported ? megabytes(state.available) : '—'}</strong></div>
      </div>
      {error && <div className="inline-error"><AlertTriangle size={15}/>{error}</div>}
      {notice && <div className="memory-report"><CheckCircle2 size={15}/>{notice}</div>}
      {state?.supported && !state.elevated && <div className="standby-permission"><span><ShieldAlert size={16}/> Para utilizar esta limpieza necesitas permisos de administrador.</span><button className="btn btn-dark" disabled={elevating} onClick={enableAdmin}>{elevating ? 'Solicitando…' : 'Activar administrador'}</button></div>}
      <div className="clean-memory-actions">
        <button className="btn btn-primary" disabled={busy || !state?.supported || !state?.elevated || !state?.allowed} onClick={() => { setMode('low'); setForce(false); setConfirm(true); }}><HardDrive size={16}/> Limpiar memoria</button>
        <button className="btn btn-dark" aria-expanded={advanced} onClick={() => setAdvanced(current => !current)}><ChevronDown size={16}/> Opciones avanzadas</button>
      </div>
      {state?.restriction && !advanced && <p className="v06-note">Limpieza recomendada no disponible: {state.restriction} Puedes consultar las opciones avanzadas si necesitas ejecutarla manualmente.</p>}
      {advanced && <div className="clean-memory-advanced">
        <label>Tipo de limpieza<select value={mode} onChange={event => { setMode(event.target.value); setForce(event.target.value === 'all'); }}><option value="low">Solo caché de baja prioridad</option><option value="all">Toda la caché en espera (riesgo alto)</option></select></label>
        {mode === 'low' && <label className="v06-check"><input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)}/> Permitir una ejecución manual fuera de los límites recomendados</label>}
        <p className="v06-note">Vaciar toda la caché puede congelar Windows y empeorar las cargas de juegos. Nunca se programará automáticamente.</p>
        <button className="btn btn-dark" disabled={busy || !state?.supported || !state?.elevated || (mode === 'low' && !force && !state?.allowed)} onClick={() => setConfirm(true)}>Ejecutar limpieza seleccionada</button>
      </div>}
      {result && <div className="memory-report"><CheckCircle2 size={15}/>Antes: {megabytes(result.standbyBefore)} · Después: {megabytes(result.standbyAfter)}</div>}
      <div className="clean-memory-schedule">
        <div className="section-with-icon"><Timer size={18}/><div><h3>Limpieza programada</h3><p>Solo la opción conservadora, si falta RAM y no hay un juego protegido. Funciona mientras VORTEX esté abierto.</p></div></div>
        <div className="v06-controls"><label>Comprobar cada<select value={schedule.intervalMinutes} onChange={event => setSchedule(current => ({ ...current, intervalMinutes: Number(event.target.value) }))}>{[60, 90, 120, 180, 240, 360, 720].map(value => <option key={value} value={value}>{value / 60} {value === 60 ? 'hora' : 'horas'}</option>)}</select></label><label className="v06-check"><input type="checkbox" checked={schedule.enabled} onChange={event => setSchedule(current => ({ ...current, enabled: event.target.checked }))}/> Activar limpieza programada</label><button className="btn btn-dark" disabled={busy || (schedule.enabled && !state?.elevated)} onClick={saveSchedule}><Save size={14}/> Guardar programación</button></div>
        {schedule.enabled && !state?.elevated && <p className="v06-note">Activa los permisos de administrador antes de guardar la programación.</p>}
      </div>
    </section>
    {confirm && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="clean-confirm-title">
      <div className="modal-top"><AlertTriangle size={22}/></div>
      <h2 id="clean-confirm-title">Confirmar limpieza de memoria</h2>
      <p>{mode === 'all' ? 'Vas a vaciar toda la caché en espera. Esta acción ya produjo congelamientos en tu equipo y puede volver a ocurrir.' : force ? 'Vas a ejecutar la limpieza fuera de los límites recomendados. Puede haber pausas y recargas.' : 'Se intentará limpiar únicamente la caché de baja prioridad. No necesariamente mejorará el rendimiento.'}</p>
      <div className="modal-buttons"><button className="btn btn-dark" onClick={() => setConfirm(false)}>Cancelar</button><button className="btn btn-dark" disabled={busy} onClick={applyClean}>{busy ? 'Procesando…' : 'Confirmar limpieza'}</button></div>
    </div></div>}
  </>;
}
