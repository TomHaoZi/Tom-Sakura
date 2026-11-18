import React from 'react';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';
export default function WindowControls({ maximized }) {
  return <div className="sidebar-chrome">
    <div className="traffic-lights" aria-label="窗口控制">
      <button className="traffic close" aria-label="关闭窗口" title="关闭窗口" onClick={() => window.desktop?.windowAction('close')}><span><X size={9} strokeWidth={3}/></span></button>
      <button className="traffic minimize" aria-label="最小化" title="最小化" onClick={() => window.desktop?.windowAction('minimize')}><span><Minus size={9} strokeWidth={3}/></span></button>
      <button className="traffic maximize" aria-label="最大化或还原" title={maximized ? '还原窗口' : '最大化窗口'} onClick={() => window.desktop?.windowAction('maximize')}><span>{maximized ? <Minimize2 size={8} strokeWidth={2.5}/> : <Maximize2 size={8} strokeWidth={2.5}/>}</span></button>
    </div>
  </div>;
}
