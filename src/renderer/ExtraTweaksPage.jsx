import React, { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, RotateCcw, Search, ShieldAlert, Sparkles } from 'lucide-react';
import { extraTweaks } from '../core/extra-tweaks.js';

const categories = ['Todos', 'Personalizacion', 'Escritorio', 'Juegos', 'Privacidad'];

function riskOf(tweak) {
  if (['game-capture', 'mouse-acceleration'].includes(tweak.id)) return 'caution';
  return 'safe';
}

function riskLabel(risk) {
  return risk === 'caution' ? 'Cuidado' : 'Seguro';
}

export default function ExtraTweaksPage({ api }) {
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');

  async function refresh() {
    setBusy('refresh');
    try {
      setData(await api.extraTweaks());
      setError('');
    } catch (e) {
      setError(e.message || 'No se pudieron consultar los ajustes.');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function change(tweak, enabled) {
    if (!window.confirm(`¿Quieres ${enabled ? 'aplicar' : 'desactivar'} "${tweak.title}"? Se guardara una copia de los valores anteriores.`)) return;
    setBusy(tweak.id);
    try {
      const result = await api.setExtraTweak(tweak.id, enabled);
      setMessage(`${tweak.title}: ajuste guardado. ${result.restart || ''}`.trim());
      setError('');
      setData(await api.extraTweaks());
    } catch (e) {
      setError(e.message || 'Windows no permitio este cambio.');
    } finally {
      setBusy('');
    }
  }

  async function restore(tweak) {
    if (!window.confirm(`¿Restaurar los valores anteriores de "${tweak.title}"?`)) return;
    setBusy(tweak.id);
    try {
      await api.restoreExtraTweak(tweak.id);
      setMessage('Valores originales restaurados.');
      setError('');
      setData(await api.extraTweaks());
    } catch (e) {
      setError(e.message || 'No fue posible restaurar el ajuste.');
    } finally {
      setBusy('');
    }
  }

  const filteredTweaks = useMemo(() => {
    const text = query.trim().toLowerCase();
    return extraTweaks.filter(tweak => {
      const byCategory = category === 'Todos' || tweak.category === category;
      const byText = !text || `${tweak.title} ${tweak.description} ${tweak.category}`.toLowerCase().includes(text);
      return byCategory && byText;
    });
  }, [query, category]);

  return <div className="v87-extra-page">
    <div className="v87-toolbar">
      <label className="v87-search">
        <Search size={18}/>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tweaks por nombre o descripcion..."/>
      </label>
      <button className="btn btn-dark" disabled={Boolean(busy)} onClick={refresh}><RefreshCw size={16} className={busy === 'refresh' ? 'rotate' : ''}/> Actualizar</button>
    </div>

    <div className="v87-tabs" role="tablist" aria-label="Categorias de tweaks">
      {categories.map(item => <button key={item} type="button" className={`v87-tab ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}
    </div>

    <div className="v87-summary-row">
      <button className="v87-apply-recommended" type="button" onClick={() => setCategory('Juegos')}><Sparkles size={16}/> Ver tweaks recomendados</button>
      <span>Mostrando {filteredTweaks.length} de {extraTweaks.length} tweaks</span>
    </div>

    {error && <div className="vt-notice vt-error">{error}</div>}
    {message && <div className="vt-notice">{message}</div>}

    <div className="v87-tweak-grid">
      {filteredTweaks.map(tweak => {
        const actual = data.find(item => item.id === tweak.id);
        const state = actual?.state;
        const risk = riskOf(tweak);
        const disabled = Boolean(busy) && busy !== tweak.id;
        return <article className="v87-tweak-card" key={tweak.id}>
          <div className="v87-card-top">
            <div className="v87-card-tags">
              <span className="v87-chip">{tweak.category}</span>
              <span className={`vt-status ${risk === 'caution' ? 'vt-status-indicative' : 'vt-status-on'} v87-risk`}><span className="vt-status-dot"/>{riskLabel(risk)}</span>
            </div>
            <span className={`vt-status ${state === true ? 'vt-status-on' : state === false ? 'vt-status-off' : 'vt-status-unknown'}`}><span className="vt-status-dot"/>{state === true ? 'Activado' : state === false ? 'Desactivado' : 'Sin verificar'}</span>
          </div>
          <h3>{tweak.title}</h3>
          <p>{tweak.description}</p>
          {tweak.restart ? <small className="v87-restart">{tweak.restart}</small> : <small className="v87-restart">Sin reinicio obligatorio.</small>}
          <div className="v87-card-actions">
            <div className="vt-choice-group" role="group" aria-label={`Estado de ${tweak.title}`}>
              <button className={`vt-choice vt-choice-off ${state === false ? 'vt-choice-selected' : ''}`} disabled={disabled || state === false || busy === tweak.id} onClick={() => change(tweak, false)}>Desactivar</button>
              <button className={`vt-choice vt-choice-on ${state === true ? 'vt-choice-selected' : ''}`} disabled={disabled || state === true || busy === tweak.id} onClick={() => change(tweak, true)}>{busy === tweak.id ? 'Aplicando...' : 'Aplicar'}</button>
            </div>
            <button className="vt-icon v87-restore" type="button" title="Restaurar" aria-label={`Restaurar ${tweak.title}`} disabled={disabled || busy === tweak.id} onClick={() => restore(tweak)}><RotateCcw size={16}/></button>
          </div>
        </article>;
      })}
    </div>

    <div className="vt-hint"><ShieldAlert size={17}/> Los cambios se aplican por separado y pueden restaurarse. Algunos ajustes pueden requerir reiniciar el Explorador o cerrar sesion.</div>
  </div>;
}
