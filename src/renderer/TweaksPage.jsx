import React from 'react';
import { Monitor, SlidersHorizontal, Sparkles } from 'lucide-react';
import { WindowsTweaksPage, GraphicsPage } from './WindowsTweaksPage.jsx';
import ExtraTweaksPage from './ExtraTweaksPage.jsx';

export default function TweaksPage({ api }) {
  const moveTo = section => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div className="v84-tweaks v87-tweaks-page">
    <div className="v87-tweaks-hero">
      <div>
        <span className="v87-hero-kicker">CENTRO DE TWEAKS</span>
        <h1>Tweaks de Windows, graficos y escritorio</h1>
        <p>Ahora el panel es mas limpio, oscuro y facil de leer. Usa las secciones para ir directo a lo que quieres ajustar.</p>
      </div>
      <nav className="v87-hero-links v90-tweak-links" aria-label="Ir a ajustes">
        <button className="v90-jump-windows" onClick={() => moveTo('tweaks-windows')}><SlidersHorizontal size={16}/> Windows</button>
        <button className="v90-jump-graphics" onClick={() => moveTo('tweaks-graphics')}><Monitor size={16}/> Graficos y GPU</button>
        <button className="v90-jump-extras" onClick={() => moveTo('tweaks-extra')}><Sparkles size={16}/> Extras</button>
      </nav>
    </div>

    <section id="tweaks-windows" className="v84-tweaks-section">
      <div className="v84-tweaks-section-title"><span><SlidersHorizontal size={19}/></span><div><h2>Ajustes de Windows</h2><p>Efectos visuales, animaciones y opciones del sistema.</p></div></div>
      <WindowsTweaksPage api={api}/>
    </section>

    <section id="tweaks-graphics" className="v84-tweaks-section">
      <div className="v84-tweaks-section-title"><span><Monitor size={19}/></span><div><h2>Graficos y GPU</h2><p>HAGS, comprobacion de ReBAR y otras opciones de la GPU.</p></div></div>
      <GraphicsPage api={api}/>
    </section>

    <section id="tweaks-extra" className="v84-tweaks-section">
      <div className="v84-tweaks-section-title"><span><Sparkles size={19}/></span><div><h2>Mas tweaks</h2><p>Personalizacion, escritorio, juegos y privacidad con un estilo mas parecido a Sparkle.</p></div></div>
      <ExtraTweaksPage api={api}/>
    </section>
  </div>;
}
