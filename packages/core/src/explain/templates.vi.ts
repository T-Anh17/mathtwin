import { MAX_DEGREE_SEQUENCE_VALUE } from '../graph/degree-sequence.js';

export const validationMessages = {
  object: 'Phải là một đối tượng.',
  array: 'Phải là một danh sách.',
  string: 'Phải là một chuỗi.',
  id: 'Mã định danh phải là chuỗi không rỗng.',
  duplicate: 'Mã định danh bị trùng.',
  vertex: 'Đỉnh không có trong đồ thị.',
  edge: 'Cạnh không có trong đồ thị.',
  directed: 'Phiên bản này chỉ hỗ trợ đồ thị vô hướng (directed = false).',
  vertexLimit: 'Phiên bản này hỗ trợ tối đa 20 đỉnh.',
  weight: 'Trọng số phải là số hữu hạn lớn hơn 0; Dijkstra không áp dụng với trọng số không dương.',
  missingWeight: 'Thiếu trọng số.',
  degreeSequence: `Dãy bậc phải gồm tối đa 20 số nguyên từ 0 đến ${MAX_DEGREE_SEQUENCE_VALUE}.`,
  boolean: 'Phải là giá trị đúng hoặc sai.',
  option: 'Giá trị không thuộc các lựa chọn được hỗ trợ.',
  number: 'Phải là một số hữu hạn.',
} as const;

export function validationMessage(path: string, message: string): string {
  return `${path}: ${message}`;
}

export function unknownVertexMessage(vertex: string): string {
  return `Đỉnh ${vertex} không có trong đồ thị.`;
}
