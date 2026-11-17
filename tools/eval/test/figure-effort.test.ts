import { expect, it } from 'vitest';
import type { ReadDraft } from '@mathtwin/reader';
import { figureEffort } from '../src/figure-effort.js';
import type { FigureAnnotation } from '../src/figure-geometry.js';

const vertex = (id: string, x: number, y: number) => ({ id, label: id, center: [x, y] as [number, number], contours: [], labelBox: [x - 10, y - 10, x + 10, y + 10] as [number, number, number, number], style: 'open', gap: 0 });
const figure: FigureAnnotation = { version: 1, width: 1000, height: 1000, box: [0, 0, 1000, 1000],
  vertices: [vertex('A', 100, 100), vertex('B', 500, 100), vertex('C', 300, 500)],
  edges: [{ id: 'e1', u: 'A', v: 'B', polyline: [], w: 3, name: null }, { id: 'e2', u: 'A', v: 'B', polyline: [], w: 4, name: null }, { id: 'e3', u: 'C', v: 'C', polyline: [], w: 1, name: 'm' }],
  crossings: [] };
const v = (label: string, x: number, y: number): ReadDraft['vertices'][number] => ({ label, conf: 0, box: [x - 15, y - 15, x + 15, y + 15] });
const e = (u: string, w: string): ReadDraft['edges'][number] => ({ u, v: w, w: null, wAlternatives: [], name: null, conf: 1 });

it('counts the taps and typed fields needed to turn a D draft into the annotated graph', () => {
  const draft = { vertices: [v('unreadable1', 105, 95), v('unreadable2', 510, 110), v('unreadable3', 800, 800)],
    edges: [e('unreadable1', 'unreadable2'), e('unreadable2', 'unreadable3'), e('unreadable1', 'unreadable1')] };
  expect(figureEffort(draft, figure)).toEqual({
    // 1 extra vertex, 2 labels, missing C (tap + label), 1 extra loop at A, 1 missing A–B and the loop at C, 3 weights + 1 name.
    draftOps: 1 + 2 + 2 + 1 + 2 + 4, manualOps: 3 + 3 + 4,
    matchedVertices: 2, extraVertices: 1, missingVertices: 1, matchedEdges: 1, extraEdges: 1, missingEdges: 2 });
});
it('scales normalized 0–1000 draft boxes to the annotated image size', () => {
    const wide = { ...figure, width: 2000 };
    const draft = { vertices: [v('A', 50, 100), v('B', 250, 100), v('C', 150, 500)], edges: [e('A', 'B'), e('A', 'B'), e('C', 'C')] };
    const scaled = { ...wide, vertices: figure.vertices.map((x) => ({ ...x, center: [x.center[0], x.center[1]] as [number, number] })) };
    expect(figureEffort(draft, scaled).matchedVertices).toBe(3);
  });
it('a perfect labelled draft only needs the values; an empty draft costs more than manual entry', () => {
  const perfect = { vertices: [v('A', 100, 100), v('B', 500, 100), v('C', 300, 500)], edges: [e('A', 'B'), e('A', 'B'), e('C', 'C')] };
  expect(figureEffort(perfect, figure).draftOps).toBe(4);
  const empty = figureEffort({ vertices: [], edges: [] }, figure);
  expect(empty.draftOps).toBeGreaterThan(empty.manualOps);
});
