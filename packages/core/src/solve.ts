import type { ProblemSpec, Solution } from './types.js';
import { validateSpec } from './validate.js';
import { basicTemplates } from './explain/templates.vi.js';
import { solveGraphTask } from './solvers/graph-task.js';
import { solveStatements } from './solvers/statements.js';

/** Public JSON boundary: validate once, then dispatch without changing the input. */
export function solve(spec: ProblemSpec): Solution {
  const validation = validateSpec(spec);
  if (!validation.ok) throw new RangeError(basicTemplates.invalidSpec(validation.errors));
  return spec.task.type === 'statements'
    ? solveStatements(spec.graph, spec.task)
    : solveGraphTask(spec.graph, spec.task);
}
