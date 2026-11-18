import React from 'react';
import { Sun, Moon, Monitor, Layers } from 'lucide-react';
const choices = [{ value: 'light', label: '浅色玻璃', icon: Sun }, { value: 'dark', label: '深色玻璃', icon: Moon }, { value: 'system', label: '跟随系统', icon: Monitor }];
export default function AppearanceControls({ appearance, updateAppearance, systemReduced }) {
  return <section className="appearance-section" aria-label="外观设置">
    <div className="appearance-heading"><span className="appearance-symbol"><Layers size={18}/></span><div><h3>Liquid Glass</h3><p>让光与色彩，轻轻流过你的放映室。</p></div><span className="appearance-edition">外观</span></div>
    <div className="appearance-segments" role="group" aria-label="外观主题">{choices.map(({ value, label, icon: Icon }) => <button key={value} aria-pressed={appearance.theme === value} onClick={() => updateAppearance({ theme: value })}><Icon size={17}/><span>{label}</span></button>)}</div>
    <div className="appearance-reduce"><div><strong>减少透明度</strong><small>{systemReduced ? '系统已请求减少透明度' : '使用更清晰的实色材质，减少视觉与图形负担'}</small></div><button className={`toggle-switch ${appearance.reduceTransparency ? 'on' : ''}`} role="switch" aria-label="减少透明度" aria-checked={appearance.reduceTransparency} onClick={() => updateAppearance({ reduceTransparency: !appearance.reduceTransparency })}><span/></button></div>
    <p className="appearance-footnote">尊重系统“减少动态效果”设置；播放时自动简化大面积玻璃模糊。</p>
  </section>;
}
