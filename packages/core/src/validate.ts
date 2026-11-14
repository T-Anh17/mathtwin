import type { ProblemSpec } from './types.js';
import { isValidDegreeSequence } from './graph/degree-sequence.js';
import { validationMessage, validationMessages as messages } from './explain/templates.vi.js';

type ObjectValue = Record<string, unknown>;
function isObject(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function statementRequiresWeights(value: unknown): boolean {
  if (!isObject(value)) return false;
  return ['length', 'shortest_length', 'dijkstra_label', 'nn_step', 'postman_duplicate'].includes(String(value.type));
}

/** Runtime checks protect the JSON boundary even when a caller bypasses TS. */
export function validateSpec(spec: ProblemSpec): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const add = (path: string, message: string): void => { errors.push(validationMessage(path, message)); };
  const object = (value: unknown, path: string): value is ObjectValue => {
    if (isObject(value)) return true;
    add(path, messages.object);
    return false;
  };
  const array = (value: unknown, path: string): value is unknown[] => {
    if (Array.isArray(value)) return true;
    add(path, messages.array);
    return false;
  };
  const string = (value: unknown, path: string): void => {
    if (typeof value !== 'string') add(path, messages.string);
  };
  const id = (value: unknown, path: string): value is string => {
    if (isId(value)) return true;
    add(path, messages.id);
    return false;
  };
  const boolean = (value: unknown, path: string): void => {
    if (typeof value !== 'boolean') add(path, messages.boolean);
  };
  const number = (value: unknown, path: string): void => {
    if (typeof value !== 'number' || !Number.isFinite(value)) add(path, messages.number);
  };
  const option = (value: unknown, choices: readonly string[], path: string): void => {
    if (typeof value !== 'string' || !choices.includes(value)) add(path, messages.option);
  };
  const vertices = new Set<string>();
  const edges = new Set<string>();
  const vertex = (value: unknown, path: string): void => {
    if (id(value, path) && !vertices.has(value)) add(path, messages.vertex);
  };
  const vertexList = (value: unknown, path: string): void => {
    if (array(value, path)) value.forEach((item, index) => vertex(item, `${path}[${index}]`));
  };
  const optionalVertex = (value: unknown, path: string): void => {
    if (value !== undefined) vertex(value, path);
  };
  const uniqueId = (value: unknown, seen: Set<string>, path: string): void => {
    if (!id(value, path)) return;
    if (seen.has(value)) add(path, messages.duplicate);
    seen.add(value);
  };

  const input: unknown = spec;
  if (!object(input, 'spec')) return { ok: false, errors };
  if (object(input.graph, 'graph')) {
    const graph = input.graph;
    if (graph.directed !== false) add('graph.directed', messages.directed);
    if (array(graph.vertices, 'graph.vertices')) {
      if (graph.vertices.length > 20) add('graph.vertices', messages.vertexLimit);
      graph.vertices.forEach((item, index) => {
        const path = `graph.vertices[${index}]`;
        if (!object(item, path)) return;
        uniqueId(item.id, vertices, `${path}.id`);
        string(item.label, `${path}.label`);
      });
    }
    if (array(graph.edges, 'graph.edges')) {
      const requiresWeights = isObject(input.task)
        && (input.task.type === 'shortest_path' || input.task.type === 'tsp' || input.task.type === 'postman'
          || (input.task.type === 'statements' && Array.isArray(input.task.items)
            && input.task.items.some((item: unknown) => isObject(item) && statementRequiresWeights(item.check))));
      const hasWeights = graph.edges.some((item) => isObject(item) && item.w !== undefined);
      graph.edges.forEach((item, index) => {
        const path = `graph.edges[${index}]`;
        if (!object(item, path)) return;
        uniqueId(item.id, edges, `${path}.id`);
        vertex(item.u, `${path}.u`);
        vertex(item.v, `${path}.v`);
        if (item.w === undefined) {
          if (requiresWeights || hasWeights) add(`${path}.w`, messages.missingWeight);
        } else if (typeof item.w !== 'number' || !Number.isFinite(item.w) || item.w <= 0) {
          add(`${path}.w`, messages.weight);
        }
        if (item.name !== undefined) string(item.name, `${path}.name`);
      });
    }
  }

  // A statement describes a proposition, which may be false. Check only its
  // shape and references, never reject it merely for giving a wrong answer.
  const checkStatement = (value: unknown, path: string): void => {
    if (!object(value, path)) return;
    const numericValue = (): void => number(value.value, `${path}.value`);
    const booleanValue = (): void => boolean(value.value, `${path}.value`);
    switch (value.type) {
      case 'vertex_count': case 'edge_count': case 'degree_sum':
        numericValue();
        break;
      case 'degree':
        vertex(value.v, `${path}.v`);
        numericValue();
        break;
      case 'odd_vertices': case 'postman_duplicate':
        vertexList(value.vertices, `${path}.vertices`);
        break;
      case 'connected':
        booleanValue();
        break;
      case 'euler_exists':
        option(value.kind, ['path', 'circuit'], `${path}.kind`);
        booleanValue();
        break;
      case 'hamilton_exists':
        option(value.kind, ['path', 'cycle'], `${path}.kind`);
        booleanValue();
        if (value.reason !== undefined) option(value.reason, ['dirac', 'ore', 'degree1', 'forced_edges', 'found'], `${path}.reason`);
        break;
      case 'theorem':
        option(value.name, ['dirac', 'ore'], `${path}.name`);
        boolean(value.holds, `${path}.holds`);
        break;
      case 'walk':
        option(value.kind, ['path', 'euler_path', 'euler_circuit', 'hamilton_path', 'hamilton_cycle', 'tsp_tour', 'postman_tour'], `${path}.kind`);
        vertexList(value.vertices, `${path}.vertices`);
        if (value.edgeIds !== undefined && array(value.edgeIds, `${path}.edgeIds`)) {
          value.edgeIds.forEach((edge, index) => {
            const edgePath = `${path}.edgeIds[${index}]`;
            if (id(edge, edgePath) && !edges.has(edge)) add(edgePath, messages.edge);
          });
        }
        break;
      case 'length':
        vertexList(value.vertices, `${path}.vertices`);
        numericValue();
        break;
      case 'dijkstra_init': case 'dijkstra_select':
        add(`${path}.type`, messages.standaloneDijkstra);
        break;
      case 'dijkstra_label':
        if (value.source === undefined) add(`${path}.source`, messages.statementSource);
        else vertex(value.source, `${path}.source`);
        vertex(value.v, `${path}.v`);
        if (value.value !== null) numericValue();
        optionalVertex(value.via, `${path}.via`);
        break;
      case 'nn_step': case 'shortest_length':
        if (value.type === 'nn_step') {
          if (value.start === undefined) add(`${path}.start`, messages.statementStart);
          else vertex(value.start, `${path}.start`);
        }
        vertex(value.from, `${path}.from`);
        vertex(value.to, `${path}.to`);
        if (value.type === 'shortest_length') numericValue();
        break;
      default:
        add(`${path}.type`, messages.option);
    }
  };

  if (object(input.task, 'task')) {
    const task = input.task;
    switch (task.type) {
      case 'elements': case 'connectivity':
        break;
      case 'degree':
        if (task.vertices !== undefined) vertexList(task.vertices, 'task.vertices');
        break;
      case 'degree_sequence':
        if (array(task.sequence, 'task.sequence') &&
            (!task.sequence.every((entry): entry is number => typeof entry === 'number') || !isValidDegreeSequence(task.sequence))) {
          add('task.sequence', messages.degreeSequence);
        }
        boolean(task.simple, 'task.simple');
        break;
      case 'path': case 'shortest_path':
        vertex(task.from, 'task.from');
        vertex(task.to, 'task.to');
        break;
      case 'euler':
        option(task.want, ['path', 'circuit', 'any'], 'task.want');
        optionalVertex(task.start, 'task.start');
        break;
      case 'hamilton':
        option(task.want, ['path', 'cycle'], 'task.want');
        optionalVertex(task.start, 'task.start');
        optionalVertex(task.end, 'task.end');
        break;
      case 'tsp':
        option(task.method, ['nearest_neighbor', 'optimal', 'both'], 'task.method');
        optionalVertex(task.start, 'task.start');
        break;
      case 'postman':
        vertex(task.start, 'task.start');
        break;
      case 'statements':
        if (array(task.items, 'task.items')) {
          const seen = new Set<string>();
          task.items.forEach((item, index) => {
            const path = `task.items[${index}]`;
            if (!object(item, path)) return;
            uniqueId(item.id, seen, `${path}.id`);
            string(item.text, `${path}.text`);
            checkStatement(item.check, `${path}.check`);
          });
        }
        break;
      default:
        add('task.type', messages.option);
    }
  }
  option(input.questionFormat, ['tu_luan', 'trac_nghiem', 'dung_sai', 'tra_loi_ngan'], 'questionFormat');
  if (input.uncertain !== undefined && array(input.uncertain, 'uncertain')) {
    input.uncertain.forEach((item, index) => {
      const path = `uncertain[${index}]`;
      if (!object(item, path)) return;
      string(item.item, `${path}.item`);
      array(item.candidates, `${path}.candidates`);
    });
  }
  return { ok: errors.length === 0, errors };
}
