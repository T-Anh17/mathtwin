import type { Claim, ClaimBody, ProblemSpec } from '@mathtwin/core';
import type { WorkLine } from '@mathtwin/work';
export interface WordingFamily {
  id: string; split: 'dev' | 'test'; table: boolean;
  count: (subject: string, value: number) => string;
  list: (subject: string, values: string) => string;
  degree: (vertex: string, value: number) => string;
  conclusion: (text: string) => string;
  select: (vertex: string) => string;
  label: (vertex: string, value: string, via?: string) => string;
  answer: (value: string) => string;
}
export function wording(claim: ClaimBody, spec: ProblemSpec, family: WordingFamily): string {
  const label = (id: string): string => spec.graph.vertices.find((v) => v.id === id)?.label ?? id;
  const walk = (ids: string[]): string => ids.map(label).join(' → ');
  const count = family.count;
  switch (claim.type) {
    case 'vertex_count': return count('Số đỉnh', claim.value);
    case 'edge_count': return count('Số cạnh', claim.value);
    case 'loop_count': return count('Số khuyên', claim.value);
    case 'odd_count': return count('Số đỉnh bậc lẻ', claim.value);
    case 'component_count': return count('Số thành phần liên thông', claim.value);
    case 'degree_sum': return count('Tổng bậc', claim.value);
    case 'degree': return family.degree(label(claim.v), claim.value);
    case 'vertex_list': return family.list('Các đỉnh', claim.vertices.map(label).join(', '));
    case 'edge_list': return family.list('Các cạnh', claim.edges.map((e) => `(${label(e.u)}, ${label(e.v)})`).join(', '));
    case 'odd_vertices': return family.list('Các đỉnh bậc lẻ', claim.vertices.map(label).join(', '));
    case 'connected': return family.conclusion(`Đồ thị ${claim.value ? '' : 'không '}liên thông`);
    case 'euler_exists': return family.conclusion(`${claim.value ? 'Có' : 'Không có'} ${claim.kind === 'circuit' ? 'chu trình' : 'đường đi'} Euler`);
    case 'hamilton_exists': return family.conclusion(`${claim.value ? 'Có' : 'Không có'} ${claim.kind === 'cycle' ? 'chu trình' : 'đường đi'} Hamilton${claim.reason ? ` (lý do: ${{ dirac: 'Dirac', ore: 'Ore', degree1: 'đỉnh bậc 1', forced_edges: 'cạnh bắt buộc', found: 'đã tìm thấy' }[claim.reason]})` : ''}`);
    case 'theorem': return family.conclusion(`${claim.holds ? 'Thỏa' : 'Không thỏa'} điều kiện ${claim.name === 'dirac' ? 'Dirac' : 'Ore'}`);
    case 'walk': return family.list(({ path: 'đường đi', euler_path: 'Đường đi Euler', euler_circuit: 'Chu trình Euler', hamilton_path: 'Đường đi Hamilton', hamilton_cycle: 'Chu trình Hamilton', tsp_tour: 'Chu trình người du lịch', postman_tour: 'Hành trình người đưa thư' })[claim.kind], walk(claim.vertices))
      + (claim.edgeIds ? ` Các cạnh theo thứ tự: ${claim.edgeIds.join(', ')}.` : '');
    case 'length': return count('Độ dài', claim.value);
    case 'shortest_length': return family.conclusion(`d(${label(claim.from)}, ${label(claim.to)}) = ${claim.value}`);
    case 'dijkstra_init': return family.conclusion(`Gán nhãn ${label(claim.source)} = 0, các đỉnh khác ∞`);
    case 'dijkstra_select': return family.select(label(claim.v));
    case 'dijkstra_label': return family.label(label(claim.v), claim.value === null ? '∞' : String(claim.value), claim.via === undefined ? undefined : label(claim.via));
    case 'nn_step': return family.conclusion(`Từ ${label(claim.from)} đi đến ${label(claim.to)} (gần nhất)`);
    case 'postman_duplicate': return family.list('Lặp lại đường', walk(claim.vertices));
    case 'final_answer': return family.answer(typeof claim.value === 'string' ? claim.value : JSON.stringify(claim.value));
    case 'statement': return family.conclusion(`${claim.id}) ${claim.value ? 'Đúng' : 'Sai'}`);
    case 'choice': return family.conclusion(`Chọn phương án ${claim.option}`);
  }
}
/** Render a table only when every unselected cell has an explicit source label.
 * The selected cell keeps its last written label; only earlier selections become '-'. */
export function renderClaims(claims: Claim[], spec: ProblemSpec, family: WordingFamily, fallbackFamily?: WordingFamily) {
  const rows = new Map<number, { end: number; group: Claim[]; text: string }>();
  let tableFallback = false;
  if (family.table && claims.some((c) => c.type === 'dijkstra_select')) {
    const selected = new Set<string>();
    const known = new Map<string, number | null>();
    if (spec.task.type === 'shortest_path') known.set(spec.task.from, 0);
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i]!;
      if (claim.type !== 'dijkstra_select') continue;
      const start = i; const group: Claim[] = [claim];
      while (claims[i + 1]?.type === 'dijkstra_label') group.push(claims[++i]!);
      const labels = group.filter((c) => c.type === 'dijkstra_label');
      const remaining = spec.graph.vertices.filter((v) => !selected.has(v.id) && v.id !== claim.v);
      if (selected.has(claim.v) || !known.has(claim.v) || !spec.graph.vertices.some((v) => v.id === claim.v)
        || labels.length !== remaining.length || remaining.some((v) => labels.filter((c) => c.v === v.id).length !== 1)) {
        tableFallback = true; break;
      }
      const cells = spec.graph.vertices.map((v) => {
        if (selected.has(v.id)) return '-';
        if (v.id === claim.v) return String(known.get(v.id) ?? '∞');
        const c = labels.find((c) => c.v === v.id)!;
        known.set(v.id, c.value);
        return (c.value === null ? '∞' : String(c.value)) + (c.via === undefined ? '' : '/' + (spec.graph.vertices.find((v) => v.id === c.via)?.label ?? c.via));
      });
      rows.set(start, { end: i, group, text: (spec.graph.vertices.find((v) => v.id === claim.v)!.label) + ' ' + cells.join(' ') });
      selected.add(claim.v);
    }
  }
  const effective = tableFallback ? fallbackFamily ?? { ...family, table: false } : family;
  const lines: WorkLine[] = []; const lineOf: Record<string, number[]> = {};
  const add = (text: string, region: 'solution' | 'table'): number => {
    const index = lines.length; lines.push({ text: text.normalize('NFC'), region, conf: 1, alternatives: [], page: 0, index }); return index;
  };
  let header = false;
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]!; const row = tableFallback ? undefined : rows.get(i);
    if (row) {
      if (!header) { add('Chọn ' + spec.graph.vertices.map((v) => v.label).join(' '), 'table'); header = true; }
      const index = add(row.text, 'table');
      row.group.forEach((c) => { lineOf[String(c.step)] = [index]; });
      i = row.end;
    } else lineOf[String(claim.step)] = [add(wording(claim, spec, effective), 'solution')];
  }
  return { lines, lineOf, tableFallback, claims: claims.map((claim) => ({ ...claim, raw: lineOf[String(claim.step)]!.map((i) => lines[i]!.text).join('\n') })) };
}
