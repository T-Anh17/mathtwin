import React from 'react';
import { Camera, Download, NotebookPen, PencilRuler, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo.js';
import { productVi as m } from './product-messages.vi.js';
import { BottomNav, HistoryRows, LoadingScreen } from './product-ui.js';
import type { HistoryItem, ProductActions, ReaderStatus, ScreenState, Tab } from './product-types.js';

export interface HomeProps {
  state: ScreenState; reader: ReaderStatus; history: readonly HistoryItem[];
  actions: Pick<ProductActions, 'onCapture' | 'onManualInput' | 'onDownloadReader' | 'onCancel'>;
  onNavigate: (tab: Tab) => void; onOpenHistory: (item: HistoryItem) => void;
  onRemove?: (item: HistoryItem) => void;
}
export function HomeScreen({ state, reader, history, actions, onNavigate, onOpenHistory, onRemove }: HomeProps) {
  if (state === 'dang-tai') return <LoadingScreen title={m.loading.home} onCancel={actions.onCancel}/>;
  const ready = state !== 'loi' && reader.ready;
  return <div className="screen"><div className="topbar" style={{ padding: '0 12px 0 16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}><Logo size={30}/><span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-.02em', color: 'var(--primary)' }}>{m.math}<span style={{ color: 'var(--brand-amber)' }}>{m.twin}</span></span></div></div>
    <div className="content"><div className="hero-card"><div className="hero-deco"><Logo size={140} ink="#fff" amber="#fff" paper="transparent"/></div>
      <div><span className="chip" style={{ background: 'rgb(255 255 255 / .12)', borderColor: 'rgb(255 255 255 / .2)', color: '#fff' }}>{ready ? <ShieldCheck/> : <Download/>}{ready ? m.ready : m.missingReader}</span></div>
      <div><h2>{m.heroTitle}</h2><p style={{ marginTop: 6 }}>{m.heroDescription}</p></div>
      <button className="btn btn-hero btn-block" disabled={!ready} style={ready ? undefined : { opacity: .6 }} onClick={actions.onCapture}><Camera/>{m.capture}</button>
      {!ready && <button className="btn btn-block" style={{ background: 'rgb(255 255 255 / .12)', color: '#fff', height: 44 }} onClick={actions.onDownloadReader}>{m.downloadReader}{' · '}{reader.size}</button>}
    </div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span className="section-title">{m.recent}</span>
      {state !== 'rong' && <button className="btn btn-ghost" onClick={() => onNavigate('history')}>{m.viewAll}</button>}</div>
    {state === 'rong' ? <div className="card empty"><div className="empty-icon"><NotebookPen/></div><div className="section-title">{m.noHistory}</div><p className="text-sm muted" style={{ margin: 0 }}>{m.noHistoryDescription}</p></div>
      : <HistoryRows rows={history.slice(0, 3)} onOpen={onOpenHistory} {...(onRemove ? { onRemove } : {})}/>}
    <button className="btn btn-outline btn-block" onClick={actions.onManualInput}><PencilRuler/>{m.manualProblem}</button>
    </div><BottomNav active="home" onNavigate={onNavigate}/></div>;
}
