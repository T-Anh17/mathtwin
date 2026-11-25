import type { ProblemSpec, Task } from '@mathtwin/core';
import { normalizeLabel } from './model.js';

export interface TaskSuggestion {
  task: ProblemSpec['task'] | null;
  questionFormat: ProblemSpec['questionFormat'] | null;
  /** Vocabulary that matched, retained for a user-facing explanation. */
  matched: string[];
  /** A rule deliberately declined to merge more than one requested task. */
  reason?: 'multiple_task_types';
  /** Fields populated by a rule; each still requires explicit confirmation. */
  uncertain: string[];
}

type TaskRule = { type: Task['type']; keywords: readonly string[] };

// This is deliberately a vocabulary table, rather than a classifier.  A phrase
// is matched after Vietnamese diacritics have been removed; a single typo is
// accepted only for a keyword token of five or more characters.
const taskRules: readonly TaskRule[] = [
  { type: 'elements', keywords: ['số đỉnh', 'số cạnh', 'liệt kê', 'đỉnh cô lập', 'đa đồ thị', 'đơn đồ thị'] },
  { type: 'degree', keywords: ['bậc của', 'tính bậc', 'dãy bậc'] },
  { type: 'connectivity', keywords: ['liên thông', 'thành phần liên thông'] },
  { type: 'path', keywords: ['đường đi từ'] },
  { type: 'euler', keywords: ['euler'] },
  { type: 'hamilton', keywords: ['hamilton'] },
  { type: 'shortest_path', keywords: ['đường đi ngắn nhất', 'dijkstra'] },
  { type: 'tsp', keywords: ['người du lịch', 'láng giềng gần nhất'] },
  { type: 'postman', keywords: ['người đưa thư'] },
  { type: 'statements', keywords: ['đúng sai', 'mệnh đề nào'] },
];

const formatRules: readonly { format: ProblemSpec['questionFormat']; keywords: readonly string[] }[] = [
  { format: 'dung_sai', keywords: ['đúng sai', 'mệnh đề nào', 'ghi đúng hoặc sai'] },
  { format: 'trac_nghiem', keywords: ['trắc nghiệm', 'chọn đáp án', 'lựa chọn'] },
  { format: 'tra_loi_ngan', keywords: ['trả lời ngắn', 'điền đáp án'] },
  { format: 'tu_luan', keywords: ['tự luận'] },
];

function folded(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function distanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  return true;
}

function matches(text: string, keyword: string): boolean {
  const source = folded(text), target = folded(keyword);
  if (!source || !target) return false;
  if (` ${source} `.includes(` ${target} `)) return true;
  if (target.includes(' ')) return false;
  return target.length >= 5 && source.split(' ').some((word) => distanceAtMostOne(word, target));
}

function matchingKeywords(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => matches(text, keyword));
}

function postmanMeaningMatches(text: string): string[] {
  const source = folded(text);
  const road = '(?:con\\s+(?:duong|dg)|tuyen\\s+(?:duong|pho|dg)|duong|dg|pho|canh|doan\\s+duong)';
  const coversEveryRoad = new RegExp(`\\b(?:di qua\\s+)?(?:moi|tat ca|toan bo)\\s+(?:cac\\s+)?${road}\\b`, 'u').test(source);
  const repeatsOrServes = /\b(?:it nhat (?:mot|1) lan|quet|thu gom|dua thu|di qua)\b/u.test(source);
  const returns = /\b(?:quay ve|quay tro lai|tro ve|ket thuc tai)\b/u.test(source);
  if (coversEveryRoad && repeatsOrServes) {
    return ['mỗi/tất cả/toàn bộ đường hoặc cạnh', 'ít nhất một lần/quét/thu gom/đưa thư', ...(returns ? ['quay về/kết thúc tại'] : [])];
  }
  const depotRoundTrip = /\bbat dau\s+va\s+ket thuc\s+tai\b/u.test(source)
    && /\b(?:tuyen\s+)?duong\s+ngan\s+nhat\s+de\s+hoan thanh\s+cong viec\b/u.test(source);
  return depotRoundTrip ? ['bắt đầu và kết thúc tại', 'tuyến đường ngắn nhất để hoàn thành công việc'] : [];
}

function tspMeaningMatches(text: string): string[] {
  const source = folded(text);
  const visitsEachOnce = /\b(?:tham|di qua)\s+moi\s+(?:thanh pho|cua hang|diem|dinh)\s+dung mot lan\b/u.test(source);
  const returns = /\b(?:quay ve|tro ve)\b/u.test(source);
  return visitsEachOnce && returns ? ['thăm/đi qua mỗi điểm đúng một lần', 'quay về/trở về'] : [];
}

function labelOf(value: string, labels: string[]): string | null {
  const matches = labels.filter((label) => normalizeLabel(label) === normalizeLabel(value));
  return matches.length === 1 ? matches[0]! : null;
}

function endpoints(text: string, labels: string[]): { from: string; to: string } | null {
  const source = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}-]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const match = /\b(?:tu\s+(?:dinh\s+)?([^\s,.;:-]+)\s+(?:den|toi|-)+\s*(?:dinh\s+)?([^\s,.;:-]+)|giua\s+(?:dinh\s+)?([^\s,.;:]+)\s+va\s+(?:dinh\s+)?([^\s,.;:]+))/u.exec(source);
  if (!match) return null;
  const from = labelOf(match[1] ?? match[3]!, labels), to = labelOf(match[2] ?? match[4]!, labels);
  return from && to ? { from, to } : null;
}

function startAt(text: string, labels: string[]): string | null {
  const source = folded(text);
  const candidates: string[] = [];
  const explicit = [
    /\bbat dau(?:\s+va\s+ket thuc)?\s+(?:tu|tai)\s+(?:diem\s+)?([^\s,.;:()]+)/u,
    /\bxuat phat\s+(?:tu|tai)\s+(?:diem\s+)?([^\s,.;:()]+)/u,
    /\btai diem\s+([^\s,.;:()]+)/u,
  ];
  for (const pattern of explicit) {
    const match = pattern.exec(source);
    const label = match ? labelOf(match[1]!, labels) : null;
    if (label) candidates.push(label);
  }
  for (const match of text.matchAll(/\b(?:bắt đầu|xuất phát|kết thúc)[^.;:()]*\(\s*([^()\s]+)\s*\)/giu)) {
    const label = labelOf(match[1]!, labels);
    if (label) candidates.push(label);
  }
  for (const match of text.matchAll(/\btại\s+(?:điểm\s+)?[^.;:()]*\(\s*([^()\s]+)\s*\)/giu)) {
    const label = labelOf(match[1]!, labels);
    if (label) candidates.push(label);
  }
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0]! : null;
}

function taskFor(type: Task['type'], text: string, labels: string[]): Task | null {
  const pair = endpoints(text, labels), start = startAt(text, labels), normalized = folded(text);
  switch (type) {
    case 'elements': case 'degree': case 'connectivity': return { type };
    case 'path': return pair ? { type, ...pair } : null;
    case 'euler': return { type, want: normalized.includes('chu trinh euler') ? 'circuit' : normalized.includes('duong di euler') ? 'path' : 'any', ...(start ? { start } : {}) };
    case 'hamilton': return { type, want: normalized.includes('chu trinh hamilton') ? 'cycle' : 'path', ...(start ? { start } : {}), ...(pair ? { end: pair.to } : {}) };
    case 'shortest_path': return pair ? { type, ...pair } : null;
    case 'tsp': return { type, method: normalized.includes('lang gieng gan nhat') ? 'nearest_neighbor' : normalized.includes('toi uu') ? 'optimal' : 'both', ...(start ? { start } : {}) };
    // Task.start is mandatory in ProblemSpec.  An empty value is a draft-only
    // placeholder: it is explicitly kept uncertain and can never be solved.
    case 'postman': return { type, start: start ?? '' };
    case 'statements': return { type, items: [] };
    case 'degree_sequence': return null;
  }
}

function uncertainFor(task: Task, questionFormat: ProblemSpec['questionFormat'] | null): string[] {
  const fields = Object.keys(task).map((key) => `task.${key}`);
  return questionFormat === null ? fields : [...fields, 'questionFormat'];
}

/** Suggest an unconfirmed task from question vocabulary alone. */
export function suggestTask(questionText: string, vertexLabels: string[]): TaskSuggestion {
  const taskMatches = taskRules.map((rule) => ({ rule, matched: matchingKeywords(questionText, rule.keywords) })).filter((entry) => entry.matched.length);
  for (const [type, matched] of [['postman', postmanMeaningMatches(questionText)], ['tsp', tspMeaningMatches(questionText)]] as const) {
    if (!matched.length) continue;
    const existing = taskMatches.find((entry) => entry.rule.type === type);
    if (existing) existing.matched.push(...matched);
    else taskMatches.push({ rule: { type, keywords: [] }, matched });
  }
  const formatMatches = formatRules.map((rule) => ({ rule, matched: matchingKeywords(questionText, rule.keywords) })).filter((entry) => entry.matched.length);
  const matched = [...new Set([...taskMatches.flatMap((entry) => entry.matched), ...formatMatches.flatMap((entry) => entry.matched)])];
  const questionFormat = formatMatches.length === 1 ? formatMatches[0]!.rule.format : null;
  if (taskMatches.length === 0) return { task: null, questionFormat, matched, uncertain: [] };
  if (taskMatches.length > 1) return { task: null, questionFormat, matched, reason: 'multiple_task_types', uncertain: [] };
  const task = taskFor(taskMatches[0]!.rule.type, questionText, vertexLabels);
  if (!task) return { task: null, questionFormat, matched, uncertain: [] };
  return { task, questionFormat, matched, uncertain: uncertainFor(task, questionFormat) };
}
