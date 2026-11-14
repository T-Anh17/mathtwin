import { z } from 'zod';

const number = z.number().finite();
const label = z.string().trim().min(1);
const confidence = number.min(0).max(1);
const object = z.strictObject;
const numeric = { value: number };
const boolean = { value: z.boolean() };
const labels = z.array(label);

// These are propositions copied from the question, never answers computed by a reader.
export const StatementCheckDraftSchema = z.discriminatedUnion('type', [
  object({ type: z.literal('vertex_count'), ...numeric }),
  object({ type: z.literal('edge_count'), ...numeric }),
  object({ type: z.literal('degree_sum'), ...numeric }),
  object({ type: z.literal('degree'), v: label, ...numeric }),
  object({ type: z.literal('odd_vertices'), vertices: labels }),
  object({ type: z.literal('connected'), ...boolean }),
  object({ type: z.literal('euler_exists'), kind: z.enum(['path', 'circuit']), ...boolean }),
  object({ type: z.literal('hamilton_exists'), kind: z.enum(['path', 'cycle']), ...boolean,
    reason: z.enum(['dirac', 'ore', 'degree1', 'forced_edges', 'found']).optional() }),
  object({ type: z.literal('theorem'), name: z.enum(['dirac', 'ore']), holds: z.boolean() }),
  object({ type: z.literal('walk'), kind: z.enum(['path', 'euler_path', 'euler_circuit', 'hamilton_path', 'hamilton_cycle', 'tsp_tour', 'postman_tour']),
    vertices: labels, edgeIds: z.array(label).optional() }),
  object({ type: z.literal('length'), vertices: labels, ...numeric }),
  object({ type: z.literal('dijkstra_label'), source: label, v: label, value: number.nullable(), via: label.optional() }),
  object({ type: z.literal('nn_step'), start: label, from: label, to: label }),
  object({ type: z.literal('postman_duplicate'), vertices: labels }),
  object({ type: z.literal('shortest_length'), from: label, to: label, ...numeric }),
]);
export type StatementCheckDraft = z.infer<typeof StatementCheckDraftSchema>;

const supportedTasks = [
  object({ type: z.literal('elements') }),
  object({ type: z.literal('degree'), vertices: labels.optional() }),
  object({ type: z.literal('degree_sequence'), sequence: z.array(number), simple: z.boolean() }),
  object({ type: z.literal('path'), from: label, to: label }),
  object({ type: z.literal('connectivity') }),
  object({ type: z.literal('euler'), want: z.enum(['path', 'circuit', 'any']), start: label.optional() }),
  object({ type: z.literal('hamilton'), want: z.enum(['path', 'cycle']), start: label.optional(), end: label.optional() }),
  object({ type: z.literal('shortest_path'), from: label, to: label }),
  object({ type: z.literal('tsp'), start: label.optional(), method: z.enum(['nearest_neighbor', 'optimal', 'both']) }),
  object({ type: z.literal('postman'), start: label }),
  object({ type: z.literal('statements'), items: z.array(object({ id: label, text: z.string(), check: StatementCheckDraftSchema.nullable() })) }),
] as const;
export const supportedTaskTypes = supportedTasks.map((task) => task.shape.type.value);
export const TaskDraftSchema = z.union([
  z.discriminatedUnion('type', supportedTasks),
  object({ type: label.refine((type) => !supportedTaskTypes.includes(type as typeof supportedTaskTypes[number])), rawText: z.string().optional() }),
]);
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const QuestionDraftSchema = object({
  rawText: z.string(), format: z.enum(['tu_luan', 'trac_nghiem', 'dung_sai', 'tra_loi_ngan']),
  task: TaskDraftSchema,
  options: z.array(object({ id: label, text: z.string(), check: StatementCheckDraftSchema.nullable(), conf: confidence })),
  conf: confidence, needsPostprocessing: z.boolean().optional(),
});
export type QuestionDraft = z.infer<typeof QuestionDraftSchema>;

export const ReadDraftSchema = object({
  representation: z.enum(['figure', 'table', 'matrix', 'text', 'mixed']),
  directed: z.boolean(),
  vertices: z.array(object({ label, conf: confidence, box: z.tuple([number, number, number, number]).optional() })),
  edges: z.array(object({ u: label, v: label, w: number.nullable(), wAlternatives: z.array(number), name: z.string().nullable(), conf: confidence })),
  statedFacts: object({ vertexCount: number.int().nonnegative().nullable(), edgeCount: number.int().nonnegative().nullable(), weightUnit: z.string().nullable() }),
  question: QuestionDraftSchema.nullable(),
  unreadable: z.array(object({ what: z.string(), note: z.string() })),
});
export type ReadDraft = z.infer<typeof ReadDraftSchema>;
