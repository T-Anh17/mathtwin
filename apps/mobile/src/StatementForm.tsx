import React from 'react';
import type { StatementCheck, Task } from '@mathtwin/core';
import { problemVi as m } from './problem.vi.js';

type Item = Extract<Task, { type: 'statements' }>['items'][number];
function defaultCheck(type: StatementCheck['type']): StatementCheck {
  switch (type) {
    case 'vertex_count': case 'edge_count': case 'degree_sum': return { type, value: 0 };
    case 'degree': return { type, v: '', value: 0 };
    case 'odd_vertices': case 'postman_duplicate': return { type, vertices: [] };
    case 'connected': return { type, value: true };
    case 'euler_exists': return { type, kind: 'circuit', value: true };
    case 'hamilton_exists': return { type, kind: 'cycle', value: true };
    case 'theorem': return { type, name: 'dirac', holds: true };
    case 'walk': return { type, kind: 'path', vertices: [] };
    case 'length': return { type, vertices: [], value: 0 };
    case 'dijkstra_label': return { type, source: '', v: '', value: 0, via: '' };
    case 'nn_step': return { type, start: '', from: '', to: '' };
    case 'shortest_length': return { type, from: '', to: '', value: 0 };
  }
}
function options(check: StatementCheck, field: string): string[] | undefined {
  if (field === 'name') return ['dirac', 'ore'];
  if (field === 'reason') return ['dirac', 'ore', 'degree1', 'forced_edges', 'found'];
  if (field === 'kind') return check.type === 'euler_exists' ? ['path', 'circuit'] : check.type === 'hamilton_exists' ? ['path', 'cycle']
    : ['path', 'euler_path', 'euler_circuit', 'hamilton_path', 'hamilton_cycle', 'tsp_tour', 'postman_tour'];
  return;
}
export function StatementForm({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
  const update = (index: number, item: Item) => onChange(items.map((v, i) => i === index ? item : v));
  return <div className="problem-form"><b>{m.statements}</b>{items.map((item, index) => <section className="card problem-form" key={index}>
    <label>{m.statementId}<input value={item.id} onChange={(e) => update(index, { ...item, id: e.target.value })}/></label>
    <label>{m.statementText}<textarea value={item.text} onChange={(e) => update(index, { ...item, text: e.target.value })}/></label>
    <label>{m.checkType}<select value={item.check.type} onChange={(e) => update(index, { ...item, check: defaultCheck(e.target.value as StatementCheck['type']) })}>
      {Object.entries(m.checks).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    {Object.entries(item.check).filter(([key]) => key !== 'type').map(([key, value]) => {
      const label = m.checkFields[key as keyof typeof m.checkFields];
      const choices = options(item.check, key);
      const set = (next: unknown) => {
        const check = { ...item.check } as unknown as Record<string, unknown>;
        if (key === 'via' && next === '') delete check[key]; else check[key] = next;
        update(index, { ...item, check: check as unknown as StatementCheck });
      };
      return <label key={`${item.check.type}:${key}`}>{label}{choices ? <select value={String(value)} onChange={(e) => set(e.target.value)}>
        {choices.map((v) => <option key={v} value={v}>{m.checkOptions[v as keyof typeof m.checkOptions]}</option>)}</select>
        : typeof value === 'boolean' ? <select value={String(value)} onChange={(e) => set(e.target.value === 'true')}>
          <option value="true">{m.true}</option><option value="false">{m.false}</option></select>
        : <input defaultValue={Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value)} onBlur={(e) => set(Array.isArray(value)
          ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean) : typeof value === 'number' || value === null
            ? e.target.value.trim() ? Number(e.target.value) : null : e.target.value.trim())}/>}</label>;
    })}
    <button type="button" className="btn btn-outline" onClick={() => onChange(items.filter((_, i) => i !== index))}>{m.removeStatement}</button>
  </section>)}<button type="button" className="btn btn-outline" onClick={() => onChange([...items, { id: String(items.length + 1), text: '', check: defaultCheck('vertex_count') }])}>{m.addStatement}</button></div>;
}
