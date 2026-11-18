import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';
const PAGE_SIZE = 60;
export default function EpisodeList({ item, episode, playing, onSelect, loading, onRetry }) {
  const numbers = useMemo(() => item.episodeNumbers || Array.from({length: Math.min(item.episodes || 0, 2000)}, (_,i) => i+1), [item.episodeNumbers, item.episodes]);
  const [page, setPage] = useState(0);
  const [descending, setDescending] = useState(false);
  const ordered = useMemo(() => descending ? [...numbers].reverse() : numbers, [numbers, descending]);
  useEffect(() => { setPage(Math.max(0, Math.floor(ordered.indexOf(episode) / PAGE_SIZE))); }, [ordered, episode]);
  const pages = Math.ceil(ordered.length / PAGE_SIZE);
  const current = Math.min(page, Math.max(0, pages-1));
  if (!numbers.length) return <div className="episode-empty">{loading ? '正在读取选集…' : <>暂时没有可用选集。{onRetry && <button onClick={onRetry}>重新读取</button>}</>}</div>;
  return <>
    <div className="episode-tools"><button onClick={() => setDescending(v => !v)}>{descending ? '倒序排列' : '正序排列'}</button>{pages > 1 && <><button aria-label="上一组选集" disabled={current === 0} onClick={() => setPage(v => v-1)}><ChevronLeft size={14}/></button><select aria-label="选集分段" value={current} onChange={e => setPage(Number(e.target.value))}>{Array.from({length:pages}, (_,i) => <option key={i} value={i}>第 {ordered[i*PAGE_SIZE]}–{ordered[Math.min(ordered.length-1,(i+1)*PAGE_SIZE-1)]} 集</option>)}</select><button aria-label="下一组选集" disabled={current === pages-1} onClick={() => setPage(v => v+1)}><ChevronRight size={14}/></button></>}<button className="latest-episode" onClick={() => onSelect(numbers.at(-1))}>最新一集 · {numbers.at(-1)}</button></div>
    <div className="episode-grid">{ordered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map(ep => <button className={playing && ep === episode ? 'active' : ''} key={ep} onClick={() => onSelect(ep)}>{playing && ep === episode && <Volume2 size={12}/>}第 {String(ep).padStart(2,'0')} 集</button>)}</div>
  </>;
}
