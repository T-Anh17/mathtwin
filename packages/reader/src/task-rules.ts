import type { ProblemSpec, Task } from '@mathtwin/core';
import { normalizeLabel } from './model.js';

export interface TaskSuggestion {
  task: ProblemSpec['task'] | null;
  questionFormat: ProblemSpec['questionFormat'] | null;
  /** Vocabulary that matched, retained for a user-facing explanation. */
  matched: string[];
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
  { format: 'dung_sai', keywords: ['đúng sai', 'mệnh đề nào'] },
  { format: 'trac_nghiem', keywords: ['trắc nghiệm', 'chọn đáp án', 'lựa chọn'] },
  { format: 'tra_loi_ngan', keywords: ['trả lời ngắn', 'điền đáp án'] },
  { format: 'tu_luan', keywords: ['tự luận'] },
];

function folded(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
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

function labelOf(value: string, labels: string[]): string | null {
  const matches = labels.filter((label) => normalizeLabel(label) === normalizeLabel(value));
  return matches.length === 1 ? matches[0]! : null;
}

function endpoints(text: string, labels: string[]): { from: string; to: string } | null {
  const match = /\btu\s+(?:dinh\s+)?([^\s,.;:]+)\s+den\s+(?:dinh\s+)?([^\s,.;:]+)/u.exec(folded(text));
  if (!match) return null;
  const from = labelOf(match[1]!, labels), to = labelOf(match[2]!, labels);
  return from && to ? { from, to } : null;
}

function startAt(text: string, labels: string[]): string | null {
  const match = /\bxuat phat tu\s+(?:dinh\s+)?([^\s,.;:]+)/u.exec(folded(text));
  return match ? labelOf(match[1]!, labels) : null;
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
    case 'postman': return start ? { type, start } : null;
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
  const formatMatches = formatRules.map((rule) => ({ rule, matched: matchingKeywords(questionText, rule.keywords) })).filter((entry) => entry.matched.length);
  const matched = [...new Set([...taskMatches.flatMap((entry) => entry.matched), ...formatMatches.flatMap((entry) => entry.matched)])];
  const questionFormat = formatMatches.length === 1 ? formatMatches[0]!.rule.format : null;
  if (taskMatches.length !== 1) return { task: null, questionFormat, matched, uncertain: [] };
  const task = taskFor(taskMatches[0]!.rule.type, questionText, vertexLabels);
  if (!task) return { task: null, questionFormat, matched, uncertain: [] };
  return { task, questionFormat, matched, uncertain: uncertainFor(task, questionFormat) };
}
