import React from 'react';
import { Monitor, SlidersHorizontal } from 'lucide-react';
import { WindowsTweaksPage, GraphicsPage } from './WindowsTweaksPage.jsx';

export default function TweaksPage({ api }) {
  const moveTo = section => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="v84-tweaks">
    <div className="v84-tweaks-intro">
      <div><h1>Tweaks</h1><p>Todos los ajustes en una sola pagina. Desplazate para explorar Windows y GPU.</p></div>
      <nav className="v84-tweaks-links" aria-label="Ir a ajustes">
        <button onClick={() => moveTo('tweaks-windows')}><SlidersHorizontal size={16}/> Windows</button>
        <button onClick={() => moveTo('tweaks-graphics')}><Monitor size={16}/> Graficos y GPU</button>
      </nav>
    </div>
    <section id="tweaks-windows" className="v84-tweaks-section">
      <div className="v84-tweaks-section-title"><span><SlidersHorizontal size={19}/></span><div><h2>Ajustes de Windows</h2><p>Efectos visuales, animaciones y otras opciones del sistema.</p></div></div>
      <WindowsTweaksPage api={api}/>
    </section>
    <section id="tweaks-graphics" className="v84-tweaks-section">
      <div className="v84-tweaks-section-title"><span><Monitor size={19}/></span><div><h2>Graficos y GPU</h2><p>Programacion de GPU, HAGS y estado de ReBAR.</p></div></div>
      <GraphicsPage api={api}/>
    </section>
  </div>;
}
