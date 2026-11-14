import type { Graph, Solution, SolutionStep, StatementCheck, Task } from '../types.js';
import { evaluateStaticStatement } from './static-statements.js';
import { evaluateWeightedStatement } from './statement-weighted.js';
import type { WeightedStatementEvaluation } from './statement-weighted.js';
import { basicTemplates, dijkstraTemplates, eulerTemplates, hamiltonTemplates, postmanTemplates, statementTemplates, tspTemplates } from '../explain/templates.vi.js';

export type StatementTruth = boolean | null;
export type StatementsAnswer = Record<string, StatementTruth>;
export interface StatementsSolution extends Solution {
  answer: StatementsAnswer;
  evaluations: ({ id: string } & WeightedStatementEvaluation)[];
}

function statementNote(check: StatementCheck): string {
  switch (check.type) {
    case 'vertex_count': case 'edge_count': return basicTemplates.notes.elements;
    case 'degree': case 'degree_sum': case 'odd_vertices': return basicTemplates.notes.degree;
    case 'connected': return basicTemplates.notes.connectivity;
    case 'euler_exists': return eulerTemplates.note;
    case 'hamilton_exists': case 'theorem': return hamiltonTemplates.note;
    case 'walk':
      switch (check.kind) {
        case 'path': return basicTemplates.notes.path;
        case 'euler_path': case 'euler_circuit': return eulerTemplates.note;
        case 'hamilton_path': case 'hamilton_cycle': return hamiltonTemplates.note;
        case 'tsp_tour': return tspTemplates.note;
        case 'postman_tour': return postmanTemplates.note;
      }
    case 'shortest_length': return dijkstraTemplates.note;
    case 'length': return statementTemplates.lengthNote;
    case 'dijkstra_label': return statementTemplates.dijkstraLabelNote;
    case 'nn_step': return statementTemplates.nnStepNote;
    case 'postman_duplicate': return postmanTemplates.note;
  }
}

/** Evaluate one independent proposition on a validated graph/check. */
export function evaluateStatement(graph: Graph, check: StatementCheck): WeightedStatementEvaluation {
  switch (check.type) {
    case 'length': case 'dijkstra_label': case 'nn_step': case 'postman_duplicate': return evaluateWeightedStatement(graph, check);
    default: return evaluateStaticStatement(graph, check);
  }
}

/** null means insufficient information, not a false proposition or infinity. */
export function solveStatements(graph: Graph, task: Omit<Extract<Task, { type: 'statements' }>, 'type'>): StatementsSolution {
  const steps: SolutionStep[] = [];
  const notes = new Set([statementTemplates.note]);
  const evaluations = task.items.map(({ id, text, check }) => {
    const evaluation = evaluateStatement(graph, check);
    notes.add(statementNote(check));
    steps.push({ index: steps.length + 1, kind: 'statement',
      text: statementTemplates.result(id, text, evaluation.value) + ' ' + statementTemplates.evidence(check, evaluation.value, evaluation.facts),
      data: { id, check, ...evaluation } });
    return { id, ...evaluation };
  });
  return { answer: Object.fromEntries(evaluations.map(({ id, value }) => [id, value])), steps, evaluations, notes: [...notes] };
}
