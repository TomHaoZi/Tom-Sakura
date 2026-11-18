import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, House, Compass, CalendarDays, Heart, History, Settings, ChevronRight, Play, Plus, Check, Star, X, SlidersHorizontal, Flame, Sparkles, Volume2, ArrowUpRight, Trash2 } from 'lucide-react';
import { testItem, demoSources } from './data';
const genres = ['全部', '国产动漫', '日韩动漫', '欧美动漫', '海外动漫'];
import './styles.css';
import EpisodePlayer from './EpisodePlayer';
import { mergeLibrary } from './library';
import ModalFocusGuard from './ModalFocusGuard';
import EpisodeList from './EpisodeList';
import WindowControls from './WindowControls';
import AppearanceControls from './AppearanceControls';
import { useAppearance } from './useAppearance';
import useGlassLight from './useGlassLight';
import { APP_VERSION, APP_SHORT_VERSION } from './app-info';

function Flower({ size = 30 }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><g>{[0,72,144,216,288].map(angle => <path key={angle} transform={`rotate(${angle} 20 20)`} d="M20 21C8 17 10 4 16 3L20 7L24 3C30 4 32 17 20 21Z"/>)}</g><circle cx="20" cy="20" r="3" fill="#fff"/></svg>;
}
function useStored(key, initial) {
  const [value, setValue] = useState(() => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(initial) ? (Array.isArray(v) ? v : initial) : (v ?? initial); } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}
function Cover({ item, className = '' }) {
  const [failed, setFailed] = useState(!item.image);
  useEffect(() => setFailed(!item.image), [item.image]);
  return failed ? <div className={`cover-fallback ${className}`} style={{ background: `linear-gradient(150deg, ${item.color}, #20242e)` }}><Flower size={45}/><span>{item.title}</span></div> : <img className={className} src={item.image} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
function App() {
  const [page, setPage] = useState('home');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('全部');
  const [year, setYear] = useState('全部年份');
  const [sort, setSort] = useState('推荐排序');
  const [favorites, setFavorites] = useStored('ts-favorites', []);
  const [history, setHistory] = useStored('ts-history', []);
  const [selected, setSelected] = useState(null);
  const [episode, setEpisode] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [demo, setDemo] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preferences, setPreferences] = useStored('ts-preferences', { autoNext: true, rate: 1 });
  const autoNext = preferences?.autoNext !== false;
  const playbackRate = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences?.rate) ? preferences.rate : 1;
  const playbackStrategy = ['smooth','balanced','quality'].includes(preferences?.strategy) ? preferences.strategy : 'smooth';
  const changeRate = rate => { if ([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(rate)) setPreferences(old => ({ ...old, autoNext, rate })); };
  const changeStrategy = strategy => { if (['smooth','balanced','quality'].includes(strategy)) setPreferences(old => ({ ...old, autoNext, rate: playbackRate, strategy })); };
  const [sources, setSources] = useState({});
  const [known, setKnown] = useStored('ts-known-catalog', []);
  const [anime, setAnime] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [pagination, setPagination] = useState({ key: '', cursor: null });
  const [nextPage, setNextPage] = useState({ key: '', cursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [reload, setReload] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const [toast, setToast] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);
  const [maximized, setMaximized] = useState(false);
  const [day, setDay] = useState(new Date().getDay());
  const main = useRef(null);
  const search = useRef(null);
  const heroPicks = anime.slice(0, 3);
  const displayedHero = Math.min(heroIndex, Math.max(0, heroPicks.length - 1));
  const hero = heroPicks[displayedHero] || testItem;
  const cinema = Boolean(selected && playing);
  const { appearance, updateAppearance, systemReduced } = useAppearance(cinema);
  useGlassLight(cinema || appearance.reduceTransparency || systemReduced);
  const requestKey = JSON.stringify([query.trim(), genre, page, year]);
  const activeCursor = pagination.key === requestKey ? pagination.cursor : null;
  const pinnedIds = useRef([]);
  pinnedIds.current = [...favorites, ...history.map(h => h.id)];
  useEffect(() => {
    if (page === 'favorites' || page === 'history') { setCatalogLoading(false); setCatalogError(''); return; }
    let canceled = false;
    setCatalogLoading(!activeCursor);
    setLoadingMore(!!activeCursor);
    setCatalogError('');
    setMoreError('');
    const timer = setTimeout(async () => {
      try {
        const result = await window.desktop?.catalogBrowse({ query: query.trim(), category: genre, cursor: activeCursor, index: page === 'explore', year: !query.trim() && year !== '全部年份' ? year : '' });
        if (canceled) return;
        if (!result || result.error) throw new Error(result?.error || '请在桌面客户端中打开');
        setAnime(old => activeCursor ? mergeLibrary(old, result.data.items, { limit: 3000 }) : result.data.items);
        setNextPage({ key: requestKey, cursor: result.data.nextCursor });
        setKnown(old => mergeLibrary(old, result.data.items, { pinned: pinnedIds.current }));
      } catch (error) { if (!canceled) { if (activeCursor) setMoreError(error.message); else { setAnime([]); setCatalogError(error.message); } } }
      finally { if (!canceled) { setCatalogLoading(false); setLoadingMore(false); } }
    }, query ? 400 : 0);
    return () => { canceled = true; clearTimeout(timer); };
  }, [query, genre, page, reload, year, activeCursor]);
  useEffect(() => {
    window.desktop?.loadSources().then(setSources).catch(() => {});
    window.desktop?.getWindowState().then(state => { if (state) setMaximized(state.maximized); }).catch(() => {});
    return window.desktop?.onMaximized(setMaximized);
  }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3200); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') { detailRequest.current += 1; setSelected(null); setSettings(false); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); search.current?.focus(); }
      // Maintenance-only import; source configuration is not part of the viewer UI.
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); importSources(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const go = p => { setPage(p); setQuery(''); setGenre('全部'); setYear('全部年份'); setSort('推荐排序'); setHeroIndex(0); main.current?.scrollTo({ top: 0 }); };
  const toggleFavorite = id => setFavorites(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const closeDetails = () => { detailRequest.current += 1; setSelected(null); };
  const open = async (item, play = false, ep = 1) => {
    const request = ++detailRequest.current;
    setSelected(item); setEpisode(ep); setPlaying(play); setDemo(false);
    if (!item.remote) { setDetailLoading(false); return; }
    setDetailLoading(true);
    try {
      const result = await window.desktop.catalogDetail(item.id);
      if (request !== detailRequest.current) return;
      if (result.error) throw new Error(result.error);
      setSelected(result.data);
      setEpisode(result.data.episodeNumbers?.includes(ep) ? ep : result.data.episodeNumbers?.[0] || 1);
      setKnown(old => mergeLibrary(old, [result.data], { pinned: pinnedIds.current }));
    } catch { if (request === detailRequest.current) setToast('番剧详情暂不可用，请稍后重试'); }
    finally { if (request === detailRequest.current) setDetailLoading(false); }
  };
  const record = (item, ep, time = 0, completed = false) => setHistory(old => [{ id: item.id, episode: ep, time, completed, at: Date.now() }, ...old.filter(x => x.id !== item.id)].slice(0, 50));
  const importSources = async () => {
    if (!window.desktop) { setToast('请在桌面客户端中导入片源'); return; }
    const result = await window.desktop.importSources();
    if (result?.error) setToast(`导入失败：${result.error}`);
    else if (result?.sources) { setSources(result.sources); setToast('片源导入成功'); }
  };
  let filtered = page === 'favorites' ? known.filter(a => favorites.includes(a.id)) : page === 'history' ? history.map(h => known.find(a => a.id === h.id)).filter(Boolean) : anime;
  filtered = filtered.filter(a => !['favorites', 'history'].includes(page) || !query || `${a.title} ${a.type}`.toLowerCase().includes(query.toLowerCase()));
  if (sort === '标题 A–Z') filtered = [...filtered].sort((a,b) => a.title.localeCompare(b.title,'zh-CN'));
  const searching = !!query.trim();
  const navItems = [{ id: 'home', text: '发现首页', icon: House }, { id: 'explore', text: '番剧索引', icon: Compass }, { id: 'schedule', text: '每周片单', icon: CalendarDays }];
  const personalItems = [{ id: 'favorites', text: '我的追番', icon: Heart, count: favorites.length }, { id: 'history', text: '观看记录', icon: History }];
  const titles = { home: '为你推荐', explore: '发现你的下一部心动', favorites: '我的追番', history: '观看记录', schedule: '一周七天，都有好故事' };
  return <div className="app-shell">
    <div className="ambient-wallpaper" aria-hidden="true"><span/><span/><span/></div>
    <aside className="sidebar">
      <WindowControls maximized={maximized}/>
      <button className="brand" onClick={() => go('home')} aria-label="Tom Sakura 首页"><span className="brand-mark"><Flower size={34}/></span><span>Tom <strong>Sakura</strong><small>你的次元放映室</small></span></button>
      <div className="nav-label">探索世界 <span>DISCOVER</span></div>
      <nav>{navItems.map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}><n.icon size={19}/>{n.text}{page === n.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="nav-label personal">我的空间 <span>MY SPACE</span></div>
      <nav>{personalItems.map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}><n.icon size={19}/>{n.text}{n.count > 0 && <span className="count">{n.count}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="little-note"><Flower size={22}/><strong>好故事，值得相遇</strong><p>在自己的节奏里<br/>发现另一个世界。</p><span>STAY IN YOUR WONDERLAND</span></div><button className="nav-item settings-nav" onClick={() => setSettings(true)}><Settings size={18}/>应用设置<span className="version">v{APP_SHORT_VERSION}</span></button><div className="profile"><div className="avatar">T<span/></div><div><strong>Tom 的放映室</strong><small>今天也要开心追番</small></div><Sparkles size={17}/></div></div>
    </aside>
    <div className="workspace">
      <header className="titlebar"><span className="window-caption">Tom Sakura <span>·</span> 你的私人放映室</span><span className="titlebar-detail">FOR THE LOVE OF ANIME</span></header>
      <header className="toolbar" data-glass-light><div className="breadcrumb">探索 <ChevronRight size={13}/><strong>{searching ? '搜索结果' : ({ home: '发现首页', explore: '番剧索引', schedule: '每周片单', favorites: '我的追番', history: '观看记录' })[page]}</strong></div><div className="search-box"><Search size={17}/><input ref={search} aria-label="搜索番剧" placeholder="搜索番剧，发现心动…" value={query} onChange={e => setQuery(e.target.value)}/>{query ? <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={14}/></button> : <kbd>Ctrl K</kbd>}</div><span className="auto-playback-badge"><Sparkles size={13}/>自动优化</span><div className="toolbar-divider"/><div className="tiny-avatar">T</div></header>
      <main ref={main}>
        {page === 'home' && !searching && !catalogLoading && anime.length > 0 && <>
          <section className="hero" style={{ '--hero-color': hero.color }}>
            <div className="hero-art" aria-hidden="true"><Cover key={hero.id} item={hero}/></div><div className="hero-grain"/>
            <button className="hero-poster" aria-label={`查看 ${hero.title} 详情`} onClick={() => open(hero)}><Cover key={hero.id} item={hero}/><span className="hero-poster-light" aria-hidden="true"/></button>
            <div className="hero-content"><div className="hero-kicker"><Sparkles size={12}/>今日发现 <i/> 每一帧，都是心动</div><div className="hero-english">{hero.en}</div><h1>{hero.title}</h1><div className="hero-meta">{hero.score && <span className="score"><Star size={14} fill="currentColor"/>{hero.score}</span>}<b>{hero.year}</b><span>{hero.type}</span><span>{hero.episodes ? `${hero.episodes} 集可选` : hero.status}</span><span className="quality">精选</span></div><p>{hero.subtitle}<br/>{hero.description ? `${hero.description.slice(0, 51)}…` : '跟随心动，开启一段新的旅程。'}</p><div className="hero-buttons"><button className="primary" onClick={() => open(hero, true)}><Play size={17} fill="currentColor"/>立即观看</button><button className="glass" onClick={() => toggleFavorite(hero.id)}>{favorites.includes(hero.id) ? <Check size={18}/> : <Plus size={18}/>} {favorites.includes(hero.id) ? '已加入追番' : '加入追番'}</button></div></div>
            <div className="hero-bottom"><span><span className="live-dot"/> 今日的故事，从这里开始</span><div className="hero-pagination">{heroPicks.map((item,i) => <button key={item.id} aria-label={`切换推荐 ${i + 1}`} aria-pressed={displayedHero === i} className={displayedHero === i ? 'active' : ''} onClick={() => setHeroIndex(i)}/>)}<b>{String(displayedHero + 1).padStart(2,'0')}<span> / {String(heroPicks.length).padStart(2,'0')}</span></b></div></div>
          </section>
          <section className="quick-genres" data-glass-light><div className="genre-intro"><Compass size={20}/><span>寻找你的<span>专属热爱</span></span></div>{genres.slice(1, 8).map((g, i) => <button key={g} onClick={() => { go('explore'); setGenre(g); }}><span className={`genre-symbol g${i}`}>{['国','日','欧','海'][i]}</span>{g}<ChevronRight size={12}/></button>)}</section>
          {history.length > 0 && <section className="continue-section"><SectionTitle icon={History} title="接着上次的心动" subtitle="CONTINUE WATCHING" action="全部记录" onAction={() => go('history')}/><div className="continue-grid">{history.slice(0, 3).map(h => { const a = known.find(x => x.id === h.id); if (!a) return null; return <button className="continue-card" key={h.id} onClick={() => open(a, true, h.episode)}><Cover item={a}/><div><strong>{a.title}</strong><span>第 {h.episode} 集 · {h.completed ? '已看完' : h.time > 0 ? `看到 ${Math.floor(h.time / 60)}:${String(Math.floor(h.time % 60)).padStart(2, '0')}` : '开始观看'}</span></div><Play size={19}/></button>; })}</div></section>}
        </>}
        <section className="catalog-section">
          <SectionTitle icon={searching ? Search : page === 'home' ? Flame : page === 'favorites' ? Heart : page === 'history' ? History : page === 'schedule' ? CalendarDays : Compass} title={searching ? `“${query}” 的搜索结果` : titles[page]} subtitle={searching ? `${filtered.length} 部番剧` : ({home:'PICKED FOR YOU', explore:'EXPLORE ANIME',favorites:'MY COLLECTION',history:'YOUR JOURNEY',schedule:'WEEKLY PICKS'})[page]} action={page === 'home' && !searching ? '全部番剧' : undefined} onAction={() => go('explore')}/>
          {page === 'schedule' && !searching && <><p className="section-description">按心情安排你的一周。这里是精选观影片单，不代表官方更新日程。</p><div className="week-tabs">{['周日','周一','周二','周三','周四','周五','周六'].map((d,i) => <button className={day === i ? 'active' : ''} key={d} onClick={() => setDay(i)}>{d}{new Date().getDay() === i && <small>今天</small>}</button>)}</div></>}
          {(page === 'home' || page === 'explore' || searching) && <div className="filter-bar"><div className="genre-tabs">{genres.map(g => <button key={g} className={genre === g ? 'active' : ''} onClick={() => setGenre(g)}>{g}</button>)}</div><div className="select-filters">{page !== 'home' && <select aria-label="年份" value={year} disabled={searching} title="按来源站点年份筛选" onChange={e => setYear(e.target.value)}>{['全部年份', ...Array.from({length: 40}, (_, i) => String(new Date().getFullYear() - i))].map(y => <option key={y}>{y}</option>)}</select>}<SlidersHorizontal size={14}/><select aria-label="排序" value={sort} title="对已加载的番剧排序" onChange={e => setSort(e.target.value)}>{['推荐排序','标题 A–Z'].map(s => <option key={s}>{s}</option>)}</select></div></div>}
          {page === 'history' && history.length > 0 && <div className="history-toolbar"><span>记录保存在这台电脑上</span><button onClick={() => { if (window.confirm('清空全部观看记录？')) setHistory([]); }}><Trash2 size={14}/>清空记录</button></div>}
          {catalogLoading && <div className="catalog-loading" role="status"><Flower size={36}/><p>正在寻找好故事…</p></div>}
          {catalogError && <div className="empty-state" role="alert"><Flower size={40}/><h3>暂时无法加载片单</h3><p>{catalogError}</p><button className="primary" onClick={() => setReload(v => v + 1)}>重新加载</button></div>}
          <div className="anime-grid" style={{ display: catalogLoading || catalogError ? 'none' : undefined }}>{(page === 'schedule' && !searching ? filtered.filter((_,i) => i % 7 === day || i % 7 === (day + 2) % 7) : filtered).map((item, i) => <article className="anime-card" key={item.id} style={{ '--delay': `${Math.min(i, 11) * 35}ms` }}><div className="poster"><button className="poster-open" aria-label={`查看 ${item.title}`} onClick={() => open(item)}><Cover item={item}/><span className="poster-shade"/><span className="poster-top">{item.type && item.type !== '动漫' && <span className="type-tag">{item.status === '剧场版' ? '剧场版' : item.type}</span>}{item.score && <span className="poster-score"><Star size={11} fill="currentColor"/>{item.score}</span>}</span>{(item.episodes || (item.status && item.status !== '点击查看选集')) ? <span className="episode-badge">{item.episodes ? `${item.episodes} 集可选` : item.status}</span> : null}<span className="hover-play"><Play size={23} fill="currentColor"/></span></button><button className={`favorite-button ${favorites.includes(item.id) ? 'saved' : ''}`} aria-label={favorites.includes(item.id) ? `取消追番 ${item.title}` : `追番 ${item.title}`} onClick={() => toggleFavorite(item.id)}><Heart size={16} fill={favorites.includes(item.id) ? 'currentColor' : 'none'}/></button></div><button className="card-title" title={item.title} onClick={() => open(item)}>{item.title}</button><div className="card-meta"><span>{[item.year,item.country,item.type].filter(Boolean).join(' · ')}</span>{favorites.includes(item.id) && <Heart className="card-saved" size={11} fill="currentColor" aria-label="已追番"/>}</div>{page === 'history' && <button className="resume-link" onClick={() => open(item, true, history.find(h => h.id === item.id)?.episode || 1)}>继续第 {history.find(h => h.id === item.id)?.episode} 集 <ArrowUpRight size={13}/></button>}</article>)}</div>
          {!catalogLoading && !catalogError && !['favorites', 'history', 'schedule'].includes(page) && filtered.length > 0 && <div className="load-more"><span>已展示 {anime.length} 部番剧</span>{nextPage.key === requestKey && nextPage.cursor ? <button className="secondary" disabled={loadingMore} onClick={() => { if (activeCursor === nextPage.cursor) setReload(v => v + 1); else setPagination({ key: requestKey, cursor: nextPage.cursor }); }}>{loadingMore ? '正在加载…' : moreError ? '重新加载更多' : '加载更多'}<ChevronRight size={14}/></button> : <span>当前片单已到底 · 可切换分类探索更多</span>}{moreError && <small role="alert">{moreError}</small>}</div>}
          {!catalogLoading && !catalogError && filtered.length === 0 && <div className="empty-state"><Flower size={50}/><h3>{page === 'favorites' ? '把心动的故事，收藏在这里' : page === 'history' ? '你的旅程，还未开始' : '还没有找到这部番剧'}</h3><p>{page === 'favorites' ? '点击番剧封面上的爱心，建立你的专属片单。' : page === 'history' ? '开始播放后，这里会留下你的足迹。' : '试试其他关键词，或换个分类看看。'}</p><button className="primary" onClick={() => go('explore')}>发现更多番剧 <ChevronRight size={15}/></button></div>}
        </section>
        {page === 'home' && !searching && !catalogLoading && anime.length > 0 && <section className="bottom-banner"><div className="banner-flower"><Flower size={58}/></div><div><span>YOUR OWN LITTLE UNIVERSE</span><h3>总有一个故事，与你不期而遇。</h3><p>慢一点也没关系，好番一直在这里。</p></div><button onClick={() => { const item = anime[Math.floor(Math.random() * anime.length)]; open(item); }}>随机邂逅一部 <Sparkles size={17}/></button></section>}
        <footer><span><Flower size={15}/> Tom Sakura <i>·</i> 为热爱而相遇</span><span>公开站点目录 · 客户端不托管视频 <span className="footer-dot"/> DESKTOP v{APP_VERSION}</span></footer>
      </main>
    </div>
    {selected && <Details key={selected.id} item={selected} episode={episode} setEpisode={setEpisode} playing={playing} setPlaying={setPlaying} demo={demo} setDemo={setDemo} sources={sources} saved={favorites.includes(selected.id)} toggleFavorite={() => toggleFavorite(selected.id)} close={closeDetails} retryDetails={() => open(selected, playing, episode)} record={record} history={history} detailLoading={detailLoading} autoNext={autoNext} rate={playbackRate} changeRate={changeRate} strategy={playbackStrategy} changeStrategy={changeStrategy}/>}
    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="应用设置" onClick={e => e.stopPropagation()}><ModalFocusGuard/><button className="modal-close" aria-label="关闭设置" onClick={() => setSettings(false)}><X size={20}/></button><div className="settings-icon"><Settings size={25}/></div><h2>你的放映室，你来定义</h2><p>Tom Sakura · Windows 桌面客户端</p><AppearanceControls appearance={appearance} updateAppearance={updateAppearance} systemReduced={systemReduced}/><div className="setting-row"><div><strong>智能播放</strong><small>画质优先会尝试比较高清候选；三种策略均保留自动容错</small></div><label className="rate-control"><select aria-label="默认播放策略" value={playbackStrategy} onChange={e => changeStrategy(e.target.value)}><option value="smooth">流畅优先</option><option value="balanced">均衡</option><option value="quality">画质优先</option></select></label></div><div className="setting-row"><div><strong>自动连播</strong><small>播放结束后，继续下一集</small></div><button className={`toggle-switch ${autoNext ? 'on' : ''}`} role="switch" aria-label="自动连播" aria-checked={autoNext} onClick={() => setPreferences(old => ({ ...old, autoNext: !autoNext, rate: playbackRate }))}><span/></button></div><div className="setting-row"><div><strong>播放器测试</strong><small>使用独立的公开测试素材，不是动漫正片</small></div><button className="secondary" onClick={() => { setSettings(false); open(testItem, true); setDemo(true); }}><Play size={15}/>测试</button></div><div className="setting-row"><div><strong>内容信息</strong><small>目录来源：yhdm.one / anime.donghua.hk；非来源站点官方客户端，不托管视频</small></div></div><div className="setting-row"><div><strong>本地数据</strong><small>{favorites.length} 部追番 · {history.length} 条观看记录，无需登录</small></div><span className="local-tag">仅保存在本机</span></div><div className="settings-foot"><Flower size={18}/>让每一次相遇，都如樱花般美好。</div></section></div>}
    {toast && <div className="toast" role="status"><Sparkles size={17}/>{toast}</div>}
  </div>;
}
function SectionTitle({ icon: Icon, title, subtitle, action, onAction }) { return <div className="section-heading"><div><Icon size={21}/><h2>{title}</h2><span className="section-subtitle">{subtitle}</span></div>{action && <button onClick={onAction}>{action}<ChevronRight size={15}/></button>}</div>; }
function Details({ item, episode, setEpisode, playing, setPlaying, demo, setDemo, sources, saved, toggleFavorite, close, retryDetails, record, history, detailLoading, autoNext, rate, changeRate, strategy, changeStrategy }) {
  const previous = history.find(h => h.id === item.id && h.episode === episode);
  return <div className="modal-backdrop details-backdrop" onClick={close}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={item.title} onClick={e => e.stopPropagation()}><ModalFocusGuard/><button className="modal-close" aria-label="关闭详情" onClick={close}><X size={20}/></button>
    {playing ? <div className="player-area"><EpisodePlayer key={`${item.id}-${episode}-${demo}`} item={item} episode={episode} localSource={demo ? demoSources : sources[item.id]?.[episode]} startAt={demo ? 0 : previous?.time || 0} demo={demo} detailLoading={detailLoading} rate={rate} onRateChange={changeRate} strategy={strategy} onStrategyChange={changeStrategy} onProgress={demo ? undefined : time => record(item, episode, time)} onEnded={() => { if (!demo) { record(item, episode, 0, true); if (autoNext) { const numbers = item.episodeNumbers || Array.from({length: item.episodes}, (_, i) => i + 1); const next = numbers[numbers.indexOf(episode) + 1]; if (next) setEpisode(next); } } }}/> </div> : <div className="detail-art"><Cover item={item}/><div className="detail-art-gradient"/><div className="detail-art-caption"><span>THE NEXT STORY IS YOURS</span><Flower size={35}/></div></div>}
    <div className="detail-body"><div className="detail-summary">{!playing && <div className="detail-cover"><Cover item={item}/></div>}<div className="detail-info"><span className="detail-en">{item.en}</span><h2>{item.title}</h2><div className="detail-meta">{item.score && <span className="score"><Star size={14} fill="currentColor"/>{item.score}</span>}<span>{item.year}</span><span>{item.type}</span><span>{item.episodes ? `${item.episodes} 集可选` : '正在读取选集'}</span></div><p>{item.description}</p><div className="detail-actions">{!playing && <button className="primary" onClick={() => setPlaying(true)}><Play size={16} fill="currentColor"/>开始观看</button>}{item.remote && <button className="secondary" onClick={toggleFavorite}>{saved ? <Check size={16}/> : <Plus size={16}/>} {saved ? '已加入追番' : '加入追番'}</button>}{playing && <label className="rate-control"><span>播放速度</span><select aria-label="播放速度" value={rate} onChange={e => changeRate(Number(e.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>}{playing && <span className="playing-label"><Volume2 size={14}/>{demo ? '测试模式' : `第 ${episode} 集`}</span>}</div></div></div><div className="episodes-heading"><h3>选集播放 <span>{detailLoading ? '读取中…' : `${item.episodeNumbers?.length || item.episodes} 集可选`}</span></h3><span>自动连接 · 点击选集播放</span></div><EpisodeList item={item} episode={episode} playing={playing} loading={detailLoading} onRetry={retryDetails} onSelect={ep => { setEpisode(ep); setDemo(item.id === 'player-test'); setPlaying(true); }}/><div className="detail-disclaimer">{item.remote ? '番剧信息与播放入口由公开站点提供；客户端不存储或分发视频。请遵守来源站点条款及所在地法律。' : '此为测试目录；测试视频不是动漫正片。'}</div></div>
  </section></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
