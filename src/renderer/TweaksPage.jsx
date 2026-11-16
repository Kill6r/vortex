import React from 'react';
import { Cpu, Monitor, SlidersHorizontal, Sparkles } from 'lucide-react';
import { WindowsTweaksPage, GraphicsPage } from './WindowsTweaksPage.jsx';
import ExtraTweaksPage from './ExtraTweaksPage.jsx';
import './tweaks-design.css';

export default function TweaksPage({ api, onOpenCpu }) {
  const moveTo = section => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div className="v84-tweaks v87-tweaks-page v94-tweaks">
    <div className="v87-tweaks-hero">
      <div>
        <span className="v87-hero-kicker">VORTEX / CENTRO DE CONTROL</span>
        <h1>Tu equipo. A tu manera.</h1>
        <p>Ajusta Windows, prepara tus perfiles y compara el rendimiento de tu equipo.</p>
      </div>
      <nav className="v87-hero-links v90-tweak-links" aria-label="Ir a ajustes">
        <button className="v90-jump-windows" onClick={() => moveTo('tweaks-windows')}><SlidersHorizontal size={16}/> <span>Windows<small>Fluidez y escritorio</small></span></button>
        <button className="v90-jump-graphics" onClick={() => moveTo('tweaks-graphics')}><Monitor size={16}/> <span>Gráficos<small>GPU y compatibilidad</small></span></button>
        <button className="v90-jump-extras" onClick={() => moveTo('tweaks-extra')}><Sparkles size={16}/> <span>Extras<small>Personaliza tu sistema</small></span></button>
        <button className="v91-jump-cpu" onClick={onOpenCpu}><Cpu size={16}/> <span>CPU<small>Ajusta, mide y compara</small></span></button>
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
      <div className="v84-tweaks-section-title"><span><Sparkles size={19}/></span><div><h2>Mas tweaks</h2><p>Personalización, juegos y privacidad. Encuentra cada ajuste por categoría.</p></div></div>
      <ExtraTweaksPage api={api}/>
    </section>
  </div>;
}
