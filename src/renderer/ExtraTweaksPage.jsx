import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Cpu, Gamepad2, Monitor, Palette, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, Sparkles, Star, Wifi, Wrench, Zap } from 'lucide-react';
import { extraTweaks, getTweakMeta } from '../core/extra-tweaks.js';

const categories = ['Todos', 'Recomendados', 'Personalizacion', 'Escritorio', 'Rendimiento', 'Juegos', 'Privacidad', 'IA'];

const tagDetails = {
  recommended: { title: 'Recomendado por VORTEX', icon: Star, className: 'recommended' },
  performance: { title: 'Optimizacion de rendimiento', icon: Zap, className: 'performance' },
  gaming: { title: 'Optimizacion para juegos', icon: Gamepad2, className: 'gaming' },
  privacy: { title: 'Privacidad', icon: ShieldCheck, className: 'privacy' },
  ai: { title: 'Inteligencia artificial', icon: Sparkles, className: 'ai' },
  appearance: { title: 'Apariencia', icon: Palette, className: 'appearance' },
  general: { title: 'Windows y escritorio', icon: Wrench, className: 'general' }
};

function TweakTags({ tweak, meta }) {
  return <div className="v91-tweak-tags">
    {meta.tags.map(tag => {
      const detail = tagDetails[tag];
      if (!detail) return null;
      const Icon = detail.icon;
      return <span key={tag} className={`v91-tweak-tag v91-tag-${detail.className}`} title={detail.title} aria-label={detail.title}><Icon size={15}/></span>;
    })}
    <span className={`v91-risk-chip v91-risk-${meta.risk}`} title={meta.risk === 'high' ? 'Riesgo alto: revisa la descripcion y advertencias antes de aplicar' : meta.risk === 'caution' ? 'Precaucion: podria afectar funciones que utilizas' : 'Cambio reversible; aun puede depender de la version de Windows'}>
      {meta.risk === 'safe' ? <ShieldCheck size={13}/> : <AlertTriangle size={13}/>}
      {meta.risk === 'high' ? 'Riesgo alto' : meta.risk === 'caution' ? 'Cuidado' : 'Seguro'}
    </span>
  </div>;
}

export default function ExtraTweaksPage({ api }) {
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [details, setDetails] = useState('');

  async function refresh() {
    setBusy('refresh');
    try { setData(await api.extraTweaks()); setError(''); }
    catch (e) { setError(e.message || 'No se pudieron consultar los ajustes.'); }
    finally { setBusy(''); }
  }

  useEffect(() => { void refresh(); }, []);

  async function change(tweak, enabled) {
    const meta = getTweakMeta(tweak);
    const verb = enabled ? 'activar' : 'desactivar';
    const warning = meta.risk === 'high' ? `\n\nADVERTENCIA: ${tweak.description}${tweak.restart ? ` ${tweak.restart}` : ''}` : '';
    if (!window.confirm(`¿Quieres ${verb} "${tweak.title}"?\nSe guardara una copia de los valores anteriores.${warning}`)) return;
    if (meta.risk === 'high' && enabled && !window.confirm('Este ajuste puede tener consecuencias importantes. ¿Confirmas que quieres continuar?')) return;
    setBusy(tweak.id);
    try {
      const result = await api.setExtraTweak(tweak.id, enabled);
      setMessage(`${tweak.title}: estado verificado. ${result.restart || ''}`.trim());
      setError('');
      setData(await api.extraTweaks());
    } catch (e) {
      setError(e.message || 'Windows no permitio este cambio.');
    } finally { setBusy(''); }
  }

  async function restore(tweak) {
    if (!window.confirm(`¿Restaurar los valores anteriores de "${tweak.title}"?`)) return;
    setBusy(tweak.id);
    try {
      await api.restoreExtraTweak(tweak.id);
      setMessage('Valores originales restaurados.');
      setError('');
      setData(await api.extraTweaks());
    } catch (e) { setError(e.message || 'No fue posible restaurar el ajuste.'); }
    finally { setBusy(''); }
  }

  const filteredTweaks = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es');
    return extraTweaks.filter(tweak => {
      const meta = getTweakMeta(tweak);
      const byCategory = category === 'Todos' || (category === 'Recomendados' ? meta.tags.includes('recommended') : tweak.category === category);
      const byText = !text || `${tweak.title} ${tweak.description} ${tweak.category} ${meta.tags.join(' ')}`.toLocaleLowerCase('es').includes(text);
      return byCategory && byText;
    });
  }, [query, category]);

  const stateById = new Map(data.map(item => [item.id, item.state]));

  return <div className="v87-extra-page v91-tweaks">
    <div className="v87-toolbar">
      <label className="v87-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tweaks por nombre o descripcion..."/></label>
      <button className="btn btn-dark" disabled={Boolean(busy)} onClick={refresh}><RefreshCw size={16} className={busy === 'refresh' ? 'rotate' : ''}/> Comprobar estados</button>
    </div>

    <div className="v87-tabs" role="group" aria-label="Categorias de tweaks">
      {categories.map(item => <button key={item} type="button" className={`v87-tab ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className="v87-summary-row"><button className="v87-apply-recommended" type="button" onClick={() => setCategory('Recomendados')}><Star size={16}/> Ver recomendados</button><span>Mostrando {filteredTweaks.length} de {extraTweaks.length} tweaks</span></div>

    {error && <div className="vt-notice vt-error" role="alert">{error}</div>}
    {message && <div className="vt-notice" role="status">{message}</div>}

    <div className="v87-tweak-grid">
      {filteredTweaks.map(tweak => {
        const state = stateById.get(tweak.id);
        const meta = getTweakMeta(tweak);
        const pending = busy === tweak.id;
        const canChange = !busy;
        return <article className={`v87-tweak-card v91-card ${state === true ? 'v91-card-on' : ''}`} data-category={tweak.category} key={tweak.id}>
          <div className="v87-card-top v91-card-top">
            <TweakTags tweak={tweak} meta={meta}/>
            <div className="v91-card-controls">
              <button type="button" className="v91-docs" title="Mostrar detalles de este ajuste" aria-label={`Detalles de ${tweak.title}`} aria-expanded={details === tweak.id} onClick={() => setDetails(current => current === tweak.id ? '' : tweak.id)}><BookOpen size={14}/> Detalles</button>
              <button type="button" className={`v91-switch ${state === true ? 'v91-switch-on' : state === null || state === undefined ? 'v91-switch-unknown' : ''}`} role="switch" aria-checked={state === true} aria-label={`${tweak.title}: ${state === true ? 'activado' : state === false ? 'desactivado' : 'sin verificar'}`} title={state === true ? 'Desactivar ajuste' : state === false ? 'Activar ajuste' : 'Aplicar ajuste y verificar el estado'} disabled={!canChange} onClick={() => change(tweak, state !== true)}><span className="v91-switch-knob"/></button>
            </div>
          </div>
          <h3>{tweak.title}</h3>
          <p>{tweak.description}</p>
          {details === tweak.id && <div className="v91-details"><strong>Informacion</strong><p>{tweak.restart || 'Normalmente no requiere reiniciar Windows.'}</p><p>{meta.requiresAdmin ? 'Requiere permisos de administrador y puede depender de tu edicion de Windows.' : 'El cambio se aplica a tu usuario. Windows puede ignorarlo en versiones no compatibles.'}</p><p>Se guarda una copia anterior para poder restaurar el registro.</p></div>}
          <div className="v91-card-footer">
            <span className={`v91-card-state ${state === true ? 'on' : state === false ? 'off' : 'unknown'}`}><span/>{pending ? 'Aplicando...' : state === true ? 'Activado' : state === false ? 'Desactivado' : 'Sin verificar'}</span>
            <button className="vt-icon v87-restore" type="button" title="Restaurar valores guardados" aria-label={`Restaurar ${tweak.title}`} disabled={Boolean(busy)} onClick={() => restore(tweak)}><RotateCcw size={15}/></button>
          </div>
        </article>;
      })}
    </div>
    {!filteredTweaks.length && <div className="v91-empty">No hay ajustes con estos filtros.</div>}
    <div className="vt-hint"><ShieldAlert size={17}/> Las opciones se aplican solo cuando pulsas el interruptor. Los ajustes de riesgo alto requieren doble confirmacion. No todos los cambios se aplican en todas las ediciones de Windows, ni garantizan mas FPS.</div>
  </div>;
}
