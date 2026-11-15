import type { Graph, ProblemSpec, StatementCheck, Task, Vertex } from '@mathtwin/core';
import { validateSpec } from '@mathtwin/core';
import { QuestionDraftSchema, ReadDraftSchema, supportedTaskTypes } from './schema.js';
import type { QuestionDraft, ReadDraft, StatementCheckDraft } from './schema.js';
import { readIssue } from './messages.vi.js';
import { CONFIDENCE_THRESHOLD, displayLabel, finish, flag, mapReferences, normalizeLabel, referenceMapper, same, vertexFlagItem } from './model.js';
import type { NormalizedRead, ReadIssue, ReadUncertainty } from './types.js';

function needsWeights(task: Task): boolean {
  return ['shortest_path', 'tsp', 'postman'].includes(task.type)
    || (task.type === 'statements' && task.items.some(({ check }) =>
      ['length', 'shortest_length', 'dijkstra_label', 'nn_step', 'postman_duplicate'].includes(check.type)));
}

/** Calling with [edges, neighbors] keeps the spelling first seen in the edges pass. */
export function displayVertices(drafts: ReadDraft[]): Vertex[] {
  const vertices = new Map<string, Vertex>();
  for (const draft of drafts) for (const { label } of draft.vertices) {
    const key = normalizeLabel(label);
    if (!vertices.has(key)) {
      const id = displayLabel(label);
      vertices.set(key, { id, label: id });
    }
  }
  return [...vertices.values()];
}

export function draftGraph(draft: ReadDraft, vertices = displayVertices([draft])): Graph {
  const resolve = referenceMapper({ vertices });
  const localKeys = new Set(draft.vertices.map(({ label }) => normalizeLabel(label)));
  return {
    directed: false, vertices: vertices.filter(({ id }) => localKeys.has(normalizeLabel(id))),
    edges: draft.edges.map((edge, i) => ({ id: `e${i + 1}`, u: resolve(edge.u), v: resolve(edge.v),
      ...(edge.w === null ? {} : { w: edge.w }), ...(edge.name === null ? {} : { name: edge.name }),
    })),
  };
}

/** Confidence and alternatives are evidence, independent of whether a question is readable. */
export function draftGraphFlags(draft: ReadDraft, graph: Graph): ReadUncertainty[] {
  const holder = { uncertain: [] as ReadUncertainty[] };
  const resolve = referenceMapper(graph);
  const vertexIds = new Set(graph.vertices.map((vertex) => vertex.id));
  const endpointCandidates = (alternatives: string[] = []): string[] => alternatives.map(resolve).filter((id) => vertexIds.has(id));
  draft.edges.forEach((edge, i) => {
    const id = graph.edges[i]!.id;
    if (edge.wAlternatives.length > 0 || (edge.w !== null && edge.wConf !== undefined && edge.wConf < CONFIDENCE_THRESHOLD)) {
      flag(holder, `${id}.w`, [edge.w, ...edge.wAlternatives]);
    }
    const uCandidates = endpointCandidates(edge.uAlternatives), vCandidates = endpointCandidates(edge.vAlternatives);
    if (uCandidates.length || (edge.uConf !== undefined && edge.uConf < CONFIDENCE_THRESHOLD)) flag(holder, `${id}.u`, [resolve(edge.u), ...uCandidates]);
    if (vCandidates.length || (edge.vConf !== undefined && edge.vConf < CONFIDENCE_THRESHOLD)) flag(holder, `${id}.v`, [resolve(edge.v), ...vCandidates]);
    if (edge.conf < CONFIDENCE_THRESHOLD) flag(holder, id, [true, false]);
  });
  for (const vertex of draft.vertices) if (vertex.conf < CONFIDENCE_THRESHOLD || vertex.alternatives?.length) {
    const id = resolve(vertex.label);
    const item = vertexFlagItem(graph, id);
    flag(holder, item, item === 'graph' ? [graph] : [id, ...(vertex.alternatives ?? []).map(displayLabel)]);
  }
  return holder.uncertain;
}

function hasCaseCollision(draft: ReadDraft): boolean {
  const spellings = new Map<string, string>();
  for (const { label } of draft.vertices) {
    const spelling = displayLabel(label); const key = spelling.toLowerCase();
    const first = spellings.get(key);
    if (first !== undefined && first !== spelling && first.toLowerCase() === spelling.toLowerCase()) return true;
    spellings.set(key, first ?? spelling);
  }
  return false;
}

/** Build only the question; graph diagnostics and final validation happen after graph reconciliation. */
export function questionSpec(graph: Graph, input: QuestionDraft | null): { spec: ProblemSpec | null; issues: ReadIssue[] } {
  if (input === null) return { spec: null, issues: [readIssue('missing_question', 'blocking')] };
  const parsed = QuestionDraftSchema.safeParse(input);
  if (!parsed.success) return { spec: null, issues: [readIssue('invalid_spec', 'blocking')] };
  const question = parsed.data;
  const issues: ReadIssue[] = [];
  if (!(supportedTaskTypes as readonly string[]).includes(question.task.type)) {
    return { spec: null, issues: [readIssue('unsupported_task', 'blocking', 'task.type')] };
  }
  const resolve = referenceMapper(graph);
  const hasOptions = question.format === 'trac_nghiem' || question.format === 'dung_sai';
  let task: Task;
  if (hasOptions || question.task.type === 'statements') {
    const items = hasOptions ? question.options
      : (question.task as { items: { id: string; text: string; check: StatementCheckDraft | null }[] }).items;
    for (const item of items) if (item.check === null) issues.push(readIssue('unmapped_option', 'blocking', `task.items.${item.id}`));
    if (hasOptions && items.length !== 4) issues.push(readIssue('invalid_spec', 'blocking', 'task.items'));
    const mapped = items.flatMap((item) => item.check === null ? [] : [{
      id: item.id, text: item.text, check: mapReferences(item.check as StatementCheck, resolve),
    }]);
    task = { type: 'statements', items: mapped };
    for (const item of mapped) {
      const checked = validateSpec({ graph, task: { type: 'statements', items: [item] }, questionFormat: question.format });
      // Graph errors (e.g. missing weights) do not make a mapped statement unmapped.
      if (checked.errors.some((error) => error.startsWith('task.items'))) {
        issues.push(readIssue('unmapped_option', 'blocking', `task.items.${item.id}`));
      }
    }
  } else task = mapReferences(question.task as Task, resolve);
  const spec: ProblemSpec = { graph, task, questionFormat: question.format };
  if (question.conf < CONFIDENCE_THRESHOLD) {
    for (const [key, value] of Object.entries(task)) flag(spec, `task.${key}`, [value]);
    flag(spec, 'questionFormat', [spec.questionFormat]);
  }
  if (task.type === 'statements' && question.options.some((option) => option.conf < CONFIDENCE_THRESHOLD)) flag(spec, 'task.items', [task.items]);
  if (question.needsPostprocessing) issues.push(readIssue('needs_postprocessing', 'warning', 'task'));
  return { spec, issues };
}

/** Diagnose the graph in its final form; raw passes supply only structural evidence and stated facts. */
export function finalizeGraphRead(graph: Graph, flags: ReadUncertainty[], drafts: ReadDraft[], question: QuestionDraft | null): NormalizedRead {
  const { spec, issues } = questionSpec(graph, question);
  const holder = { uncertain: structuredClone(flags) };
  if (drafts.some((d) => d.directed)) issues.push(readIssue('directed_graph', 'blocking', 'graph'));
  if (graph.vertices.length > 20) issues.push(readIssue('too_many_vertices', 'blocking', 'graph'));
  const weighted = spec !== null && needsWeights(spec.task);
  for (const edge of graph.edges) {
    if (edge.w === undefined) {
      issues.push(readIssue('missing_weight', weighted ? 'blocking' : 'warning', `${edge.id}.w`));
      flag(holder, `${edge.id}.w`, [null]);
    } else if (edge.w <= 0) issues.push(readIssue('nonpositive_weight', 'blocking', `${edge.id}.w`));
  }
  for (const draft of drafts) {
    const facts = draft.statedFacts;
    if (hasCaseCollision(draft) || (facts.vertexCount !== null && facts.vertexCount !== graph.vertices.length)
      || (facts.edgeCount !== null && facts.edgeCount !== graph.edges.length)) {
      issues.push(readIssue('count_mismatch', 'warning', 'graph'));
      flag(holder, 'graph', [graph]);
    }
    if (draft.unreadable.length > 0) {
      issues.push(readIssue('unreadable_region', 'warning', 'graph'));
      flag(holder, 'graph', [graph]);
    }
  }
  const graphFlag = holder.uncertain.find((entry) => entry.item === 'graph');
  if (graphFlag) graphFlag.candidates = [structuredClone(graph), ...graphFlag.candidates.filter((value) => !same(value, graph))];
  if (spec !== null) {
    const taskFlags = spec.uncertain ?? [];
    spec.uncertain = structuredClone(holder.uncertain);
    for (const entry of taskFlags) flag(spec, entry.item, entry.candidates);
  }
  return finish(spec, issues, graph, holder.uncertain);
}

export function normalizeDraft(input: ReadDraft): NormalizedRead {
  const parsed = ReadDraftSchema.safeParse(input);
  if (!parsed.success) return finish(null, [readIssue('invalid_spec', 'blocking')], null, []);
  const draft = parsed.data;
  const graph = draftGraph(draft);
  return finalizeGraphRead(graph, draftGraphFlags(draft, graph), [draft], draft.question);
}
