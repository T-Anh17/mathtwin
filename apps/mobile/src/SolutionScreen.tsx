import React, { useState } from 'react';
import type { Graph, Highlight, SolutionStep } from '@mathtwin/core';
import type { GraphLayout, Session } from './flow/types.js';
import { graphDrawing, sessionGraphLayout, solutionGraph } from './flow/graph.js';
import { solutionView } from './flow/view.js';
import { solutionVi as m } from './solution.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { Actions, Topbar } from './product-ui.js';
import './solution.css';

export function SolutionGraph({ graph, layout, highlight = {} }: { graph: Graph; layout?: GraphLayout; highlight?: Highlight }) {
  const drawing = graphDrawing(graph, layout);
  return <svg className="graph-svg math solution-graph" viewBox={drawing.viewBox} role="img" aria-label={m.graph}
    style={{ '--solution-font-size': `${drawing.fontSize}px` } as React.CSSProperties}>
    {drawing.edges.map((e) => <g key={e.id} data-edge={e.id}>
      <path d={e.path} className={highlight.edges?.includes(e.id) ? 'hl' : undefined}/>
    </g>)}
    {drawing.edges.map((e) => {
      const label = [e.name, e.w].filter((v) => v !== undefined).join(' · ');
      const width = label.length * drawing.fontSize * 0.7 + 10;
      return label && <g key={e.id} className="edge-label">
        <rect x={e.labelX - width / 2} y={e.labelY - drawing.fontSize * 1.25} width={width} height={drawing.fontSize * 1.3} rx="4"/>
        <text className="w" x={e.labelX} y={e.labelY - drawing.fontSize * 0.6}>{label}</text>
      </g>;
    })}
    {drawing.vertices.map((v) => <g key={v.id} data-vertex={v.id} className={highlight.vertices?.includes(v.id) ? 'selected-vertex' : undefined}>
      <circle cx={v.x} cy={v.y} r={drawing.vertexRadius}/>
      {highlight.circled?.includes(v.id) && <circle className="settled" cx={v.x} cy={v.y} r={drawing.vertexRadius + 6}/>}
      <text x={v.x} y={v.y}>{v.label}</text>
      {highlight.labels && Object.hasOwn(highlight.labels, v.id) && <text className="distance" x={v.x + drawing.vertexRadius + 12} y={v.y + drawing.vertexRadius + 12}>
        {highlight.labels[v.id] === null ? '∞' : highlight.labels[v.id]}</text>}
    </g>)}
  </svg>;
}

export function SolutionSteps({ steps, selected, onSelect }: { steps: SolutionStep[]; selected?: number; onSelect: (index: number) => void }) {
  return <ol className="solution-steps">{steps.map((v) => <li key={v.index}><button className="solution-step" aria-pressed={selected === v.index}
    onClick={() => onSelect(v.index)}><span className="solution-number math">{v.index}</span><span>{v.text}</span></button></li>)}</ol>;
}

export function WorkEntryChoices({ busy, onWork, onBack }: { busy: boolean; onWork: (source: 'photo' | 'manual') => void; onBack: () => void }) {
  return <div className="solution-input" role="group" aria-label={m.choose}>
    <button className="btn btn-primary btn-block" disabled={busy} onClick={() => onWork('photo')}>{m.photo}</button>
    <button className="btn btn-outline btn-block" disabled={busy} onClick={() => onWork('manual')}>{m.manual}</button>
    <button className="btn btn-ghost btn-block" onClick={onBack}>{m.back}</button>
  </div>;
}

export function SolutionScreen({ session: s, busy, onBack, onWork }: {
  session: Session; busy: boolean; onBack: () => void; onWork: (source: 'photo' | 'manual') => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  if (!s.specConfirmed || !s.spec || !s.solution) return null;
  const data = solutionView(s.spec, s.solution);
  const step = selected === null ? [...data.steps].reverse().find((v) => v.highlight) ?? data.steps.at(-1) : data.steps.find((v) => v.index === selected);
  const layout = s.spec.task.type === 'degree_sequence' ? undefined : sessionGraphLayout(s);
  return <div className="screen solution-screen" data-stage="solution"><Topbar title={sessionVi.stages.solution} onBack={onBack}/>
    <div className="content">
      <h2 className="section-title">{m.title} · {sessionVi.tasks[s.spec.task.type]}</h2>
      <section className="card"><h3 className="section-title">{m.answer}</h3><p className="math solution-answer">{data.answer}</p></section>
      <div className="card"><SolutionGraph graph={solutionGraph(s.spec, s.solution)} {...(layout ? { layout } : {})} highlight={step?.highlight ?? {}}/>
        <p className="text-xs muted">{m.tap}</p><p className="text-sm" role="status">{selected === null ? m.answer : m.step(selected)}</p></div>
      <section className="card"><h3 className="section-title">{m.steps}</h3><SolutionSteps steps={data.steps} {...(selected === null ? {} : { selected })} onSelect={setSelected}/></section>
      {data.notes.length > 0 && <section className="card"><h3 className="section-title">{m.notes}</h3><ul>{data.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></section>}
    </div>
    <Actions>{choosing ? <WorkEntryChoices busy={busy} onWork={onWork} onBack={() => setChoosing(false)}/>
      : <button className="btn btn-primary btn-block" disabled={busy} onClick={() => setChoosing(true)}>{m.grade}</button>}</Actions>
  </div>;
}
