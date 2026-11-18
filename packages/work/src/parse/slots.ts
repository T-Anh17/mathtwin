import type { ClaimBody } from '@mathtwin/core';
import type { WorkVocabulary } from '../types.js';
import { labelList, oneLabel } from './labels.js';
import type { ProseContext } from './prose.js';

// Grammatical padding, independent of corpus families. Never discard negation,
// uncertainty, comparisons, numbers, or unknown words.
const padding = new Set(('em toi minh chung ta chung em ban thay rang la thi da dang se vua van '
  + 'nhan xet nhan thay quan sat dem tinh ghi viet liet ke xac ket qua duoc co gom bang '
  + 'tong cong tat ca cac nhung nay tren hinh do thi cua thanh chia nhu sau lan luot '
  + 'thu duoc tim duoc suy ra do vay nhu vay dai ket luan xet nay nay '
  + 'khi kiem tra vua moi cuoi cung quat lai').split(' '));
export function unpad(text: string, labels: string[] = []): string {
  const protectedLabels = new Set(labels.map((v) => v.toLowerCase()));
  return text.replace(/\b(?:thong ke|xac dinh|tong cong)\b/gu, '').split(/(\s+|[:=])/u).filter((word) => !padding.has(word) || protectedLabels.has(word)).join('').replace(/[:=]/gu, '').replace(/\s+/gu, ' ').trim();
}
export function writtenNumbers(text: string, labels: string[] = []): number[] {
  const keys = new Set(labels.map((v) => v.toLowerCase()));
  const withoutLabels = text.split(/([^\p{L}\p{N}_])/u).map((word) => keys.has(word) ? '' : word).join('');
  return [...withoutLabels.matchAll(/(?<![\p{L}\p{N}_])-?\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu)].map((m) => Number(m[0].replace(',', '.')));
}
export function numericValue(text: string, labels: string[] = [], allowWords = false): number | undefined {
  if (/[?]|\b(?:khong|chua|hoac|khoang|hon|kem)\b/u.test(text)) return undefined;
  const rhs = text.includes('=') ? text.slice(text.lastIndexOf('=') + 1).trim() : unpad(text);
  if (allowWords) {
    const values = writtenNumbers(text.includes('=') ? rhs : text, labels);
    return values.length === 1 && Number.isFinite(values[0]) ? values[0] : undefined;
  }
  // A written final equality is authoritative, even if earlier arithmetic has words.
  if (!/^-?\d+(?:[.,]\d+)?$/u.test(rhs)) return undefined;
  const value = Number(rhs.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}
type SubjectKind = 'vertices' | 'edges' | 'odd' | 'degree_sum' | 'component_count' | 'loop_count' | 'degree' | 'length' | 'shortest_length';
// Optional location/possession preposition and vertex noun, shared by labelled topics.
export const vertexQualifier = '(?:(?:cua|tai|o|cho|den|toi)\\s+)?(?:(?:dinh|diem)\\s+)?';
interface Subject { kind: SubjectKind; start: number; end: number; text: string }
const subjects: [SubjectKind, RegExp][] = [
  ['degree_sum', /\b(?:tong(?: so)? bac(?: cua (?:cac )?dinh)?|tong cac bac)\b/gu],
  ['odd', /\b(?:(?:so(?: luong)?|cac|tap(?: hop)?) )?dinh(?: co)? bac le\b/gu],
  ['component_count', /\b(?:(?:so(?: luong)?|cac) )?(?:thanh phan|nhom)(?: lien thong)\b/gu],
  ['loop_count', /\b(?:(?:so(?: luong)?|cac) )?(?:canh )?khuyen\b/gu],
  ['vertices', /\b(?:(?:so(?: luong)?|cac|tap(?: hop)?) )?dinh\b|\|v\||\bv(?=\s*[:=])/gu],
  ['edges', /\b(?:(?:so(?: luong)?|cac|tap(?: hop)?) )?canh\b|\|e\||\be(?=\s*[:=])/gu],
  ['degree', new RegExp(`\\b(?:bac\\s+${vertexQualifier}[\\p{L}\\p{N}_]+|[\\p{L}\\p{N}_]+\\s+co bac)|\\b(?:deg|d)\\([^(),]+\\)`, 'gu')],
  ['shortest_length', /\b(?:duong di ngan nhat|khoang cach ngan nhat)\s+tu\s+\S+\s+den\s+\S+|\bd\([^(),]+,\s*[^()]+\)/gu],
  ['length', /\b(?:duong di co do dai|do dai(?: duong di)?|tong quang duong|tong(?=\s*[:=]))\b/gu],
];
/** Longest non-overlapping noun phrases; only the assertion side supplies topics. */
function topics(text: string): Subject[] {
  const lhs = text.includes('=') ? text.slice(0, text.indexOf('=') + 1) : text;
  const found = subjects.flatMap(([kind, pattern]) => [...lhs.matchAll(pattern)].map((m) => ({ kind, start: m.index, end: m.index + m[0].length, text: m[0] })));
  const kept: Subject[] = [];
  for (const item of found.sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
    if (!kept.some((k) => item.start < k.end && item.end > k.start)) kept.push(item);
  }
  return kept.sort((a, b) => a.start - b.start);
}
export function slotClaim(text: string, vocab: WorkVocabulary, context: ProseContext): ClaimBody[] | undefined {
  // In a grouping construction the object being divided is not a count topic.
  text = text.replace(/\bchia\s+(?:(?:cac|tap|tap hop)\s+)?(?:dinh|canh)\s+thanh\b/gu, 'chia thanh');
  const found = topics(text);
  if (found.length !== 1) return undefined;
  const subject = found[0]!;
  const before = text.slice(0, subject.start);
  const after = text.slice(subject.end);
  const rest = before + ' ' + after;
  const afterNumbers = writtenNumbers(after, vocab.vertexLabels);
  if (!text.includes('=') && (afterNumbers.length > 1 || afterNumbers.length > 0 && numericValue(before) !== undefined
    || !afterNumbers.length && writtenNumbers(rest, vocab.vertexLabels).length > 1)) return undefined;
  const value = numericValue(after, vocab.vertexLabels, true) ?? (!text.includes('=') ? numericValue(rest) : undefined);
  // A value after its subject needs no closed list of connecting words.
  // Reverse order still requires grammatical padding around the written value.
  const numeric = value !== undefined;
  if (numeric) {
    if (/^[ve]$/u.test(subject.text)) return undefined;
    if (subject.kind === 'degree') {
      const label = subject.text.replace(/^(?:deg|d)\(|\)$/gu, '').replace(new RegExp(`^bac\\s+${vertexQualifier}|\\s+co bac$`, 'gu'), '');
      return [{ type: 'degree', v: oneLabel(label, vocab.vertexLabels), value }];
    }
    if (subject.kind === 'shortest_length') {
      const pair = subject.text.match(/^d\(([^,]+),\s*([^()]+)\)$/u) ?? subject.text.match(/tu\s+(\S+)\s+den\s+(\S+)$/u);
      if (!pair) return undefined;
      return [{ type: 'shortest_length', from: oneLabel(pair[1]!, vocab.vertexLabels), to: oneLabel(pair[2]!, vocab.vertexLabels), value }];
    }
    if (subject.kind === 'length') return context.walk ? [{ type: 'length', vertices: [...context.walk], value }]
      : context.lastGradingLine && ['shortest_path', 'tsp', 'postman'].includes(vocab.task) ? [{ type: 'final_answer', value }] : undefined;
    const type = subject.kind === 'vertices' ? 'vertex_count' : subject.kind === 'edges' ? 'edge_count' : subject.kind === 'odd' ? 'odd_count' : subject.kind;
    return [{ type, value }];
  }
  if (/^(?:dinh|canh)$/u.test(subject.text)) return undefined;
  if (!['vertices', 'edges', 'odd'].includes(subject.kind)) return undefined;
  // An explicit numeric heading must never turn a failed number into a label list.
  if (/^so\b|^\|/u.test(subject.text) || /\d/u.test(unpad(after, vocab.vertexLabels).replace(/[\p{L}_]+\d+/gu, ''))) return undefined;
  const left = unpad(before, vocab.vertexLabels);
  const right = unpad(after, vocab.vertexLabels);
  if (left && right) return undefined;
  const tail = right || left;
  const empty = /^(?:khong|tap rong|\{\s*\})$/u.test(tail);
  const content = empty ? '' : tail;
  if (!content && !empty) return undefined;
  const vertices = labelList(content, vocab.vertexLabels);
  if (subject.kind === 'edges') {
    if (vertices.length % 2) return undefined;
    return [{ type: 'edge_list', edges: Array.from({ length: vertices.length / 2 }, (_, i) => ({ u: vertices[2 * i]!, v: vertices[2 * i + 1]! })) }];
  }
  return [{ type: subject.kind === 'odd' ? 'odd_vertices' : 'vertex_list', vertices }];
}
