import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solve } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import { confirmationCandidateText, confirmationQuestionText } from '../src/problem.vi.js';
import { confirmationQuestions } from '../src/flow/confirmation.js';
import { previewReaders } from '../src/preview-readers.js';
import { solutionView } from '../src/flow/view.js';

const spec: ProblemSpec = { graph: { directed: false,
  vertices: [{ id: 'v1', label: 'A' }, { id: 'v2', label: 'B' }, { id: 'v3', label: 'C' }],
  edges: [{ id: 'e1', u: 'v1', v: 'v2', w: 3 }, { id: 'e2', u: 'v2', v: 'v3', w: 2 }],
}, task: { type: 'shortest_path', from: 'v1', to: 'v3' }, questionFormat: 'tu_luan' };
const internalId = /\be\d+\b|\bv\d+\b/g;
function expectDisplay(text: string, problem: ProblemSpec) {
  const names = new Set([...problem.graph.vertices.map((v) => v.label), ...problem.graph.edges.map((e) => e.name)]);
  for (const id of text.match(internalId) ?? []) expect(names.has(id), text).toBe(true);
}
function checkQuestions(problem: ProblemSpec) {
  for (const q of problem.uncertain ?? []) {
    expectDisplay(confirmationQuestionText(problem, q.item), problem);
    for (const candidate of q.candidates) expectDisplay(confirmationCandidateText(problem, q.item, candidate), problem);
  }
}

describe('4.3 review: student-facing answers and confirmation references', () => {
  it('uses natural shortest-path answers and omits unnecessary edge lists', () => {
    expect(solutionView(spec, solve(spec)).answer).toBe('Đường đi ngắn nhất từ A đến C: A → B → C, độ dài 5.');
    const disconnected = { ...spec, graph: { ...spec.graph, edges: [] } };
    expect(solutionView(disconnected, solve(disconnected)).answer).toBe('Không có đường đi từ A đến C.');
    const parallel = structuredClone(spec);
    parallel.graph.edges.push({ id: 'e3', u: 'v1', v: 'v2', w: 8 });
    const answer = solutionView(parallel, solve(parallel)).answer;
    expect(answer).toContain('A–B (3)'); expectDisplay(answer, parallel);
    parallel.graph.edges[0]!.name = 'đường hoa';
    expect(solutionView(parallel, solve(parallel)).answer).toContain('đường hoa');
  });
  it('translates edge, vertex, indexed and task fields while keeping candidate values unchanged', () => {
    expect(confirmationQuestionText(spec, 'e1.w')).toBe('Trọng số cạnh A–B là bao nhiêu?');
    expect(confirmationQuestionText(spec, 'e1')).toBe('Có cạnh A–B không?');
    expect(confirmationQuestionText(spec, 'v3')).toBe('Đỉnh này là C?');
    expect(confirmationQuestionText(spec, 'task.start')).toBe('Đỉnh xuất phát là?');
    const flags = [
      ...spec.graph.edges.flatMap((e, i) => [e.id, `${e.id}.w`, `${e.id}.u`, `${e.id}.v`, `${e.id}.name`, `graph.edges[${i}].w`, `edges[${i}].u`]),
      ...spec.graph.vertices.flatMap((v, i) => [v.id, `${v.id}.label`, `graph.vertices[${i}].label`]),
      ...['type', 'from', 'to', 'start', 'end', 'vertices', 'sequence', 'simple', 'want', 'method', 'items'].map((f) => `task.${f}`),
      'questionFormat', 'graph', 'vertices', 'edges', 'unknown',
    ];
    for (const item of flags) expectDisplay(confirmationQuestionText(spec, item), spec);
    for (const item of ['task.from', 'task.to', 'task.start', 'task.end', 'e1.u', 'e1.v', 'v3', 'graph.vertices[2].label']) {
      expect(confirmationCandidateText(spec, item, 'v3')).toBe('C');
    }
    expect(confirmationCandidateText(spec, 'task.vertices', ['v1', 'v3'])).toBe('A, C');
    expect(confirmationCandidateText(spec, 'task.want', 'cycle')).toBe('Chu trình');
    expect(confirmationCandidateText(spec, 'edges', ['e1', 'e2'])).toBe('A–B, B–C');
    expect(confirmationCandidateText(spec, 'e1.w', 3)).toBe('3');
  });
  it('checks uncertainty codes in every images*/**/truth.json and the simulated reader', async () => {
    const root = new URL('../../../testdata/', import.meta.url);
    let scanned = 0;
    const scan = (directory: URL) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) scan(new URL(`${entry.name}/`, directory));
        else if (entry.name === 'truth.json') {
          const truth = JSON.parse(readFileSync(new URL(entry.name, directory), 'utf8')) as ProblemSpec;
          checkQuestions(truth); scanned++;
          // Also exercise each reference supported by the graph in this truth,
          // including corpora whose truth contains no uncertainty flags.
          for (const e of truth.graph.edges) {
            for (const item of [e.id, `${e.id}.w`, `${e.id}.u`, `${e.id}.v`, `${e.id}.name`]) expectDisplay(confirmationQuestionText(truth, item), truth);
            expectDisplay(confirmationCandidateText(truth, `${e.id}.u`, e.u), truth);
            expectDisplay(confirmationCandidateText(truth, `${e.id}.v`, e.v), truth);
          }
          for (const v of truth.graph.vertices) {
            expectDisplay(confirmationQuestionText(truth, v.id), truth);
            expectDisplay(confirmationCandidateText(truth, v.id, v.id), truth);
          }
        }
      }
    };
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('images')) scan(new URL(`${entry.name}/`, root));
    }
    expect(scanned).toBeGreaterThan(0);
    const read = await previewReaders().problem([{ width: 2, height: 2, pixels: new Uint8ClampedArray(16) }]);
    expect(confirmationQuestions(read).length).toBeGreaterThan(0);
    checkQuestions(read.spec!);
  });
  it('preserves graph names that happen to look like internal IDs', () => {
    const named = structuredClone(spec);
    named.graph.vertices[0]!.label = 'v1'; named.graph.edges[0]!.name = 'e1';
    expect(confirmationQuestionText(named, 'e1.w')).toBe('Trọng số cạnh e1 là bao nhiêu?');
    expectDisplay(solutionView(named, solve(named)).answer, named);
  });
});
