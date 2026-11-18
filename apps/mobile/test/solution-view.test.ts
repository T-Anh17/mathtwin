import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solve } from '@mathtwin/core';
import type { Graph, ProblemSpec } from '@mathtwin/core';
import type { ReadDraft } from '@mathtwin/reader';
import { solutionView } from '../src/flow/view.js';
import { draftLayout, graphDrawing, sessionGraphLayout, solutionGraph } from '../src/flow/graph.js';
import { createSession, sessionReducer as reduce } from '../src/flow/sessionReducer.js';
import { editorFromGraph, editorLayout, toGraph } from '../src/graph-editor.js';
import { createMemoryStorage } from '../src/storage/memory.js';
import { SolutionGraph, SolutionScreen, SolutionSteps, WorkEntryChoices } from '../src/SolutionScreen.js';
import { SessionScreen } from '../src/SessionScreen.js';
import { solutionVi as m } from '../src/solution.vi.js';

const root = new URL('../../../testdata/core/', import.meta.url);
const fixtures = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().map((name) => ({ name,
  spec: JSON.parse(readFileSync(new URL(`${name}/spec.json`, root), 'utf8')) as ProblemSpec,
}));
const fresh = () => createSession('solution', '2026-11-18T00:00:00Z');
const graph: Graph = { directed: false, vertices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [
  { id: 'one', u: 'a', v: 'b', w: 2, name: 'p' }, { id: 'two', u: 'b', v: 'a', w: 7 },
  { id: 'loop', u: 'a', v: 'a', w: 3 }, { id: 'loop2', u: 'a', v: 'a', w: 4 },
] };
const spec: ProblemSpec = { graph, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const draft: ReadDraft = { representation: 'figure', directed: false, statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null }, question: null, unreadable: [], vertices: [
  { label: 'A', conf: 1, box: [100, 200, 200, 300] }, { label: 'B', conf: 1, box: [700, 600, 800, 700] },
], edges: [] };
const noop = () => {};

describe('4.3 solutionView on the complete core corpus', () => {
  it('covers all eight families and keeps all 60 fixtures', () => {
    expect(fixtures).toHaveLength(60);
    for (const type of ['elements', 'degree', 'path', 'euler', 'hamilton', 'shortest_path', 'tsp', 'postman']) {
      expect(fixtures.some((f) => f.spec.task.type === type)).toBe(true);
    }
  });
  for (const fixture of fixtures) it(fixture.name, () => {
    const solution = solve(fixture.spec), before = structuredClone(solution), data = solutionView(fixture.spec, solution);
    expect(data.steps).toHaveLength(solution.steps.length);
    expect(data.steps.map(({ text, ...step }) => step)).toEqual(solution.steps.map(({ text, ...step }) => step));
    expect(data.notes).toEqual(solution.notes);
    expect(data.answer.trim().length).toBeGreaterThan(0);
    expect(data.answer).not.toMatch(/undefined|\[object Object\]/);
    const displayGraph = solutionGraph(fixture.spec, solution);
    const visibleIds = new Set([...displayGraph.vertices.map((v) => v.label), ...displayGraph.edges.map((e) => e.name)]);
    for (const text of [data.answer, ...data.steps.map((s) => s.text), ...data.notes]) {
      for (const id of text.match(/\be\d+\b|\bv\d+\b/g) ?? []) expect(visibleIds.has(id), text).toBe(true);
    }
    // Rendering is gated on confirmation; retain the supplied fixture values after acknowledging flags.
    const session = reduce(fresh(), { type: 'manual_spec', spec: { ...fixture.spec, uncertain: [] } });
    const html = renderToStaticMarkup(createElement(SolutionScreen, { session, busy: false, onBack: noop, onWork: noop }));
    expect(html).toContain(m.grade);
    expect(html.match(/class="solution-step"/g) ?? []).toHaveLength(solution.steps.length);
    const drawing = graphDrawing(solutionGraph(fixture.spec, solution));
    expect(drawing).toEqual(graphDrawing(solutionGraph(fixture.spec, solution)));
    expect(JSON.stringify(drawing)).not.toMatch(/NaN|Infinity/);
    expect(solution).toEqual(before);
  });
  it('returns detached view data without changing solver output', () => {
    const solved = solve(spec), data = solutionView(spec, solved);
    data.steps[0]!.text = 'changed'; data.steps[0]!.highlight!.vertices!.push('changed'); data.notes.push('changed');
    expect(solved).toEqual(solve(spec));
    expect(solutionView(spec, solved).answer).toContain('2 đỉnh: A, B');
    expect(solutionView(spec, solved).answer).toContain('4 cạnh: p, B–A (7), A–A (3), A–A (4)');
  });
});

describe('4.3 graph geometry and persisted coordinates', () => {
  it('crops collinear coordinates and keeps labels readable inside a 360px phone card', () => {
    const line: Graph = { directed: false, vertices: ['A', 'B', 'C'].map((label, i) => ({ id: `v${i + 1}`, label })), edges: [
      { id: 'e1', u: 'v1', v: 'v2', w: 3 }, { id: 'e2', u: 'v2', v: 'v3', w: 2 },
    ] };
    const drawing = graphDrawing(line, { aspect: 1, vertices: line.vertices.map((v, i) => ({ id: v.id, x: 0.15 + i * 0.3, y: 0.5 })) });
    const [, , width, height] = drawing.viewBox.split(' ').map(Number);
    expect(height).toBe(96); expect(width).toBe(336);
    expect(drawing.fontSize * 294 / width!).toBeGreaterThanOrEqual(14);
    const html = renderToStaticMarkup(createElement(SolutionGraph, { graph: line }));
    expect(html.lastIndexOf('<path')).toBeLessThan(html.indexOf('<circle'));
    expect(html).toContain('class="edge-label"><rect');
    expect(html).toContain('--solution-font-size:');
    const css = readFileSync(new URL('../src/solution.css', import.meta.url), 'utf8');
    expect(css).toContain('.solution-graph circle { fill: var(--surface); }');
    expect(css).toContain('.solution-graph .edge-label rect { fill: var(--surface); }');
  });
  it('separates reversed parallel edges and multiple loops, with finite nearby labels', () => {
    const drawing = graphDrawing(graph);
    expect(drawing.edges).toHaveLength(4);
    expect(new Set(drawing.edges.map((e) => e.path)).size).toBe(4);
    expect(drawing.edges[0]!.path).toContain(' Q ');
    expect(drawing.edges[2]!.path).toContain(' C ');
    expect(drawing.edges[0]!.labelY).not.toBe(drawing.edges[1]!.labelY);
    const html = renderToStaticMarkup(createElement(SolutionGraph, { graph }));
    expect(html.match(/<path /g)).toHaveLength(4);
    expect(html).toContain('p · 2'); expect(html).toContain('>7</text>');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('handles empty graphs, isolated vertices, boundary loops and missing/invalid positions deterministically', () => {
    expect(graphDrawing({ directed: false, vertices: [], edges: [] }).vertices).toEqual([]);
    const layout = { aspect: 0.75, vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: NaN, y: 1 }] };
    const drawing = graphDrawing(graph, layout);
    expect(drawing.vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(drawing.vertices[1]!.x).toBe(graphDrawing(graph).vertices[1]!.x);
    expect(Number(drawing.viewBox.split(' ')[1])).toBeLessThan(drawing.edges[3]!.labelY);
    expect(JSON.stringify(drawing)).not.toMatch(/NaN|Infinity/);
    expect(graphDrawing({ ...graph, edges: [] }).vertices).toHaveLength(2);
  });
  it('uses D box centers when no confirmed editor layout exists', () => {
    const layout = draftLayout(graph, draft, 0.75);
    expect(layout.vertices).toEqual([{ id: 'a', x: 0.15, y: 0.25 }, { id: 'b', x: 0.75, y: 0.65 }]);
    const s = reduce(fresh(), { type: 'manual_spec', spec });
    s.problemPhotos = [{ id: 'photo', width: 400, height: 300, page: 0 }];
    s.problemPages = [{ page: 0, figure: draft, ms: 0, figureMs: 0, outcome: {
      spec, graph, graphUncertain: [], drafts: [], issues: [], usage: { engine: 'test', passes: 0, latencyMs: 0 },
    } }];
    expect(sessionGraphLayout(s)).toEqual(layout);
    s.graphLayout = { aspect: 1, vertices: [{ id: 'a', x: 0.4, y: 0.5 }] };
    expect(sessionGraphLayout(s)).toEqual(s.graphLayout);
  });
  it('keeps editor positions and aspect through confirmation, reopening and retake', async () => {
    const editor = editorFromGraph(graph);
    editor.vertices[0]!.x = 0.2; editor.vertices[0]!.y = 0.3;
    const confirmed = toGraph(editor).graph!, layout = editorLayout(editor, 0.75);
    let s = reduce(fresh(), { type: 'manual_spec', spec: { ...spec, graph: confirmed }, graphLayout: layout });
    layout.vertices[0]!.x = 0.99;
    expect(s.graphLayout!.vertices[0]!.x).toBe(0.2);
    const storage = createMemoryStorage(); await storage.sessions.put(s);
    s = (await storage.sessions.get(s.id))!;
    expect(editorFromGraph(confirmed, s.graphLayout).vertices[0]).toMatchObject({ x: 0.2, y: 0.3 });
    expect(graphDrawing(confirmed, s.graphLayout).vertices[0]).toMatchObject({ x: 80, y: 90 });
    expect(reduce(s, { type: 'retake', target: 'work' }).graphLayout).toEqual(s.graphLayout);
    expect(reduce(s, { type: 'retake', target: 'problem' }).graphLayout).toBeUndefined();
    expect(reduce(s, { type: 'manual_spec', spec }).graphLayout).toBeUndefined();
    await storage.close();
  });
  it('draws the core realization for a degree sequence', () => {
    const input = fixtures.find((f) => f.spec.task.type === 'degree_sequence' && solutionGraph(f.spec, solve(f.spec)).vertices.length)!;
    expect(input).toBeDefined();
    expect(graphDrawing(solutionGraph(input.spec, solve(input.spec))).vertices.length).toBeGreaterThan(0);
  });
});

describe('4.3 step selection and work navigation', () => {
  it('labels the initial final-answer highlight without selecting a step', () => {
    const input = fixtures.find((f) => f.spec.task.type === 'shortest_path')!.spec;
    const session = reduce(fresh(), { type: 'manual_spec', spec: { ...input, uncertain: [] } });
    const html = renderToStaticMarkup(createElement(SolutionScreen, { session, busy: false, onBack: noop, onWork: noop }));
    expect(html).toContain('role="status">Đáp án</p>');
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('class="hl"');
  });
  it('selects a step by its index and renders only its highlight, including Dijkstra infinity/zero/circles', () => {
    const input = fixtures.find((f) => f.spec.task.type === 'shortest_path')!.spec;
    const data = solutionView(input, solve(input));
    let selected = data.steps[0]!.index;
    const tree = SolutionSteps({ steps: data.steps, selected, onSelect: (index) => { selected = index; } });
    const labelStep = data.steps.find((s) => s.kind === 'dijkstra_label')!;
    tree.props.children[data.steps.indexOf(labelStep)]!.props.children.props.onClick();
    expect(selected).toBe(labelStep.index);
    const html = renderToStaticMarkup(createElement(SolutionGraph, { graph: input.graph, highlight: data.steps.find((s) => s.index === selected)!.highlight! }));
    expect(html.match(/class="hl"/g)).toHaveLength(labelStep.highlight!.edges!.length);
    expect(html).toContain(`data-edge="${labelStep.highlight!.edges![0]}"`);
    const init = renderToStaticMarkup(createElement(SolutionGraph, { graph: input.graph, highlight: data.steps[0]!.highlight! }));
    expect(init).toContain('∞'); expect(init).toContain('>0</text>'); expect(init).not.toContain('class="hl"');
    const select = data.steps.find((s) => s.kind === 'dijkstra_select')!;
    expect(renderToStaticMarkup(createElement(SolutionGraph, { graph: input.graph, highlight: select.highlight! }))).toContain('class="settled"');
    const steps = renderToStaticMarkup(createElement(SolutionSteps, { steps: data.steps, selected, onSelect: noop }));
    expect(steps.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
  for (const source of ['photo', 'manual'] as const) it(`navigates to ${source} work entry without reading or grading`, () => {
    let s = reduce(fresh(), { type: 'manual_spec', spec });
    const solution = s.solution;
    const choices = WorkEntryChoices({ busy: false, onBack: noop, onWork: (value) => { s = reduce(s, { type: 'work_capture', source: value }); } });
    choices.props.children[source === 'photo' ? 0 : 1]!.props.onClick();
    expect(s.stage).toBe('work_capture'); expect(s.workSource).toBe(source); expect(s.solution).toEqual(solution);
    expect(s.workGrade).toBeUndefined(); expect(s.workLines).toEqual([]); expect(s.workPhotos).toEqual([]);
    const html = renderToStaticMarkup(createElement(SessionScreen, { session: s, busy: false, onBack: noop, onEvent: noop }));
    expect(html).toContain(source === 'photo' ? m.photoDestination : m.manualDestination);
  });
  it('does not navigate or expose a solution before confirmation', () => {
    expect(reduce(fresh(), { type: 'work_capture', source: 'photo' })).toEqual(fresh());
    expect(renderToStaticMarkup(createElement(SolutionScreen, { session: fresh(), busy: false, onBack: noop, onWork: noop }))).toBe('');
  });
});
