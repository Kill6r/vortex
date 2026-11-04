import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bug, Check, Download, FileClock, Gauge, Image, RefreshCw, Trash2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cleanerTargets, formatCleanerBytes } from '../core/cleaner.js';
import './cleaner.css';

const icons = { FileClock, Gauge, Trash2, Download, Image, Bug };

export default function CleanerPage({ api }) {
  const [snapshot, setSnapshot] = useState(null);
  const [selected, setSelected] = useState(['temp', 'thumbnails', 'errorreports']);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  async function scan(force = false) {
    if (!api?.cleanerScan) return;
    setBusy(true);
    setError('');
    try { setSnapshot(await api.cleanerScan(force)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { void scan(); }, []);

  const visible = cleanerTargets.filter(item => advanced || !item.advanced);
  const chosen = cleanerTargets.filter(item => selected.includes(item.id));
  const bytes = (snapshot?.items || []).filter(item => selected.includes(item.id)).reduce((total, item) => total + (Number(item.bytes) || 0), 0);
  const freed = results?.results?.reduce((total, item) => total + (Number(item.freed) || 0), 0) || 0;

  function toggle(id) {
    setSelected(items => items.includes(id) ? items.filter(x => x !== id) : [...items, id]);
  }

  async function clean() {
    if (!chosen.length || busy) return;
    const warnings = chosen.filter(item => item.advanced || item.destructive);
    const detail = warnings.length ? `\n\nAtencion: ${warnings.map(x => x.title).join(', ')}. Las limpiezas avanzadas pueden afectar el rendimiento o eliminar archivos definitivamente.` : '';
    if (!window.confirm(`¿Quieres limpiar ${chosen.length} categorias? Los archivos eliminados no se podran recuperar.${detail}`)) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const output = await api.cleanerRun(chosen.map(x => x.id), advanced);
      setResults(output);
      setSnapshot(null);
      setSnapshot(await api.cleanerScan(true));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="vcl-page">
    <div className="page-heading"><div><h1>Cleaner</h1><p>Limpia archivos residuales y libera espacio en disco. Independiente de la limpieza de Memoria RAM.</p></div><button className="btn btn-dark" disabled={busy} onClick={() => scan(true)}><RefreshCw size={15}/> Analizar</button></div>
    <section className="vcl-hero">
      <span className="vcl-mark"><Trash2 size={23}/></span>
      <div><h2>Limpiador de archivos</h2><p>{snapshot ? 'Analisis completado' : 'Analiza los residuos antes de eliminarlos'}</p><strong>{snapshot ? formatCleanerBytes(bytes) : '—'} <small>seleccionados</small></strong></div>
      <div className="vcl-hero-actions"><button className="btn btn-dark" disabled={busy} onClick={() => setSelected(selected.length === visible.length ? [] : visible.map(item => item.id))}>{selected.length === visible.length ? 'Deseleccionar todos' : 'Seleccionar todos'}</button><button className="btn btn-lime" disabled={busy || chosen.length === 0} onClick={clean}><Trash2 size={15}/>{busy ? 'Procesando…' : 'Limpiar seleccionados'}</button></div>
    </section>
    {error && <div className="vcl-error"><AlertTriangle size={16}/>{error}</div>}
    {results && <div className="vcl-result"><CheckCircle2 size={17}/><div><strong>Operaciones finalizadas · {formatCleanerBytes(freed)} liberados</strong>{results.results.filter(x => x.error || x.skipped).map(x => <p key={x.id}>{cleanerTargets.find(c => c.id === x.id)?.title}: {x.error || `${x.skipped} archivos bloqueados`}</p>)}</div></div>}
    <section className="vcl-list">
      {visible.map(target => {
        const Icon = icons[target.icon];
        const item = snapshot?.items.find(x => x.id === target.id);
        const checked = selected.includes(target.id);
        return <label key={target.id} className={`vcl-item ${checked ? 'vcl-selected' : ''}`}>
          <input type="checkbox" checked={checked} onChange={() => toggle(target.id)} disabled={busy}/>
          <span className={`vcl-icon vcl-icon-${target.id}`}><Icon size={20}/></span>
          <span className="vcl-description"><strong>{target.title}{target.advanced && <em>Avanzado</em>}</strong><small>{target.description}</small>{target.admin && <small>Requiere administrador</small>}</span>
          <span className="vcl-size">{item?.error ? 'No disponible' : item?.bytes === null || item?.bytes === undefined ? '—' : formatCleanerBytes(item.bytes)}{item?.limited && <small>Estimacion parcial</small>}</span>
        </label>;
      })}
    </section>
    <label className="vcl-advanced"><input type="checkbox" checked={advanced} onChange={e => { setAdvanced(e.target.checked); if (!e.target.checked) setSelected(ids => ids.filter(id => !cleanerTargets.find(t => t.id === id)?.advanced)); }}/><span><strong>Mostrar limpiezas avanzadas</strong><small>Prefetch y descargas de Windows Update. No se recomiendan para uso habitual.</small></span><ShieldAlert size={18}/></label>
    <p className="vcl-note">VORTEX omite archivos en uso y no promete mejoras de FPS. Los tamaños son estimaciones de lectura y solo se contabilizan como liberados los archivos eliminados correctamente.</p>
  </div>;
}
