import type { Graph, Solution, Task } from '../types.js';
import { solveBasic } from './basic.js';
import { solveEuler } from './euler.js';
import { solveHamilton } from './hamilton.js';
import { solveDijkstra } from './dijkstra.js';
import { solveTsp } from './tsp.js';
import { solvePostman } from './postman.js';

export type GraphTask = Exclude<Task, { type: 'statements' }>;

/** Dispatch an already validated graph task, preserving the solver's trace. */
export function solveGraphTask(graph: Graph, task: GraphTask): Solution {
  switch (task.type) {
    case 'elements': case 'degree': case 'degree_sequence': case 'path': case 'connectivity': return solveBasic(graph, task);
    case 'euler': return solveEuler(graph, task);
    case 'hamilton': return solveHamilton(graph, task);
    case 'shortest_path': return solveDijkstra(graph, task);
    case 'tsp': return solveTsp(graph, task);
    case 'postman': return solvePostman(graph, task);
  }
}
