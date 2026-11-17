import { validateSpec } from '@mathtwin/core';
import type { Graph } from '@mathtwin/core';
import { normalizeLabel } from '@mathtwin/reader';
import type { ReadDraft } from '@mathtwin/reader';
import { graphEditorVi as m } from './graph-editor.vi.js';

/**
 * Editable graph shown over the photo. Positions are fractions of the image (0..1) so the drawing
 * follows the photo at any screen size. Weights stay as typed text until the user confirms.
 */
export interface EditorVertex { key: string; label: string; x: number; y: number; flagged: boolean }
export interface EditorEdge { key: string; u: string; v: string; w: string; name: string; flagged: boolean }
export interface EditorGraph { vertices: EditorVertex[]; edges: EditorEdge[]; nextKey: number }

export const emptyEditorGraph = (): EditorGraph => ({ vertices: [], edges: [], nextKey: 1 });
const clamp = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
const unreadLabel = /^unreadable\d+$/;

/** ReadDraft boxes are normalized to 0–1000 on each axis; unread labels become empty so the user must type them. */
export function fromDraft(draft: ReadDraft, threshold = 0.85): EditorGraph {
  let next = 1;
  const keyOf = new Map<string, string>();
  const vertices = draft.vertices.map((vertex, index): EditorVertex => {
    const key = `v${next++}`; keyOf.set(vertex.label, key);
    const box = vertex.box;
    // A vertex without a box is spread on a circle; it is still editable and draggable by re-adding.
    const angle = (2 * Math.PI * index) / Math.max(1, draft.vertices.length);
    const x = box ? (box[0] + box[2]) / 2000 : 0.5 + 0.35 * Math.cos(angle);
    const y = box ? (box[1] + box[3]) / 2000 : 0.5 + 0.35 * Math.sin(angle);
    const unread = unreadLabel.test(vertex.label);
    return { key, label: unread ? '' : vertex.label, x: clamp(x), y: clamp(y), flagged: unread || vertex.conf < threshold };
  });
  const edges = draft.edges.flatMap((edge): EditorEdge[] => {
    const u = keyOf.get(edge.u), v = keyOf.get(edge.v);
    if (!u || !v) return [];
    const flagged = edge.conf < threshold || edge.wAlternatives.length > 0 || (edge.uConf ?? 1) < threshold || (edge.vConf ?? 1) < threshold;
    return [{ key: `e${next++}`, u, v, w: edge.w === null ? '' : String(edge.w), name: edge.name ?? '', flagged }];
  });
  return { vertices, edges, nextKey: next };
}

export function addVertex(g: EditorGraph, x: number, y: number): EditorGraph {
  return { ...g, vertices: [...g.vertices, { key: `v${g.nextKey}`, label: suggestLabel(g), x: clamp(x), y: clamp(y), flagged: false }], nextKey: g.nextKey + 1 };
}
/** Next unused capital letter, so a hand-entered graph starts with readable names. */
export function suggestLabel(g: EditorGraph): string {
  const used = new Set(g.vertices.map((v) => normalizeLabel(v.label)));
  for (let i = 0; i < 26; i++) { const label = String.fromCharCode(65 + i); if (!used.has(normalizeLabel(label))) return label; }
  return '';
}
export function removeVertex(g: EditorGraph, key: string): EditorGraph {
  return { ...g, vertices: g.vertices.filter((v) => v.key !== key), edges: g.edges.filter((e) => e.u !== key && e.v !== key) };
}
export function moveVertex(g: EditorGraph, key: string, x: number, y: number): EditorGraph {
  return { ...g, vertices: g.vertices.map((v) => v.key === key ? { ...v, x: clamp(x), y: clamp(y) } : v) };
}
export function renameVertex(g: EditorGraph, key: string, label: string): EditorGraph {
  return { ...g, vertices: g.vertices.map((v) => v.key === key ? { ...v, label, flagged: false } : v) };
}
/** Same vertex twice is a loop; repeating a pair adds a parallel edge (multigraphs are allowed). */
export function addEdge(g: EditorGraph, u: string, v: string): EditorGraph {
  if (!g.vertices.some((x) => x.key === u) || !g.vertices.some((x) => x.key === v)) return g;
  return { ...g, edges: [...g.edges, { key: `e${g.nextKey}`, u, v, w: '', name: '', flagged: false }], nextKey: g.nextKey + 1 };
}
export function removeEdge(g: EditorGraph, key: string): EditorGraph {
  return { ...g, edges: g.edges.filter((e) => e.key !== key) };
}
export function updateEdge(g: EditorGraph, key: string, change: Partial<Pick<EditorEdge, 'w' | 'name'>>): EditorGraph {
  return { ...g, edges: g.edges.map((e) => e.key === key ? { ...e, ...change, flagged: false } : e) };
}
export function clearFlag(g: EditorGraph, key: string): EditorGraph {
  return { ...g, vertices: g.vertices.map((v) => v.key === key ? { ...v, flagged: false } : v),
    edges: g.edges.map((e) => e.key === key ? { ...e, flagged: false } : e) };
}
export const flaggedCount = (g: EditorGraph): number => g.vertices.filter((v) => v.flagged).length + g.edges.filter((e) => e.flagged).length;

/** Display name for an edge in lists: "A–B", loop "A–A". */
export function edgeTitle(g: EditorGraph, edge: EditorEdge): string {
  const label = (key: string) => g.vertices.find((v) => v.key === key)?.label.trim() || m.unnamed;
  return `${label(edge.u)}–${label(edge.v)}`;
}

/**
 * Converts the editor state into a core Graph. Every problem is reported in Vietnamese; the graph is
 * returned only when the user has nothing left to fix and core `validateSpec` accepts it.
 */
export function toGraph(g: EditorGraph, needsWeights = false): { graph: Graph | null; problems: string[] } {
  const problems: string[] = [];
  if (!g.vertices.length) problems.push(m.problems.noVertex);
  if (g.vertices.length > 20) problems.push(m.problems.tooMany);
  const seen = new Map<string, string>();
  for (const v of g.vertices) {
    const label = v.label.trim();
    if (!label) { problems.push(m.problems.emptyLabel); continue; }
    const key = normalizeLabel(label);
    if (seen.has(key)) problems.push(m.problems.duplicate(label)); else seen.set(key, label);
  }
  const weights = g.edges.map((e) => e.w.trim());
  weights.forEach((w, i) => {
    if (w && !(/^\d+(?:[.,]\d+)?$/.test(w) && Number(w.replace(',', '.')) > 0)) problems.push(m.problems.badWeight(edgeTitle(g, g.edges[i]!), w));
  });
  const filled = weights.filter(Boolean).length;
  if (filled > 0 && filled < weights.length) problems.push(m.problems.partialWeights);
  if (needsWeights && g.edges.length && filled < weights.length) problems.push(m.problems.missingWeights);
  if ([...new Set(problems)].length !== problems.length) problems.splice(0, problems.length, ...new Set(problems));
  if (problems.length) return { graph: null, problems };
  const id = new Map(g.vertices.map((v) => [v.key, v.label.trim()]));
  const graph: Graph = { directed: false, vertices: g.vertices.map((v) => ({ id: v.label.trim(), label: v.label.trim() })),
    edges: g.edges.map((e, i) => ({ id: `e${i + 1}`, u: id.get(e.u)!, v: id.get(e.v)!,
      ...(e.w.trim() ? { w: Number(e.w.trim().replace(',', '.')) } : {}), ...(e.name.trim() ? { name: e.name.trim() } : {}) })) };
  const checked = validateSpec({ graph, task: { type: 'elements' }, questionFormat: 'tu_luan' });
  return checked.ok ? { graph, problems: [] } : { graph: null, problems: checked.errors };
}

/** Screen geometry for drawing: straight edge, bowed parallel edge, or loop above the vertex. */
export interface EdgeShape { key: string; path: string; labelX: number; labelY: number }
export function edgeShapes(g: EditorGraph, width: number, height: number): EdgeShape[] {
  const at = new Map(g.vertices.map((v) => [v.key, [v.x * width, v.y * height] as const]));
  const groups = new Map<string, EditorEdge[]>();
  for (const e of g.edges) { const k = [e.u, e.v].sort().join('|'); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const shapes: EdgeShape[] = [];
  const r = Math.min(width, height) * 0.045;
  for (const edges of groups.values()) edges.forEach((e, i) => {
    const a = at.get(e.u), b = at.get(e.v); if (!a || !b) return;
    if (e.u === e.v) {
      const size = r * (1.6 + i * 0.7), [x, y] = a;
      shapes.push({ key: e.key, path: `M ${x - r * 0.5} ${y - r * 0.7} C ${x - size} ${y - size * 2.2}, ${x + size} ${y - size * 2.2}, ${x + r * 0.5} ${y - r * 0.7}`,
        labelX: x, labelY: y - size * 1.9 });
      return;
    }
    // Keep a stable direction for the bow so parallel edges fan out symmetrically.
    const [p, q] = e.u < e.v ? [a, b] : [b, a];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    const offset = (i - (edges.length - 1) / 2) * r * 1.8;
    const cx = (p[0] + q[0]) / 2 - (dy / len) * offset * 2, cy = (p[1] + q[1]) / 2 + (dx / len) * offset * 2;
    shapes.push({ key: e.key, path: `M ${p[0]} ${p[1]} Q ${cx} ${cy} ${q[0]} ${q[1]}`,
      labelX: (p[0] + q[0]) / 4 + cx / 2, labelY: (p[1] + q[1]) / 4 + cy / 2 });
  });
  return shapes;
}
