import type { Graph } from '@mathtwin/core';

/** Display references only; IDs remain unchanged in events and highlights. */
export function graphLabels(graph: Graph) {
  const vertex = (id: string) => graph.vertices.find((v) => v.id === id)?.label ?? 'đỉnh chưa đọc rõ';
  const edge = (id: string) => {
    const e = graph.edges.find((e) => e.id === id);
    if (!e) return 'cạnh chưa đọc rõ';
    if (e.name) return e.name;
    const parallel = graph.edges.filter((other) => (other.u === e.u && other.v === e.v) || (other.u === e.v && other.v === e.u)).length > 1;
    return `${vertex(e.u)}–${vertex(e.v)}${parallel && e.w !== undefined ? ` (${e.w})` : ''}`;
  };
  const references = new Map([...graph.vertices.map((v) => [v.id, v.label] as const), ...graph.edges.map((e) => [e.id, edge(e.id)] as const)]);
  // Core already labels vertices. Never rewrite numeric IDs inside arithmetic.
  const ids = [...references.keys()].filter((id) => !/^\d+(?:\.\d+)?$/.test(id)).sort((a, b) => b.length - a.length);
  const pattern = ids.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : undefined;
  const text = (value: string) => pattern ? value.replace(pattern, (id) => references.get(id)!) : value;
  return { vertex, edge, text };
}
