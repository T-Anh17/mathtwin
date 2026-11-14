import type { Graph, ProblemSpec, Task } from '@mathtwin/core';
import { validateSpec } from '@mathtwin/core';
import { confirmationMessages } from './messages.vi.js';
import { displayLabel, mapReferences, normalizeLabel, referenceMapper, same } from './model.js';

/** Apply all answers atomically to a clone, then validate before returning. */
export function applyConfirmation(spec: ProblemSpec, answers: Record<string, unknown>): ProblemSpec {
  try {
    return confirm(spec, answers);
  } catch (error) {
    if (error instanceof Error && error.message === confirmationMessages.unknown) throw error;
    throw new Error(confirmationMessages.invalid);
  }
}

function confirm(spec: ProblemSpec, answers: Record<string, unknown>): ProblemSpec {
  if (!validateSpec(spec).ok) throw new Error(confirmationMessages.invalid);
  const result = structuredClone(spec);
  const removed = new Set<string>();
  for (const [item, value] of Object.entries(answers)) {
    const edge = result.graph.edges.find((edge) => item === edge.id);
    const fieldEdge = result.graph.edges.find((edge) => ['w', 'u', 'v'].some((field) => item === `${edge.id}.${field}`));
    const vertex = result.graph.vertices.find((vertex) => item === vertex.id);
    if (item === 'graph') {
      if (!validateSpec({ graph: value as Graph, task: { type: 'elements' }, questionFormat: 'tu_luan' }).ok) {
        throw new Error(confirmationMessages.invalid);
      }
      result.graph = structuredClone(value) as Graph;
    } else if (item === 'questionFormat') {
      result.questionFormat = value as ProblemSpec['questionFormat'];
    } else if (/^task\.(type|vertices|sequence|simple|from|to|want|start|end|method|items)$/.test(item)) {
      const field = item.slice(5);
      const task = { ...result.task } as unknown as Record<string, unknown>;
      if (value === undefined || value === null) delete task[field];
      else task[field] = structuredClone(value);
      result.task = task as unknown as Task;
    } else if (fieldEdge !== undefined) {
      const field = item.slice(fieldEdge.id.length + 1);
      if (field === 'w') {
        if (value === null) delete fieldEdge.w;
        else fieldEdge.w = value as number;
      } else {
        if (typeof value !== 'string') throw new Error(confirmationMessages.invalid);
        fieldEdge[field as 'u' | 'v'] = referenceMapper(result.graph)(value);
      }
    } else if (edge !== undefined) {
      if (typeof value !== 'boolean') throw new Error(confirmationMessages.invalid);
      if (!value) {
        result.graph.edges = result.graph.edges.filter((e) => e.id !== edge.id);
        removed.add(edge.id);
      }
    } else if (vertex !== undefined) {
      if (value === false) {
        result.graph.vertices = result.graph.vertices.filter((v) => v.id !== vertex.id);
        result.graph.edges = result.graph.edges.filter((e) => {
          if (e.u !== vertex.id && e.v !== vertex.id) return true;
          removed.add(e.id); return false;
        });
        removed.add(vertex.id);
      } else {
        if (typeof value !== 'string') throw new Error(confirmationMessages.invalid);
        const id = displayLabel(value);
        if (result.graph.vertices.some((other) => other !== vertex && normalizeLabel(other.id) === normalizeLabel(id))) {
          throw new Error(confirmationMessages.invalid);
        }
        vertex.id = id; vertex.label = id;
        for (const e of result.graph.edges) {
          if (e.u === item) e.u = id;
          if (e.v === item) e.v = id;
        }
        result.task = mapReferences(result.task, (reference) => reference === item ? id : reference);
      }
    } else throw new Error(confirmationMessages.unknown);
  }
  result.task = mapReferences(result.task, referenceMapper(result.graph));
  if (result.uncertain !== undefined) {
    result.uncertain = result.uncertain.filter(({ item }) => !Object.hasOwn(answers, item)
      && ![...removed].some((id) => item === id || item.startsWith(`${id}.`)));
    // Keep the contract that each unresolved flag begins with the value now in use.
    for (const uncertainty of result.uncertain) {
      const item = uncertainty.item;
      const edge = result.graph.edges.find((e) => item === e.id || item.startsWith(`${e.id}.`));
      const used = item === 'graph' ? result.graph : item === 'questionFormat' ? result.questionFormat
        : item.startsWith('task.') ? (result.task as unknown as Record<string, unknown>)[item.slice(5)]
          : edge === undefined ? item : item === edge.id ? true : edge[item.slice(edge.id.length + 1) as 'w' | 'u' | 'v'];
      const current = used === undefined ? null : used;
      uncertainty.candidates = [structuredClone(current), ...uncertainty.candidates.filter((c) => !same(c, current))];
    }
  }
  if (!validateSpec(result).ok) throw new Error(confirmationMessages.invalid);
  return result;
}
