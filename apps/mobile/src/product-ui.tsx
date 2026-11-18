import React from 'react';
import { ArrowRight, Camera, ChevronLeft, CircleCheck, CircleDashed, CircleHelp, CircleX, FileQuestion, History, LoaderCircle, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { sessionVi } from './flow/messages.vi.js';
import type { ReactNode } from 'react';
import { productVi as m } from './product-messages.vi.js';
import type { CropData, GraphDrawing, HistoryItem, Tab, Verdict } from './product-types.js';

export const verdictStyle = {
  dung: { className: 'v-ok', Icon: CircleCheck }, sai: { className: 'v-wrong', Icon: CircleX },
  can_xac_nhan: { className: 'v-confirm', Icon: CircleHelp }, khong_du_can_cu: { className: 'v-none', Icon: FileQuestion },
} satisfies Record<Verdict, { className: string; Icon: typeof CircleCheck }>;

export function Topbar({ title, onBack, onRegrade }: { title: string; onBack: () => void; onRegrade?: () => void }) {
  return <div className="topbar"><button className="icon-btn" aria-label={m.back} onClick={onBack}><ChevronLeft/></button><h1>{title}</h1>
    {onRegrade && <button className="icon-btn" aria-label={m.regrade} onClick={onRegrade}><RotateCcw/></button>}</div>;
}

export function BottomNav({ active, onNavigate }: { active: Tab; onNavigate: (tab: Tab) => void }) {
  const tabs = [{ id: 'home', Icon: Camera, title: m.home }, { id: 'history', Icon: History, title: m.history }, { id: 'settings', Icon: Settings2, title: m.settings }] as const;
  return <nav className="bottom-nav">{tabs.map(({ id, Icon, title }) => <a key={id} href={`#${id}`} aria-current={active === id ? 'page' : undefined}
    onClick={(event) => { event.preventDefault(); onNavigate(id); }}><Icon/>{title}</a>)}</nav>;
}

export function HistoryRows({ rows, onOpen, onRemove }: { rows: readonly HistoryItem[]; onOpen: (item: HistoryItem) => void; onRemove?: (item: HistoryItem) => void }) {
  return <div className="list">{rows.map((row) => {
    const { className, Icon } = verdictStyle[row.verdict];
    return <div className="list-row" key={row.id}>
      <button className="history-open" onClick={() => onOpen(row)}>
      <div className={`row-icon ${className}`}><Icon aria-hidden="true"/></div>
      <div className="row-main"><div className="row-title">{row.title}</div><div className="row-meta">{row.meta}</div></div>
      <span className={`badge ${className}`}>{row.status ?? m.verdictLabels[row.verdict]}</span></button>
      {onRemove && <button className="icon-btn" aria-label={`${sessionVi.remove}: ${row.title}`} onClick={() => onRemove(row)}><Trash2/></button>}</div>;
  })}</div>;
}

export function Crop({ image, crop, confirm = false }: { image: string; crop: CropData; confirm?: boolean }) {
  const r = crop.region;
  return <div className="crop" role="img" aria-label={m.photoAlt} style={{ height: crop.height, backgroundImage: `url(${image})`, backgroundSize: `${crop.zoom}% auto`, backgroundPosition: `${crop.x}% ${crop.y}%` }}>
    <div className={`mark${confirm ? ' mark-confirm' : ''}`} style={{ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` }}/></div>;
}

export function LoadingScreen({ title, onCancel }: { title: string; onCancel: () => void }) {
  return <div className="screen"><div className="topbar"><button className="icon-btn" aria-label={m.cancel} onClick={onCancel}><X/></button><h1>{title}</h1></div>
    <div className="content"><div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span className="section-title">{m.loading.title}</span><span className="text-sm muted math">{m.loading.elapsed}</span></div>
      <div className="bar"><i style={{ width: '55%' }}/></div><div>
        <div className="stage stage-done"><CircleCheck/>{m.loading.stages[0]}</div>
        <div className="stage stage-now"><LoaderCircle/>{m.loading.stages[1]}</div>
        <div className="stage stage-wait"><CircleDashed/>{m.loading.stages[2]}</div>
      </div><p className="text-xs muted" style={{ margin: 0 }}>{m.loading.note}</p></div>
      <div className="skeleton" style={{ height: 180, borderRadius: 16 }}/></div></div>;
}

export function Actions({ children }: { children: ReactNode }) { return <div className="sticky-actions">{children}</div>; }
export function NextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className="btn btn-primary" style={{ flex: 2 }} onClick={onClick}>{children}<ArrowRight/></button>;
}

// SVG geometry/styles from graph() in the wireframe; no layout or solver algorithm.
export function GraphPreview({ data, unsure = false, size = 220 }: { data: GraphDrawing; unsure?: boolean; size?: number }) {
  return <svg className="graph-svg math" viewBox="0 0 220 200" width="100%" role="img" aria-label={m.graphAlt} style={{ maxWidth: size, display: 'block', margin: 'auto' }}>
    {data.edges.map(({ uncertain, ...line }, index) => <line key={index} {...line} className={unsure && uncertain ? 'unsure' : undefined}/>)}
    {data.weights.map((weight, index) => { const marked = unsure && weight.uncertainX !== undefined;
      return <text key={index} className={`w${marked ? ' w-unsure' : ''}`} x={marked ? weight.uncertainX : weight.x} y={weight.y}>{weight.value}{marked ? ' ?' : ''}</text>;
    })}
    {data.vertices.map((vertex) => <React.Fragment key={vertex.label}><circle cx={vertex.x} cy={vertex.y} r="14"/><text x={vertex.x} y={vertex.y}>{vertex.label}</text></React.Fragment>)}
  </svg>;
}
