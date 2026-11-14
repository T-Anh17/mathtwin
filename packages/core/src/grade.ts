import type { Claim, GradeResult, ProblemSpec, Solution } from './types.js';
import { solve } from './solve.js';
import { evaluateStatement } from './solvers/statements.js';
import { AlgorithmChecker, algorithmConfusionModes } from './grading/algorithms.js';
import { checkStaticClaim } from './grading/static.js';
import { checkFinalAnswer } from './grading/final-answer.js';
import { compare, object, skip } from './grading/result.js';
import type { CheckResult } from './grading/result.js';
import { relevantUncertainty, uncertainEdge } from './grading/uncertainty.js';
import { gradeTemplates } from './explain/templates.vi.js';
import { degrees } from './graph/basic.js';
import { solveHamilton } from './solvers/hamilton.js';

/** Grade ordered assertions, preserving the first failure and recovering true state. */
export function grade(spec: ProblemSpec, claims: Claim[], opts: { confThreshold?: number } = {}): GradeResult {
  const threshold = opts.confThreshold ?? 0.85;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError(gradeTemplates.invalidThreshold);
  const solution: Solution = solve(spec);
  const sorted = [...claims].sort((a, b) => a.step - b.step);
  const check = createClaimChecker(spec, sorted, solution);
  const notes = [...solution.notes];
  let first: GradeResult | undefined;
  let usable = 0;
  for (const [index, claim] of sorted.entries()) {
    const result = check(claim);
    if (result.status === 'skip') {
      notes.push(gradeTemplates.skipped(claim.step, result.facts.reason));
      continue;
    }
    usable++;
    if (result.status === 'pass') continue;
    const items = result.status === 'confirm' ? [result.item] : relevantUncertainty(spec, claim, (variant) => {
      const prefix = sorted.slice(0, index + 1);
      const variantCheck = createClaimChecker(variant, prefix, solve(variant));
      let last: CheckResult | undefined;
      for (const previous of prefix) last = variantCheck(previous);
      return last?.status === 'pass';
    });
    if (result.status === 'fail' && (claim.conf ?? 1) < threshold) items.push(`claim.${claim.type}`);
    if (first !== undefined) {
      notes.push(gradeTemplates.later(claim.step, items.length > 0));
      continue;
    }
    const facts = explanationFacts(spec, claim, result.facts, items, sorted);
    if (items.length > 0) {
      first = { verdict: 'CAN_XAC_NHAN', firstErrorStep: claim.step, facts,
        message: gradeTemplates.confirm(facts), notes,
        needsConfirmation: [...new Set(items)].map((item) => ({ step: claim.step, item })) };
    } else if (result.status === 'fail') {
      first = { verdict: 'SAI', firstErrorStep: claim.step, errorCode: result.errorCode, facts,
        message: gradeTemplates.error(result.errorCode, facts), notes };
    }
  }
  if (sorted.length > 0 && sorted.every((c) => c.type === 'final_answer')) notes.push(gradeTemplates.answerOnly);
  if (first !== undefined) return first;
  return { verdict: usable === 0 ? 'KHONG_DU_CAN_CU' : 'DUNG', message: usable === 0 ? gradeTemplates.insufficient : gradeTemplates.correct, notes };
}

/** Shared by normal grading and counterfactual replay; never processes uncertainty. */
function createClaimChecker(spec: ProblemSpec, sorted: Claim[], solution: Solution): (claim: Claim) => CheckResult {
  const source = spec.task.type === 'shortest_path' ? spec.task.from : sorted.find((c) => c.type === 'dijkstra_init')?.source;
  const algorithm = new AlgorithmChecker(spec, source !== undefined && algorithmConfusionModes(spec.graph, sorted, source).length > 0);
  return (claim: Claim): CheckResult => {
    switch (claim.type) {
      case 'dijkstra_init': case 'dijkstra_select': case 'dijkstra_label': case 'nn_step': case 'postman_duplicate': return algorithm.check(claim);
      case 'final_answer': return checkFinalAnswer(spec, claim.value, solution.answer, algorithm.nearestLength());
      case 'statement': case 'choice': {
        if (spec.task.type !== 'statements') return skip('missing_options');
        const id = claim.type === 'statement' ? claim.id : claim.option;
        const item = spec.task.items.find((s) => s.id === id);
        if (item === undefined) return skip('unknown_statement');
        if (item.check.type === 'walk' && item.check.edgeIds !== undefined && item.check.edgeIds.length !== Math.max(0, item.check.vertices.length - 1)) {
          return { status: 'confirm', item: `${id}.edgeIds`, facts: { reason: 'edge_count_mismatch' } };
        }
        const evaluation = evaluateStatement(spec.graph, item.check);
        if (evaluation.value === null) return skip('null_statement');
        return compare(evaluation.value, claim.type === 'statement' ? claim.value : true, 'KET_LUAN_KHONG_SUY_RA');
      }
      default: return checkStaticClaim(spec, claim);
    }
  };
}

/** Presentation data is computed here; all explanatory sentences stay in templates. */
function explanationFacts(spec: ProblemSpec, claim: Claim, data: Record<string, unknown>, items: string[], claims: Claim[]): Record<string, unknown> {
  const vertex = (id: unknown): string => typeof id === 'string' ? spec.graph.vertices.find((v) => v.id === id)?.label ?? id : '';
  const edge = (id: unknown): string => {
    const e = spec.graph.edges.find((e) => e.id === id);
    return e === undefined ? '' : e.name ?? `${vertex(e.u)}–${vertex(e.v)}`;
  };
  const display = (value: unknown): unknown => {
    if (typeof value === 'string') return edge(value) || vertex(value);
    if (Array.isArray(value)) return value.map(display);
    if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, v]) => [spec.graph.vertices.some((node) => node.id === key) ? vertex(key) : key, display(v)]));
    return value;
  };
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const facts: Record<string, unknown> = { ...data, step: claim.step, claimType: claim.type,
    displayExpected: display(data.expected), displayGot: display(data.got),
    ...(claim.box === undefined ? {} : { box: [...claim.box] }) };
  // Undefined is not JSON data; optional facts are omitted instead.
  if (data.expected === undefined) delete facts.displayExpected;
  if (data.got === undefined) delete facts.displayGot;
  const v = data.vertex ?? ('v' in claim ? claim.v : undefined);
  if (v !== undefined) facts.vertexLabel = vertex(v);
  for (const key of ['from', 'to', 'via', 'start', 'end', 'gotFrom'] as const) {
    if (data[key] !== undefined) facts[`${key}Label`] = vertex(data[key]);
  }
  if (data.edgeId !== undefined) facts.edgeLabel = edge(data.edgeId) || `${vertex(data.from ?? data.via)}–${vertex(data.to ?? v)}`;
  if (data.via !== undefined && v !== undefined) {
    const matching = spec.graph.edges.find((e) => e.id === data.edgeId && ((e.u === data.via && e.v === v) || (e.v === data.via && e.u === v)));
    facts.edgeLabel = matching === undefined ? `${vertex(data.via)}–${vertex(v)}` : edge(matching.id);
  }
  if (typeof data.index === 'number') facts.position = data.index + 1;
  const allDegrees = degrees(spec.graph);
  facts.vertexDegrees = spec.graph.vertices.map((v) => ({ vertex: v.label, degree: allDegrees[v.id]! }));
  if (data.reason === 'missing_vertices' || (claim.type === 'dijkstra_select' && Array.isArray(data.vertices))) {
    facts.missingVertices = strings(data.vertices).map(vertex);
  }
  if (data.reason === 'missing_edges') facts.missingEdges = strings(data.edgeIds).map(edge);
  if (claim.type === 'odd_vertices') {
    const expected = strings(data.expected);
    facts.missingOdd = expected.filter((v) => !claim.vertices.includes(v)).map((v) => ({ vertex: vertex(v), degree: allDegrees[v]! }));
    facts.extraOdd = claim.vertices.filter((v) => !expected.includes(v)).map((v) => ({ vertex: vertex(v), degree: allDegrees[v] ?? null }));
  }
  if (object(data.labels)) {
    facts.candidates = strings(data.expected).map((id) => ({ vertex: vertex(id), label: (data.labels as Record<string, unknown>)[id] }));
    facts.chosenLabel = typeof data.got === 'string' ? data.labels[data.got] ?? null : null;
  }
  const source = spec.task.type === 'shortest_path' ? spec.task.from : claims.find((c) => c.type === 'dijkstra_init')?.source;
  if (source !== undefined && claim.type === 'dijkstra_select') facts.matchedAlgorithms = algorithmConfusionModes(spec.graph, claims, source);
  let body = claim.type === 'walk' ? claim : undefined;
  let vertices = body?.vertices ?? (claim.type === 'postman_duplicate' || claim.type === 'length' ? claim.vertices : undefined);
  if (claim.type === 'final_answer' && object(claim.value) && object(claim.value.walk)) vertices = strings(claim.value.walk.vertices);
  if ((claim.type === 'statement' || claim.type === 'choice') && spec.task.type === 'statements') {
    const id = claim.type === 'statement' ? claim.id : claim.option;
    const check = spec.task.items.find((i) => i.id === id)?.check;
    if (check?.type === 'walk') { body = { ...claim, ...check }; vertices = check.vertices; }
    facts.option = id;
  }
  if (vertices !== undefined) {
    facts.walkVertices = vertices.map(vertex);
    if (facts.displayGot === undefined) facts.displayGot = vertices.map(vertex);
    facts.walkVertexCount = vertices.length;
    facts.expectedEdges = Math.max(0, vertices.length - 1);
    if (body?.edgeIds !== undefined) facts.readEdgeCount = body.edgeIds.length;
    else if (claim.type === 'final_answer' && object(claim.value) && object(claim.value.walk) && Array.isArray(claim.value.walk.edgeIds)) facts.readEdgeCount = claim.value.walk.edgeIds.length;
    facts.startLabel = vertex(vertices[0]);
    facts.endLabel = vertex(vertices.at(-1));
    if (data.reason === 'not_closed' && facts.position === undefined) facts.position = vertices.length;
    if (data.reason === 'missing_edges' || data.reason === 'missing_vertices') facts.position = vertices.length;
    if (body !== undefined) facts.walkKind = body.kind;
    if (data.reason === undefined && claim.type === 'walk' && (claim.kind === 'postman_tour' || claim.kind === 'tsp_tour')) {
      if (claim.kind === 'tsp_tour') {
        const missing = spec.graph.vertices.filter((v) => !vertices!.includes(v.id)).map((v) => v.label);
        if (missing.length > 0) facts.missingVertices = missing;
      }
      else {
        const remaining = [...spec.graph.edges];
        for (let i = 1; i < vertices.length; i++) {
          const index = remaining.findIndex((e) => claim.edgeIds === undefined
            ? (e.u === vertices![i - 1] && e.v === vertices![i]) || (e.v === vertices![i - 1] && e.u === vertices![i]) : e.id === claim.edgeIds[i - 1]);
          if (index >= 0) remaining.splice(index, 1);
        }
        if (remaining.length > 0) facts.missingEdges = remaining.map((e) => edge(e.id));
      }
    }
  }
  if (claim.type === 'hamilton_exists' || claim.type === 'theorem') {
    facts.theorem = claim.type === 'theorem' ? claim.name : claim.reason;
    if (facts.theorem === undefined) delete facts.theorem;
    facts.kind = claim.type === 'hamilton_exists' ? claim.kind : 'cycle';
    facts.vertexCount = spec.graph.vertices.length;
    facts.divisor = 2;
    facts.minimumOrder = 3;
    facts.threshold = spec.graph.vertices.length / 2;
    const analysis = object(data.analysis) ? data.analysis : data;
    const counts = object(analysis.neighborCounts) ? analysis.neighborCounts : {};
    facts.neighborDegrees = Object.entries(counts).map(([id, degree]) => ({ vertex: vertex(id), degree }));
    facts.diracViolations = Object.entries(counts).filter(([, d]) => typeof d === 'number' && d < spec.graph.vertices.length / 2).map(([id, degree]) => ({ vertex: vertex(id), degree }));
    const pair = spec.graph.vertices.flatMap((u, i) => spec.graph.vertices.slice(i + 1).filter((v) => !spec.graph.edges.some((e) => (e.u === u.id && e.v === v.id) || (e.v === u.id && e.u === v.id)))
      .map((v) => ({ u: u.label, v: v.label, sum: Number(counts[u.id]) + Number(counts[v.id]) }))).find((p) => p.sum < spec.graph.vertices.length);
    if (pair !== undefined) facts.oreViolation = pair;
    const answer: unknown = claim.type === 'hamilton_exists' && object(data.answer) ? data.answer : solveHamilton(spec.graph, { want: 'cycle' }).answer;
    if (object(answer) && object(answer.walk)) facts.hamiltonWitness = strings(answer.walk.vertices).map(vertex);
  }
  if (claim.type === 'euler_exists' && object(data.analysis)) {
    facts.oddVertexLabels = strings(data.analysis.oddVertices).map(vertex);
    facts.oddCount = strings(data.analysis.oddVertices).length;
    facts.componentCount = Array.isArray(data.analysis.components) ? data.analysis.components.length : 0;
    facts.kind = claim.kind;
  }
  facts.confirmationDetails = items.map((item) => {
    const target = uncertainEdge(spec, item);
    if (target !== undefined) {
      const e = spec.graph.edges[target.index]!;
      return { kind: target.field, edge: edge(e.id), candidates: display(spec.uncertain?.find((u) => u.item === item)?.candidates ?? []) };
    }
    return { kind: item.startsWith('claim.') ? 'claim' : data.reason === 'edge_count_mismatch' ? 'edge_count_mismatch' : 'graph' };
  });
  return facts;
}
