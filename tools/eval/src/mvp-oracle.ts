import type { Graph, ProblemSpec, Solution, StatementCheck } from '@mathtwin/core';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : {};
const sameSet = (a: unknown, b: string[]) => Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
/** Independent, small-graph oracle for the tasks present in synthetic-hw; no core solver calls. */
export function checkMvpSolution(spec: ProblemSpec, solution: Solution): { correct: boolean; reason: string } {
  const { graph, task } = spec, ids = graph.vertices.map((v) => v.id), edges = graph.edges;
  if (ids.length > 9) return { correct: false, reason: 'Oracle MVP chỉ vét cạn tối đa 9 đỉnh; chưa đo' };
  const degree = (v: string) => edges.reduce((n, e) => n + Number(e.u === v) + Number(e.v === v), 0);
  const adjacent = (u: string, v: string) => edges.filter((e) => e.u === u && e.v === v || e.u === v && e.v === u);
  const weight = (u: string, v: string) => Math.min(Infinity, ...adjacent(u, v).map((e) => e.w ?? 1));
  const components: string[][] = [];
  for (const v of ids) if (!components.flat().includes(v)) {
    const group = [v];
    for (let i = 0; i < group.length; i++) for (const w of ids) if (!group.includes(w) && adjacent(group[i]!, w).length) group.push(w);
    components.push(group);
  }
  const permutations = (remaining: string[]): string[][] => remaining.length ? remaining.flatMap((v) => permutations(remaining.filter((w) => w !== v)).map((p) => [v, ...p])) : [[]];
  const hamilton = (cycle: boolean, start?: string, end?: string) => permutations(ids).filter((p) => (!start || p[0] === start) && (!end || p.at(-1) === end)
    && p.every((v, i) => !i || adjacent(p[i - 1]!, v).length) && (!cycle || ids.length >= 3 && adjacent(p.at(-1)!, p[0]!).length));
  const distances = ids.map((u) => ids.map((v) => u === v ? 0 : weight(u, v)));
  for (let k = 0; k < ids.length; k++) for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) distances[i]![j] = Math.min(distances[i]![j]!, distances[i]![k]! + distances[k]![j]!);
  const distance = (u: string, v: string) => distances[ids.indexOf(u)]?.[ids.indexOf(v)] ?? Infinity;
  const route = (value: unknown, sourceGraph: Graph = graph) => {
    const walk = object(value), vs = walk.vertices, es = walk.edgeIds;
    if (!Array.isArray(vs) || !Array.isArray(es) || vs.length !== es.length + 1 || !vs.every((v) => typeof v === 'string' && ids.includes(v))) return null;
    let length = 0;
    for (let i = 0; i < es.length; i++) {
      const edge = sourceGraph.edges.find((e) => e.id === es[i]);
      if (!edge || !(edge.u === vs[i] && edge.v === vs[i + 1] || edge.v === vs[i] && edge.u === vs[i + 1])) return null;
      length += edge.w ?? 1;
    }
    return { vertices: vs as string[], edgeIds: es as string[], length };
  };
  const statement = (check: StatementCheck): boolean | undefined => {
    switch (check.type) {
      case 'vertex_count': return ids.length === check.value;
      case 'edge_count': return edges.length === check.value;
      case 'degree': return degree(check.v) === check.value;
      case 'connected': return (components.length <= 1) === check.value;
      case 'hamilton_exists': return Boolean(hamilton(check.kind === 'cycle').length) === check.value;
      default: return undefined;
    }
  };
  const answer = object(solution.answer);
  let correct = false;
  switch (task.type) {
    case 'elements': {
      const loops = edges.filter((e) => e.u === e.v).map((e) => e.id);
      const parallel = edges.some((e, i) => edges.slice(i + 1).some((f) => e.u === f.u && e.v === f.v || e.u === f.v && e.v === f.u));
      correct = answer.vertexCount === ids.length && answer.edgeCount === edges.length && sameSet(answer.vertices, ids)
        && sameSet(answer.edges, edges.map((e) => e.id)) && sameSet(answer.loops, loops)
        && sameSet(answer.isolatedVertices, ids.filter((v) => !degree(v))) && answer.hasLoops === !!loops.length
        && answer.hasParallelEdges === parallel && answer.simple === (!loops.length && !parallel) && answer.multigraph === (!!loops.length || parallel);
      break;
    }
    case 'degree': correct = (task.vertices ?? ids).every((v) => object(answer.degrees)[v] === degree(v))
      && answer.degreeSum === edges.length * 2 && sameSet(answer.oddVertices, ids.filter((v) => degree(v) % 2)); break;
    case 'connectivity': correct = answer.connected === (components.length <= 1) && Array.isArray(answer.components)
      && answer.components.length === components.length && components.every((c) => (answer.components as unknown[]).some((p) => sameSet(p, c))); break;
    case 'shortest_path': {
      const d = distance(task.from, task.to), walk = route(answer.walk);
      correct = answer.exists === Number.isFinite(d) && (!Number.isFinite(d) || !!walk && walk.vertices[0] === task.from && walk.vertices.at(-1) === task.to && walk.length === d && answer.length === d); break;
    }
    case 'euler': {
      // Exhaustive edge-use search, including loops and parallel edge identities.
      const search = (v: string, used: string[], start: string): boolean => used.length === edges.length ? task.want !== 'circuit' || v === start
        : edges.some((e) => !used.includes(e.id) && (e.u === v || e.v === v) && search(e.u === v ? e.v : e.u, [...used, e.id], start));
      const exists = (task.start ? [task.start] : ids).some((v) => search(v, [], v));
      const walk = route(answer.walk);
      correct = answer.exists === exists && (!exists || !!walk && sameSet(walk.edgeIds, edges.map((e) => e.id))
        && (!task.start || walk.vertices[0] === task.start) && (task.want !== 'circuit' || walk.vertices[0] === walk.vertices.at(-1))); break;
    }
    case 'hamilton': {
      const paths = hamilton(task.want === 'cycle', task.start, task.end), walk = route(answer.walk);
      const vs = walk?.vertices ?? [];
      correct = answer.exists === !!paths.length && (!paths.length || !!walk && paths.some((p) => JSON.stringify(task.want === 'cycle' ? [...p, p[0]] : p) === JSON.stringify(vs))); break;
    }
    case 'tsp': {
      const starts = task.start ? [task.start] : ids;
      const tours = hamilton(true).map((p) => [...p, p[0]!]);
      const optimum = Math.min(Infinity, ...tours.map((p) => p.slice(1).reduce((s, v, i) => s + weight(p[i]!, v), 0)));
      correct = true;
      if (task.method !== 'nearest_neighbor') {
        const optimal = object(answer.optimal), walk = route(optimal.walk);
        correct &&= optimal.exists === Number.isFinite(optimum) && (!Number.isFinite(optimum) || !!walk && walk.length === optimum && optimal.length === optimum && tours.some((t) => JSON.stringify(t) === JSON.stringify(walk.vertices)));
      }
      if (task.method !== 'optimal') {
        const nn = answer.nearestNeighbor;
        correct &&= Array.isArray(nn) && nn.length === starts.length && starts.every((start) => {
          const entry = nn.find((v: unknown) => object(v).start === start), a = object(object(entry).answer), walk = route(a.walk);
          if (!walk || !a.exists || walk.vertices[0] !== start || walk.vertices.at(-1) !== start || !sameSet(walk.vertices.slice(0, -1), ids) || a.length !== walk.length) return false;
          const visited = new Set([start]);
          for (let i = 1; i < walk.vertices.length - 1; i++) {
            const from = walk.vertices[i - 1]!, to = walk.vertices[i]!;
            if (weight(from, to) !== Math.min(...ids.filter((v) => !visited.has(v)).map((v) => weight(from, v)))) return false;
            visited.add(to);
          }
          return true;
        });
      }
      break;
    }
    case 'postman': {
      const odd = ids.filter((v) => degree(v) % 2);
      const matching = (vs: string[]): number => vs.length ? Math.min(...vs.slice(1).map((v) => distance(vs[0]!, v) + matching(vs.filter((w) => w !== vs[0] && w !== v)))) : 0;
      const duplicate = matching(odd), base = edges.reduce((n, e) => n + (e.w ?? 1), 0);
      const augmented = { ...graph, edges: [...edges] };
      if (Array.isArray(answer.duplicates)) for (const item of answer.duplicates) {
        const copy = object(item), original = edges.find((e) => e.id === copy.originalEdgeId);
        if (original && typeof copy.id === 'string') augmented.edges.push({ ...original, id: copy.id });
      }
      const walk = route(answer.walk, augmented);
      correct = answer.exists === true && answer.length === base + duplicate && answer.baseLength === base && answer.duplicateLength === duplicate
        && !!walk && walk.vertices[0] === task.start && walk.vertices.at(-1) === task.start && walk.length === base + duplicate && edges.every((e) => walk.edgeIds.includes(e.id)); break;
    }
    case 'statements': correct = task.items.every((item) => statement(item.check) !== undefined && answer[item.id] === statement(item.check)); break;
    default: return { correct: false, reason: `Oracle MVP chưa hỗ trợ ${task.type}` };
  }
  return { correct, reason: correct ? 'Đối chiếu độc lập: đếm/duyệt/vét cạn, Floyd–Warshall, ghép cặp vét cạn và kiểm hành trình' : 'Đáp án không qua oracle độc lập' };
}
