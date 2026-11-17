export type VertexId = string;

export interface Vertex { id: VertexId; label: string }
export interface Edge {
  id: string;
  u: VertexId;
  v: VertexId;
  w?: number;
  name?: string;
}
export interface Graph { directed: false; vertices: Vertex[]; edges: Edge[] }

export type Task =
  | { type: 'elements' }
  | { type: 'degree'; vertices?: VertexId[] }
  | { type: 'degree_sequence'; sequence: number[]; simple: boolean }
  | { type: 'path'; from: VertexId; to: VertexId }
  | { type: 'connectivity' }
  | { type: 'euler'; want: 'path' | 'circuit' | 'any'; start?: VertexId }
  | { type: 'hamilton'; want: 'path' | 'cycle'; start?: VertexId; end?: VertexId }
  | { type: 'shortest_path'; from: VertexId; to: VertexId }
  | { type: 'tsp'; start?: VertexId; method: 'nearest_neighbor' | 'optimal' | 'both' }
  | { type: 'postman'; start: VertexId }
  | { type: 'statements'; items: { id: string; text: string; check: StatementCheck }[] };

export interface ProblemSpec {
  graph: Graph;
  task: Task;
  questionFormat: 'tu_luan' | 'trac_nghiem' | 'dung_sai' | 'tra_loi_ngan';
  uncertain?: { item: string; candidates: unknown[] }[];
}

export interface Highlight {
  vertices?: VertexId[];
  edges?: string[];
  circled?: VertexId[];
  labels?: Record<VertexId, number | null>;
}
export interface SolutionStep {
  index: number;
  kind: string;
  text: string;
  highlight?: Highlight;
  data?: unknown;
}
export interface Solution { answer: unknown; steps: SolutionStep[]; notes: string[] }

export interface ClaimBase {
  step: number;
  raw: string;
  conf?: number;
  box?: [number, number, number, number];
}
export type Claim = ClaimBase & ClaimBody;
export type ClaimBody =
  | { type: 'vertex_list'; vertices: VertexId[] }
  | { type: 'edge_list'; edges: { u: VertexId; v: VertexId }[] }
  | { type: 'loop_count'; value: number }
  | { type: 'odd_count'; value: number }
  | { type: 'component_count'; value: number }
  | { type: 'vertex_count'; value: number }
  | { type: 'edge_count'; value: number }
  | { type: 'degree'; v: VertexId; value: number }
  | { type: 'degree_sum'; value: number }
  | { type: 'odd_vertices'; vertices: VertexId[] }
  | { type: 'connected'; value: boolean }
  | { type: 'euler_exists'; kind: 'path' | 'circuit'; value: boolean }
  | { type: 'hamilton_exists'; kind: 'path' | 'cycle'; value: boolean; reason?: 'dirac' | 'ore' | 'degree1' | 'forced_edges' | 'found' }
  | { type: 'theorem'; name: 'dirac' | 'ore'; holds: boolean }
  | { type: 'walk'; kind: 'path' | 'euler_path' | 'euler_circuit' | 'hamilton_path' | 'hamilton_cycle' | 'tsp_tour' | 'postman_tour'; vertices: VertexId[]; edgeIds?: string[] }
  | { type: 'length'; vertices: VertexId[]; value: number }
  | { type: 'dijkstra_init'; source: VertexId }
  | { type: 'dijkstra_select'; v: VertexId }
  | { type: 'dijkstra_label'; v: VertexId; value: number | null; via?: VertexId }
  | { type: 'nn_step'; from: VertexId; to: VertexId }
  | { type: 'postman_duplicate'; vertices: VertexId[] }
  | { type: 'shortest_length'; from: VertexId; to: VertexId; value: number }
  | { type: 'final_answer'; value: unknown }
  | { type: 'statement'; id: string; value: boolean }
  | { type: 'choice'; option: string };

/** Statement items are independent; source/start are required by runtime validation. */
export type StatementCheck =
  | Exclude<ClaimBody, { type: 'vertex_list' | 'edge_list' | 'loop_count' | 'odd_count' | 'component_count' | 'statement' | 'choice' | 'final_answer' | 'dijkstra_init' | 'dijkstra_select' | 'dijkstra_label' | 'nn_step' }>
  | (Extract<ClaimBody, { type: 'dijkstra_label' }> & { source?: VertexId })
  | (Extract<ClaimBody, { type: 'nn_step' }> & { start?: VertexId });

export type ErrorCode =
  | 'SAI_PHEP_TINH' | 'SAI_DIEU_KIEN' | 'BO_SOT' | 'CANH_KHONG_TON_TAI' | 'LAP'
  | 'NHAM_THUAT_TOAN' | 'SAI_LUA_CHON' | 'KET_LUAN_KHONG_SUY_RA' | 'HIEU_SAI_DE';
export interface GradeResult {
  verdict: 'DUNG' | 'SAI' | 'CAN_XAC_NHAN' | 'KHONG_DU_CAN_CU';
  firstErrorStep?: number;
  errorCode?: ErrorCode;
  facts?: Record<string, unknown>;
  message: string;
  notes: string[];
  needsConfirmation?: { step: number; item: string }[];
}
