import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import type { ReadDraft } from '@mathtwin/reader';
import { addEdge, addVertex, clearFlag, edgeShapes, edgeTitle, emptyEditorGraph, flaggedCount, fromDraft, moveVertex, removeEdge, removeVertex, renameVertex, suggestLabel, toGraph, updateEdge } from '../src/graph-editor.js';
import type { EditorGraph } from '../src/graph-editor.js';
import { suggestGraph } from '../src/figure-suggest.js';
import type { FigureRunner } from '../src/figure-suggest.js';
import { graphEditorVi as m } from '../src/graph-editor.vi.js';

const image = { width: 1000, height: 500, pixels: new Uint8ClampedArray(1000 * 500 * 4) };
function build(...labels: string[]): EditorGraph {
  let g = emptyEditorGraph();
  labels.forEach((label, i) => { g = addVertex(g, 0.1 * (i + 1), 0.5); g = renameVertex(g, g.vertices.at(-1)!.key, label); });
  return g;
}
const key = (g: EditorGraph, label: string) => g.vertices.find((v) => v.label === label)!.key;
const draft = (vertices: ReadDraft['vertices'], edges: ReadDraft['edges']): ReadDraft => ({ representation: 'figure', directed: false, vertices, edges,
  statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null }, question: null, unreadable: [] });
const edge = (u: string, v: string, extra: Partial<ReadDraft['edges'][number]> = {}): ReadDraft['edges'][number] =>
  ({ u, v, w: null, wAlternatives: [], name: null, conf: 0.99, ...extra });

describe('graph editor model', () => {
  it('adds vertices with the next free capital label and clamps positions to the photo', () => {
    let g = addVertex(emptyEditorGraph(), 1.4, -0.2);
    expect(g.vertices[0]).toMatchObject({ label: 'A', x: 1, y: 0 });
    g = addVertex(renameVertex(addVertex(g, 0.5, 0.5), g.vertices[0]!.key, 'B'), 0.2, 0.2);
    expect(g.vertices.map((v) => v.label)).toEqual(['B', 'B', 'A']);
    expect(suggestLabel(build(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')))).toBe('');
    expect(moveVertex(g, g.vertices[0]!.key, 0.3, 0.7).vertices[0]).toMatchObject({ x: 0.3, y: 0.7 });
  });
  it('keeps loops and parallel edges, and removing a vertex removes its incident edges', () => {
    let g = build('A', 'B', 'C');
    g = addEdge(addEdge(addEdge(addEdge(g, key(g, 'A'), key(g, 'B')), key(g, 'A'), key(g, 'B')), key(g, 'A'), key(g, 'A')), key(g, 'B'), key(g, 'C'));
    expect(g.edges.map((e) => edgeTitle(g, e))).toEqual(['A–B', 'A–B', 'A–A', 'B–C']);
    const { graph } = toGraph(g);
    expect(graph?.edges.map((e) => `${e.u}${e.v}`)).toEqual(['AB', 'AB', 'AA', 'BC']);
    const without = removeVertex(g, key(g, 'A'));
    expect(without.edges.map((e) => edgeTitle(without, e))).toEqual(['B–C']);
    expect(removeEdge(g, g.edges[0]!.key).edges).toHaveLength(3);
    expect(addEdge(g, 'missing', key(g, 'A'))).toBe(g);
  });
  it('blocks confirmation until labels, weights and size are valid, with Vietnamese messages', () => {
    expect(toGraph(emptyEditorGraph()).problems).toEqual([m.problems.noVertex]);
    let g = build('A', 'a', '');
    expect(toGraph(g).problems).toEqual([m.problems.duplicate('a'), m.problems.emptyLabel]);
    g = build('A', 'B', 'C');
    g = addEdge(addEdge(g, key(g, 'A'), key(g, 'B')), key(g, 'B'), key(g, 'C'));
    g = updateEdge(g, g.edges[0]!.key, { w: '0' });
    expect(toGraph(g).problems).toEqual([m.problems.badWeight('A–B', '0'), m.problems.partialWeights]);
    g = updateEdge(g, g.edges[0]!.key, { w: '7' });
    expect(toGraph(g).problems).toEqual([m.problems.partialWeights]);
    expect(toGraph(updateEdge(g, g.edges[0]!.key, { w: '' }), true).problems).toEqual([m.problems.missingWeights]);
    g = updateEdge(updateEdge(g, g.edges[1]!.key, { w: '2,5' }), g.edges[0]!.key, { name: ' a ' });
    expect(toGraph(g)).toEqual({ problems: [], graph: { directed: false,
      vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }],
      edges: [{ id: 'e1', u: 'A', v: 'B', w: 7, name: 'a' }, { id: 'e2', u: 'B', v: 'C', w: 2.5 }] } });
    expect(toGraph(build(...Array.from({ length: 21 }, (_, i) => `v${i + 1}`))).problems).toContain(m.problems.tooMany);
  });
  it('turns a figure draft into an editable graph: unread labels become empty and flagged', () => {
    const g = fromDraft(draft([
      { label: 'unreadable1', conf: 0, box: [100, 200, 140, 280] }, { label: 'B', conf: 0.95, box: [800, 400, 840, 440] }, { label: 'C', conf: 0.4 },
    ], [edge('unreadable1', 'B'), edge('B', 'B', { conf: 0.5 }), edge('B', 'C', { w: 7, wAlternatives: [1] }), edge('B', 'ghost')]));
    expect(g.vertices.map(({ label, flagged }) => [label, flagged])).toEqual([['', true], ['B', false], ['C', true]]);
    // Boxes are normalized 0–1000 regardless of the photo size.
    expect(g.vertices[0]).toMatchObject({ x: 0.12, y: 0.24 });
    expect(g.edges.map(({ w, flagged }) => [w, flagged])).toEqual([['', false], ['', true], ['7', true]]);
    expect(flaggedCount(g)).toBe(4);
    expect(flaggedCount(clearFlag(g, g.edges[1]!.key))).toBe(3);
    expect(toGraph(g).problems).toContain(m.problems.emptyLabel);
    expect(flaggedCount(renameVertex(g, g.vertices[0]!.key, 'A'))).toBe(3);
  });
  it('draws parallel edges as distinct curves and loops above the vertex', () => {
    let g = build('A', 'B');
    g = addEdge(addEdge(addEdge(g, key(g, 'A'), key(g, 'B')), key(g, 'B'), key(g, 'A')), key(g, 'A'), key(g, 'A'));
    const shapes = edgeShapes(g, 1000, 500);
    expect(shapes).toHaveLength(3);
    expect(new Set(shapes.map((s) => s.path)).size).toBe(3);
    expect(shapes[2]!.path).toMatch(/^M .* C /); expect(shapes[2]!.labelY).toBeLessThan(250);
  });
});

describe('experimental figure suggestion', () => {
  it('maps a runner draft and reports an empty figure separately', async () => {
    const runner: FigureRunner = async () => draft([{ label: 'unreadable1', conf: 0, box: [0, 0, 10, 10] }], []);
    expect((await suggestGraph(image, runner, new AbortController().signal)).graph.vertices).toHaveLength(1);
    const empty = await suggestGraph(image, async () => draft([], []), new AbortController().signal);
    expect(empty).toMatchObject({ empty: true, graph: { vertices: [], edges: [] } });
  });
  it('can be cancelled while the reader runs', async () => {
    const abort = new AbortController();
    const runner: FigureRunner = (_image, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject({ code: 'aborted' })));
    const pending = suggestGraph(image, runner, abort.signal); abort.abort();
    await expect(pending).rejects.toEqual({ code: 'aborted' });
  });
  it('keeps every Vietnamese string of the editor in graph-editor.vi.ts', () => {
    for (const file of readdirSync(new URL('../src/', import.meta.url)).filter((f) => /^(GraphEditScreen\.tsx|graph-editor\.ts|figure-suggest\.ts)$/.test(f))) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
      expect(source, file).not.toMatch(/['"`][^'"`\n]*[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ][^'"`\n]*['"`]/i);
    }
  });
});
