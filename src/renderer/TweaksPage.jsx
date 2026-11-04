import React, { useState } from 'react';
import { Monitor, SlidersHorizontal } from 'lucide-react';
import { WindowsTweaksPage, GraphicsPage } from './WindowsTweaksPage.jsx';

export default function TweaksPage({ api }) {
  const [tab, setTab] = useState('windows');
  return <div className="v83-tweaks"><div className="v83-tweaks-header"><div><h1>Tweaks</h1><p>Ajustes de Windows y GPU reunidos en una sola seccion.</p></div><div className="v83-tweaks-tabs"><button className={tab === 'windows' ? 'active' : ''} onClick={() => setTab('windows')}><SlidersHorizontal size={16}/> Windows</button><button className={tab === 'graphics' ? 'active' : ''} onClick={() => setTab('graphics')}><Monitor size={16}/> Graficos y GPU</button></div></div>{tab === 'windows' ? <WindowsTweaksPage api={api}/> : <GraphicsPage api={api}/>}</div>;
}
