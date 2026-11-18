import React from 'react';
import type { ProblemSpec, Task } from '@mathtwin/core';
import { problemVi as m } from './problem.vi.js';
import { sessionVi } from './flow/messages.vi.js';
import { StatementForm } from './StatementForm.js';

export function defaultTask(type: Task['type']): Task {
  switch (type) {
    case 'elements': case 'connectivity': case 'degree': return { type };
    case 'path': case 'shortest_path': return { type, from: '', to: '' };
    case 'euler': return { type, want: 'any' };
    case 'hamilton': return { type, want: 'cycle' };
    case 'tsp': return { type, method: 'both' };
    case 'postman': return { type, start: '' };
    case 'degree_sequence': return { type, sequence: [], simple: true };
    case 'statements': return { type, items: [] };
  }
}
export function ProblemForm({ spec, onChange, taskReviewed = true, onTaskEdited }: {
  spec: ProblemSpec; onChange: (spec: ProblemSpec) => void; taskReviewed?: boolean; onTaskEdited?: () => void;
}) {
  const task = spec.task;
  const update = (next: Task, explicit?: string) => { onTaskEdited?.(); onChange({ ...spec, task: next, uncertain: spec.uncertain?.filter((u) => {
    if (!u.item.startsWith('task.')) return true;
    const field = u.item.slice(5);
    return field !== explicit && JSON.stringify((task as unknown as Record<string, unknown>)[field]) === JSON.stringify((next as unknown as Record<string, unknown>)[field]);
  }) ?? [] }); };
  const field = (key: 'from' | 'to' | 'start' | 'end', required: boolean) => <label>{m[key]}
    <input value={key in task ? String((task as unknown as Record<string, unknown>)[key] ?? '') : ''} required={required}
      onChange={(e) => { const next = { ...task } as unknown as Record<string, unknown>;
        if (!required && !e.target.value.trim()) delete next[key]; else next[key] = e.target.value.trim();
        update(next as unknown as Task); }}/></label>;
  return <section className="card problem-form">
    <label>{m.task}<select value={taskReviewed ? task.type : ''} onChange={(e) => update(defaultTask(e.target.value as Task['type']), 'type')}>
      <option value="" disabled>{m.task}</option>{Object.entries(sessionVi.tasks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {(task.type === 'path' || task.type === 'shortest_path') && <>{field('from', true)}{field('to', true)}</>}
    {['euler', 'hamilton', 'tsp', 'postman'].includes(task.type) && field('start', task.type === 'postman')}
    {task.type === 'hamilton' && field('end', false)}
    {(task.type === 'hamilton' || task.type === 'euler') && <label>{m.want}<select value={task.want}
      onChange={(e) => update({ ...task, want: e.target.value } as Task)}>
      <option value="path">{m.path}</option><option value={task.type === 'euler' ? 'circuit' : 'cycle'}>{m.circuit}</option>
      {task.type === 'euler' && <option value="any">{m.any}</option>}</select></label>}
    {task.type === 'tsp' && <label>{m.method}<select value={task.method} onChange={(e) => update({ ...task, method: e.target.value as typeof task.method })}>
      {(['nearest_neighbor', 'optimal', 'both'] as const).map((v) => <option key={v} value={v}>{m[v]}</option>)}</select></label>}
    {task.type === 'degree' && <label>{m.vertices}<input key={task.vertices?.join(',')} defaultValue={task.vertices?.join(', ') ?? ''} onBlur={(e) => {
      const vertices = e.target.value.split(',').map((v) => v.trim()).filter(Boolean); update({ type: 'degree', ...(vertices.length ? { vertices } : {}) }); }}/></label>}
    {task.type === 'degree_sequence' && <><label>{m.sequence}<input key={task.sequence.join(',')} defaultValue={task.sequence.join(', ')} onBlur={(e) => update({ ...task,
      sequence: e.target.value.split(',').map((v) => Number(v.trim())) })}/></label>
      <label><input type="checkbox" checked={task.simple} onChange={(e) => update({ ...task, simple: e.target.checked })}/>{m.simple}</label></>}
    {task.type === 'statements' && <StatementForm items={task.items} onChange={(items) => update({ type: 'statements', items })}/>}
    <label>{m.format}<select value={spec.questionFormat} onChange={(e) => onChange({ ...spec,
      questionFormat: e.target.value as ProblemSpec['questionFormat'], uncertain: spec.uncertain?.filter((u) => u.item !== 'questionFormat') ?? [] })}>
      {Object.entries(m.formats).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
  </section>;
}
