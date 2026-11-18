import type { ProblemSpec, Solution, SolutionStep } from '@mathtwin/core';
import { answerText, solutionDisplayText } from '../solution.vi.js';
import type { WorkGrade, WorkQuestion } from '@mathtwin/work';
import { parseWork, vocabularyOf, validWorkBox } from '@mathtwin/work';
import type { ErrorMark, GraphHighlight, ResultData } from '../product-types.js';
import type { Session } from './types.js';
import { graphLabels } from '../graph-labels.vi.js';
import { resultVi as m, tutorText, resultDisplayText } from '../result.vi.js';
import { workVi } from '../work.vi.js';

export interface SolutionView { answer: string; steps: SolutionStep[]; notes: string[] }

export function solutionView(spec: ProblemSpec, solution: Solution): SolutionView {
  return { answer: answerText(spec, solution), steps: structuredClone(solution.steps).map((step) => ({ ...step,
    text: solutionDisplayText(spec, solution, step.text) })), notes: solution.notes.map((note) => solutionDisplayText(spec, solution, note)) };
}

export function errorMarks(s: Session): ErrorMark[] {
  if (!s.specConfirmed || s.workGrade?.questions.length || s.workGrade?.result.verdict !== 'SAI') return [];
  return (s.workGrade.firstErrorLines ?? []).flatMap((index) => {
    const line = s.workLines.find((l) => l.index === index);
    return line?.box && validWorkBox(line.box) ? [{ page: line.page, box: [...line.box] as ErrorMark['box'] }] : [];
  });
}

/** Map evidence references to existing graph objects; never solve or grade in the view. */
export function graphHighlight(spec: ProblemSpec, solution: Solution, grade?: WorkGrade): GraphHighlight {
  if (!grade || grade.result.verdict === 'DUNG') return structuredClone([...solution.steps].reverse().find((s) => s.highlight)?.highlight ?? {});
  if (grade.questions.length || grade.result.verdict !== 'SAI') return {};
  const f = grade.result.facts ?? {}, labels = graphLabels(spec.graph);
  const vertices = new Set<string>(), edges = new Set<string>();
  const refs = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(refs)
    : v && typeof v === 'object' ? Object.values(v).flatMap(refs) : [];
  const vertexRefs = ['vertex', 'vertexLabel', 'from', 'to', 'via', 'start', 'end', 'fromLabel', 'toLabel', 'viaLabel',
    'startLabel', 'endLabel', 'missingVertices', 'missingOdd', 'extraOdd', 'candidates', 'diracViolations', 'oreViolation'];
  if (['dijkstra_select', 'nn_step', 'vertex_list', 'odd_vertices'].includes(String(f.claimType))) vertexRefs.push('displayExpected', 'displayGot');
  for (const ref of vertexRefs.flatMap((key) => refs(f[key]))) {
    const v = spec.graph.vertices.find((v) => v.id === ref || v.label === ref);
    if (v) vertices.add(v.id);
  }
  for (const ref of ['edgeId', 'edgeIds', 'edgeLabel', 'missingEdges'].flatMap((key) => refs(f[key]))) {
    for (const e of spec.graph.edges.filter((e) => e.id === ref || e.name === ref || labels.edge(e.id) === ref)) edges.add(e.id);
  }
  const endpoint = (value: unknown) => spec.graph.vertices.find((v) => v.id === value || v.label === value)?.id;
  const from = endpoint(f.from ?? f.via ?? f.fromLabel ?? f.viaLabel);
  const to = endpoint(f.to ?? f.vertex ?? f.toLabel ?? f.vertexLabel);
  const walk = f.claimType === 'walk' && grade.result.errorCode === 'KET_LUAN_KHONG_SUY_RA' ? refs(f.walkVertices).map(endpoint) : [];
  for (const v of walk) if (v) vertices.add(v);
  const globalVertices = ['vertex_count', 'vertex_list', 'degree_sum', 'odd_count', 'component_count', 'connected'];
  const globalEdges = ['edge_count', 'edge_list', 'loop_count', 'degree_sum'];
  if (globalVertices.includes(String(f.claimType))) for (const v of spec.graph.vertices) vertices.add(v.id);
  if (globalEdges.includes(String(f.claimType))) for (const e of spec.graph.edges) edges.add(e.id);
  for (const e of spec.graph.edges) {
    if (from && to && (e.u === from && e.v === to || e.v === from && e.u === to)
      || f.claimType === 'degree' && (vertices.has(e.u) || vertices.has(e.v))
      || walk.some((v, i) => i > 0 && (e.u === v && e.v === walk[i - 1] || e.v === v && e.u === walk[i - 1]))) edges.add(e.id);
  }
  for (const e of spec.graph.edges.filter((e) => edges.has(e.id))) { vertices.add(e.u); vertices.add(e.v); }
  return { vertices: [...vertices], edges: [...edges] };
}

export function resultView(s: Session): ResultData {
  const base = { title: m.title, notes: [] as string[], ...(s.workSource ? { workSource: s.workSource } : {}) };
  if (!s.specConfirmed || !s.spec || !s.solution) return { ...base, verdict: 'can_xac_nhan', message: m.unconfirmed, requiresReview: false };
  const labels = graphLabels(s.spec.graph);
  const display = (text: string) => resultDisplayText(s.spec!, text);
  const question = (q: WorkQuestion): WorkQuestion => ({ ...structuredClone(q), shownText: labels.text(q.shownText), options: q.options.map(labels.text) });
  const g = s.workGrade, r = g?.result;
  if (s.stage === 'work_reading' || s.workPages?.some((p) => p.needsRegion))
    return { ...base, verdict: 'can_xac_nhan', message: m.incomplete, requiresReview: true };
  if (g && (g.questions.length || r?.verdict === 'CAN_XAC_NHAN' || r?.verdict === 'DUNG' && s.workSource !== 'manual' && !s.reviewAcknowledged)) {
    const q = g.questions[0];
    return { ...base, verdict: 'can_xac_nhan', message: q ? workVi.status(q) : m.pending,
      ...(q ? { question: question(q) } : {}), requiresReview: !q };
  }
  if (r?.verdict === 'SAI' && r.errorCode && r.firstErrorStep !== undefined) {
    const text = tutorText(r, s.spec.task.type);
    return { ...base, message: display(text.message), reason: display(text.reason),
      ...(text.correction ? { correction: display(text.correction) } : {}), nextStep: text.nextStep,
      verdict: 'sai', firstErrorStep: r.firstErrorStep, errorCode: r.errorCode, errorType: m.errors[r.errorCode],
      previousSteps: r.firstErrorStep > 1 ? m.previousCorrect : m.noPrevious,
      errorMarks: s.workSource === 'manual' ? [] : errorMarks(s), graphHighlight: graphHighlight(s.spec, s.solution, g),
      ...(s.workSource !== 'manual' && g?.readingCheck ? { readingCheck: question(g.readingCheck) } : {}) };
  }
  if (r?.verdict === 'DUNG') return { ...base, verdict: 'dung', message: display(r.message || m.correct),
    notes: [...new Set([...s.solution.notes, ...r.notes])].map(display), graphHighlight: graphHighlight(s.spec, s.solution, g) };
  const parsed = parseWork(s.workLines, vocabularyOf(s.spec));
  const issues = [...new Set([r?.message ?? m.missing, ...parsed.issues.map((i) => i.message), ...(r?.notes ?? [])])].map(display);
  return { ...base, verdict: 'khong_du_can_cu', message: issues[0]!, issues };
}
