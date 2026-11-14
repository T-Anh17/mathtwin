import type { Edge, Graph, ProblemSpec, Task } from '../src/index.js';

export function graph(ids: string[], edges: Edge[] = []): Graph {
  return { directed: false, vertices: ids.map((id) => ({ id, label: id })), edges };
}

export function problem(task: Task = { type: 'elements' }): ProblemSpec {
  return {
    graph: graph(['A', 'B', 'C'], [
      { id: 'e1', u: 'A', v: 'B', w: 2 },
      { id: 'e2', u: 'B', v: 'C', w: 3 },
    ]),
    task,
    questionFormat: 'tu_luan',
  };
}
