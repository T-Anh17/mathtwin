import type { ClaimBody, ProblemSpec } from '../types.js';
import { validateSpec } from '../validate.js';

export function uncertainEdge(spec: ProblemSpec, item: string): { index: number; field: 'w' | 'u' | 'v' | 'name' } | undefined {
  const indexed = /^(?:graph\.)?edges\[(\d+)\]\.(w|u|v|name)$/.exec(item);
  const index = indexed === null ? spec.graph.edges.findIndex((e) => ['w', 'u', 'v', 'name'].some((field) => item === `${e.id}.${field}`)) : Number(indexed[1]);
  const field = indexed?.[2] ?? item.slice(item.lastIndexOf('.') + 1);
  return index >= 0 && spec.graph.edges[index] !== undefined && (field === 'w' || field === 'u' || field === 'v' || field === 'name') ? { index, field } : undefined;
}

/** Replay the prefix with each replaceable candidate, without grading uncertainty again. */
export function relevantUncertainty(spec: ProblemSpec, claim: ClaimBody, replay: (variant: ProblemSpec) => boolean): string[] {
  return (spec.uncertain ?? []).filter(({ item, candidates }) => {
    const target = uncertainEdge(spec, item);
    if (target === undefined) return conservativeUncertainty(spec, claim).includes(item);
    return candidates.some((candidate) => {
      const edge = { ...spec.graph.edges[target.index]!, [target.field]: candidate };
      // Runtime validation narrows the unknown candidate before any solver uses it.
      const variant = { ...spec, graph: { ...spec.graph, edges: spec.graph.edges.map((e, i) => i === target.index ? edge : e) } } as ProblemSpec;
      return validateSpec(variant).ok && replay(variant);
    });
  }).map(({ item }) => item);
}

/** Unknown descriptive items retain the previous conservative dependency check. */
function conservativeUncertainty(spec: ProblemSpec, claim: ClaimBody): string[] {
  if ((claim.type === 'statement' || claim.type === 'choice') && spec.task.type === 'statements') {
    const id = claim.type === 'statement' ? claim.id : claim.option;
    const item = spec.task.items.find((item) => item.id === id);
    return item === undefined ? [] : conservativeUncertainty(spec, item.check);
  }
  return (spec.uncertain ?? []).filter(({ item }) => {
    const match = /^(?:graph\.)?edges\[(\d+)\](?:\.(\w+))?$/.exec(item);
    const named = spec.graph.edges.find((e) => item === e.id || item.startsWith(`${e.id}.`));
    const edge = match === null ? named : spec.graph.edges[Number(match[1])];
    const weight = match?.[2] === 'w' || (named !== undefined && item === `${named.id}.w`);
    if (weight && claim.type === 'final_answer' && ['elements', 'degree', 'degree_sequence', 'path', 'connectivity', 'euler', 'hamilton'].includes(spec.task.type)) return false;
    if (weight && ['vertex_count', 'edge_count', 'degree', 'degree_sum', 'odd_vertices', 'connected', 'euler_exists', 'hamilton_exists', 'theorem', 'walk'].includes(claim.type)) {
      return claim.type === 'walk' && spec.task.type === 'shortest_path';
    }
    if (edge !== undefined) {
      if (claim.type === 'vertex_count') return false;
      if (claim.type === 'degree') return edge.u === claim.v || edge.v === claim.v;
      if (claim.type === 'length' || claim.type === 'walk') {
        return claim.vertices.some((v, i) => i > 0 && ((edge.u === claim.vertices[i - 1] && edge.v === v) || (edge.v === claim.vertices[i - 1] && edge.u === v)));
      }
      return true;
    }
    if (item.startsWith('task.')) return ['final_answer', 'choice', 'statement', 'walk', 'dijkstra_init', 'dijkstra_select', 'dijkstra_label', 'nn_step'].includes(claim.type);
    // A vertex or whole graph uncertainty may change structure, including counts.
    return item === 'graph' || item === 'vertices' || item === 'edges' || item.startsWith('graph.')
      || spec.graph.vertices.some(({ id }) => item === id || item.startsWith(`${id}.`));
  }).map(({ item }) => item);
}
