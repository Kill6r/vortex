import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, RotateCcw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { extraTweaks } from '../core/extra-tweaks.js';

const categories = ['Personalizacion', 'Escritorio', 'Juegos', 'Privacidad'];

export default function ExtraTweaksPage({ api }) {
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    setBusy('refresh');
    try { setData(await api.extraTweaks()); setError(''); }
    catch (e) { setError(e.message || 'No se pudieron consultar los ajustes.'); }
    finally { setBusy(''); }
  }

  useEffect(() => { void refresh(); }, []);

  async function change(tweak, enabled) {
    if (!window.confirm(`¿Quieres ${enabled ? 'aplicar' : 'desactivar'} "${tweak.title}"? Se guardara una copia de los valores anteriores.`)) return;
    setBusy(tweak.id);
    try {
      const result = await api.setExtraTweak(tweak.id, enabled);
      setMessage(`${tweak.title}: ajuste guardado. ${result.restart || ''}`);
      setError('');
      setData(await api.extraTweaks());
    } catch (e) { setError(e.message || 'Windows no permitio este cambio.'); }
    finally { setBusy(''); }
  }

  async function restore(tweak) {
    if (!window.confirm(`¿Restaurar los valores anteriores de "${tweak.title}"?`)) return;
    setBusy(tweak.id);
    try { await api.restoreExtraTweak(tweak.id); setMessage('Valores originales restaurados.'); setError(''); setData(await api.extraTweaks()); }
    catch (e) { setError(e.message || 'No fue posible restaurar el ajuste.'); }
    finally { setBusy(''); }
  }

  return <div className="v86-extra">
    <div className="v86-extra-top"><div><h2>Mas ajustes de Windows</h2><p>Opciones adicionales inspiradas en las categorias de Sparkle. Cada cambio se aplica por separado y puede restaurarse.</p></div><button className="btn btn-dark" disabled={Boolean(busy)} onClick={refresh}><RefreshCw size={16}/> Verificar</button></div>
    {error && <div className="vt-notice vt-error">{error}</div>}
    {message && <div className="vt-notice">{message}</div>}
    {categories.map(category => <section className="v86-extra-group" key={category}>
      <div className="v86-extra-category"><SlidersHorizontal size={16}/><h3>{category}</h3></div>
      <div className="v86-extra-list">{extraTweaks.filter(x => x.category === category).map(tweak => {
        const actual = data.find(x => x.id === tweak.id);
        const state = actual?.state;
        return <div className="v86-extra-row" key={tweak.id}>
          <div className="v86-extra-copy"><strong>{tweak.title}</strong><p>{tweak.description}</p><span className={`vt-status ${state === true ? 'vt-status-on' : state === false ? 'vt-status-off' : 'vt-status-unknown'}`}><span className="vt-status-dot"/>{state === true ? 'Aplicado' : state === false ? 'No aplicado' : 'Sin estado definido'}</span></div>
          <div className="v86-extra-actions"><div className="vt-choice-group"><button className={`vt-choice vt-choice-off ${state === false ? 'vt-choice-selected' : ''}`} aria-pressed={state === false} disabled={Boolean(busy) || state === false} onClick={() => change(tweak, false)}>Desactivar</button><button className={`vt-choice vt-choice-on ${state === true ? 'vt-choice-selected' : ''}`} aria-pressed={state === true} disabled={Boolean(busy) || state === true} onClick={() => change(tweak, true)}>Aplicar</button></div><button className="vt-icon" title="Restaurar valores guardados" aria-label={`Restaurar ${tweak.title}`} disabled={Boolean(busy)} onClick={() => restore(tweak)}><RotateCcw size={16}/></button></div>
        </div>;
      })}</div>
    </section>)}
    <div className="vt-hint"><ShieldAlert size={17}/> Algunas opciones necesitan reiniciar el Explorador o cerrar sesion. No hay un modo automatico de aplicar todos los tweaks ni se deshabilitan las protecciones de Windows.</div>
  </div>;
}
