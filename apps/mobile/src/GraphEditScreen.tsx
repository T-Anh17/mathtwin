import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheckBig, Eye, EyeOff, ImagePlus, Link2, LoaderCircle, Plus, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Graph } from '@mathtwin/core';
import type { PreparedImage } from '@mathtwin/reader';
import { graphEditorVi as m } from './graph-editor.vi.js';
import { addEdge, addVertex, clearFlag, edgeShapes, edgeTitle, emptyEditorGraph, flaggedCount, removeEdge, removeVertex, renameVertex, toGraph, updateEdge } from './graph-editor.js';
import type { EditorGraph } from './graph-editor.js';
import { suggestGraph } from './figure-suggest.js';
import type { FigureRunner } from './figure-suggest.js';
import { Actions, Topbar } from './product-ui.js';
import './graph-editor.css';

type Mode = 'vertex' | 'edge' | 'remove';
export interface GraphEditProps {
  /** Photo data URL; null for manual entry without a photo. Stays in memory only. */
  photo: string | null;
  decode: (dataUrl: string) => Promise<PreparedImage>;
  runner: FigureRunner;
  onBack: () => void;
  onPickPhoto?: () => void;
  onDone?: (graph: Graph) => void;
  initial?: EditorGraph;
}
const WIDTH = 1000;

export function GraphEditScreen({ photo, decode, runner, onBack, onPickPhoto, onDone, initial }: GraphEditProps) {
  const [graph, setGraph] = useState<EditorGraph>(initial ?? emptyEditorGraph());
  const [mode, setMode] = useState<Mode>('vertex');
  const [from, setFrom] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(true);
  const [aspect, setAspect] = useState(0.75);
  const [suggesting, setSuggesting] = useState<AbortController | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Graph | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  useEffect(() => () => suggesting?.abort(), [suggesting]);
  useEffect(() => { setFrom(null); }, [mode]);

  const height = WIDTH * aspect;
  const shapes = useMemo(() => edgeShapes(graph, WIDTH, height), [graph, height]);
  const result = useMemo(() => toGraph(graph), [graph]);
  const flagged = flaggedCount(graph);
  const r = Math.max(18, WIDTH * 0.03);
  const label = (key: string) => graph.vertices.find((v) => v.key === key)?.label || m.unnamed;
  const hint = mode === 'edge' && from ? m.hints.edgeFrom(label(from)) : m.hints[mode];

  const point = (event: React.MouseEvent): [number, number] | null => {
    const box = svg.current?.getBoundingClientRect(); if (!box || !box.width || !box.height) return null;
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
  };
  const onCanvas = (event: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'vertex') return;
    const p = point(event); if (p) setGraph((g) => addVertex(g, p[0], p[1]));
  };
  const onVertex = (event: React.MouseEvent, key: string) => {
    event.stopPropagation();
    if (mode === 'remove') { setGraph((g) => removeVertex(g, key)); return; }
    if (mode !== 'edge') return;
    if (!from) { setFrom(key); return; }
    setGraph((g) => addEdge(g, from, key)); setFrom(null);
  };
  const onEdge = (event: React.MouseEvent, key: string) => {
    event.stopPropagation();
    if (mode === 'remove') setGraph((g) => removeEdge(g, key));
  };
  const suggest = async () => {
    if (!photo) return;
    if ((graph.vertices.length || graph.edges.length) && !window.confirm(m.replaceConfirm)) return;
    const controller = new AbortController(); setSuggesting(controller); setNotice(null);
    try {
      const image = await decode(photo);
      const { graph: drafted, empty } = await suggestGraph(image, runner, controller.signal);
      if (empty) setNotice(m.suggestEmpty); else { setGraph(drafted); setNotice(m.suggestNote); }
    } catch (e) {
      if (!controller.signal.aborted) setNotice(m.suggestFailed);
    } finally { setSuggesting(null); }
  };
  const confirm = () => { if (!result.graph) return; setDone(result.graph); onDone?.(result.graph); };

  if (done) return <div className="screen">
    <Topbar title={m.doneTitle} onBack={onBack}/>
    <div className="content"><div className="card empty">
      <div className="empty-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><CircleCheckBig/></div>
      <div className="section-title">{m.doneSummary(done.vertices.length, done.edges.length)}</div>
      <p className="text-sm muted" style={{ margin: 0 }}>{m.doneNote}</p></div></div>
    <Actions><button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDone(null)}>{m.editAgain}</button></Actions></div>;

  const vertices = [...graph.vertices].sort((a, b) => Number(b.flagged) - Number(a.flagged));
  const edges = [...graph.edges].sort((a, b) => Number(b.flagged) - Number(a.flagged));
  return <div className="screen graph-edit">
    <Topbar title={photo ? m.title : m.manualTitle} onBack={onBack}/>
    <div className="content">
      <p className="text-sm muted" style={{ margin: 0 }}>{photo ? m.intro : m.manualIntro}</p>
      {notice && <div className="banner banner-info" role="status"><TriangleAlert/><div>{notice}</div></div>}
      <div className="seg" role="group" aria-label={m.title}>
        {(['vertex', 'edge', 'remove'] as const).map((id) => <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
          {id === 'vertex' ? <Plus/> : id === 'edge' ? <Link2/> : <Trash2/>}{m.modes[id]}</button>)}
      </div>
      <p className="text-xs muted graph-hint">{hint}</p>
      <div className="graph-canvas" style={{ aspectRatio: `${1 / aspect}` }}>
        {photo && <img src={photo} alt={m.photo} style={{ opacity: showPhoto ? 1 : 0 }}
          onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setAspect(i.naturalHeight / i.naturalWidth); }}/>}
        <svg ref={svg} viewBox={`0 0 ${WIDTH} ${height}`} className={`graph-svg math mode-${mode}`} role="img" aria-label={m.overlay} onClick={onCanvas}>
          {shapes.map((s) => { const e = graph.edges.find((x) => x.key === s.key)!;
            return <g key={s.key} className={e.flagged ? 'flag' : undefined} onClick={(ev) => onEdge(ev, s.key)}>
              <path d={s.path} className="hit"/><path d={s.path}/>
              {(e.w || e.name) && <text className="w" x={s.labelX} y={s.labelY}>{[e.name, e.w].filter(Boolean).join(' ')}</text>}
            </g>; })}
          {graph.vertices.map((v) => <g key={v.key} className={`${v.flagged ? 'flag' : ''}${from === v.key ? ' picked' : ''}`} onClick={(ev) => onVertex(ev, v.key)}>
            <circle cx={v.x * WIDTH} cy={v.y * height} r={r}/>
            <text x={v.x * WIDTH} y={v.y * height}>{v.label || m.unnamed}</text></g>)}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {photo ? <button className="btn btn-ghost" onClick={() => setShowPhoto((s) => !s)}>{showPhoto ? <EyeOff/> : <Eye/>}{showPhoto ? m.hidePhoto : m.showPhoto}</button>
          : onPickPhoto && <button className="btn btn-ghost" onClick={onPickPhoto}><ImagePlus/>{m.choosePhoto}</button>}
        {photo && (suggesting
          ? <button className="btn btn-ghost" onClick={() => suggesting.abort()}><LoaderCircle className="spin"/>{m.suggesting}<X/></button>
          : <button className="btn btn-ghost" onClick={() => void suggest()}><Sparkles/>{m.suggest}</button>)}
      </div>
      {flagged > 0 && <span className="chip graph-flag-chip"><TriangleAlert/>{m.flagged(flagged)}</span>}
      <section className="card graph-list"><div className="section-title">{m.vertices(graph.vertices.length)}</div>
        {vertices.length ? vertices.map((v) => <div key={v.key} className={`graph-row${v.flagged ? ' flag' : ''}`}>
          <input aria-label={m.label} value={v.label} placeholder={m.label} maxLength={6} onChange={(e) => setGraph((g) => renameVertex(g, v.key, e.target.value))}/>
          {v.flagged && <button className="btn btn-ghost" onClick={() => setGraph((g) => clearFlag(g, v.key))}>{m.check}</button>}
          <button className="icon-btn" aria-label={m.remove} onClick={() => setGraph((g) => removeVertex(g, v.key))}><Trash2/></button></div>)
          : <p className="text-sm muted" style={{ margin: 0 }}>{m.noVertices}</p>}
      </section>
      <section className="card graph-list"><div className="section-title">{m.edges(graph.edges.length)}</div>
        {edges.length ? edges.map((e) => <div key={e.key} className={`graph-row${e.flagged ? ' flag' : ''}`}>
          <span className="graph-edge-title math">{edgeTitle(graph, e)}</span>
          <input aria-label={m.weight} value={e.w} placeholder={m.weight} inputMode="decimal" maxLength={8} onChange={(ev) => setGraph((g) => updateEdge(g, e.key, { w: ev.target.value }))}/>
          <input aria-label={m.name} value={e.name} placeholder={m.name} maxLength={4} className="narrow" onChange={(ev) => setGraph((g) => updateEdge(g, e.key, { name: ev.target.value }))}/>
          <button className="icon-btn" aria-label={m.remove} onClick={() => setGraph((g) => removeEdge(g, e.key))}><Trash2/></button></div>)
          : <p className="text-sm muted" style={{ margin: 0 }}>{m.noEdges}</p>}
      </section>
      {result.problems.length > 0 && <div className="banner banner-error"><TriangleAlert/><div><b>{m.fix}</b>
        <ul className="graph-problems">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul></div></div>}
    </div>
    <Actions><button className="btn btn-primary btn-block" disabled={!result.graph} onClick={confirm}><CircleCheckBig/>{m.done}</button></Actions>
  </div>;
}
