import type { ClaimBody } from '@mathtwin/core';
import type { WorkVocabulary } from '../types.js';
import { labelList, oneLabel } from './labels.js';
import { escapeRegex, language } from './text.js';
import { numericValue, unpad, vertexQualifier } from './slots.js';

/** Translate written algorithm actions. No graph state or mathematical repair. */
export function algorithmClause(input: string, vocab: WorkVocabulary): ClaimBody[] | undefined {
  let text = language(input, vocab.vertexLabels).replace(/[.;]$/u, '').trim()
    .replace(/^(?:em ghi|ket qua)\s*:\s*/u, '')
    .replace(/\bcanh\s+di\s+lap\b/u, 'lap lai canh');
  // A compact textbook line can contain several completed Dijkstra actions.
  // It must parse all of them or none, otherwise a later selection loses the
  // initialization/labels that make it gradeable.
  const sentences = text.split(/(?<=[.;])\s+/u).filter(Boolean);
  if (sentences.length > 1) {
    const groups = sentences.map((sentence) => algorithmClause(sentence, vocab));
    return groups.every((group) => group !== undefined) ? groups.flatMap((group) => group!) : undefined;
  }
  const semicolons = text.split(/;\s*/u).filter(Boolean);
  if (semicolons.length > 1) {
    const groups = semicolons.map((sentence) => algorithmClause(sentence, vocab));
    return groups.every((group) => group !== undefined) ? groups.flatMap((group) => group!) : undefined;
  }
  const start = /\b(?:gan nhan|khoi tao|khoanh|chon|dinh duoc chon|tu|tai|lap lai duong|lap lai canh|them canh lap)\b/u.exec(text);
  const actionAt = start?.[0] === 'tai' && /^tai\s+\S+\s+(?:doi|giu nguyen|ghi)\s+nhan\b/u.test(text.slice(start.index));
  if (start && (actionAt || !/\b(?:nhan|khoang cach|do dai)\s*$/u.test(text.slice(0, start.index)) && unpad(text.slice(0, start.index), vocab.vertexLabels) === '')) text = text.slice(start.index);
  const pieces = text.split(/[,;]\s*(?=(?:n|l)\s*\(|khoanh\b|chon\b)/u);
  if (pieces.length > 1) {
    const groups = pieces.map((piece) => algorithmClause(piece, vocab));
    return groups.every((group) => group !== undefined) ? groups.flatMap((group) => group!) : undefined;
  }
  const label = (value: string): string => oneLabel(value, vocab.vertexLabels);
  const vertex = vocab.vertexLabels.map((v) => escapeRegex(language(v, vocab.vertexLabels))).join('|');
  const listedVertices = (value: string): string[] => value.split(/[^\p{L}\p{N}_]+/u).flatMap((word) => {
    const matches = vocab.vertexLabels.filter((candidate) => language(candidate, vocab.vertexLabels) === language(word, vocab.vertexLabels));
    return matches.length === 1 ? matches : [];
  });
  let match: RegExpMatchArray | null;
  if (vocab.task === 'shortest_path') {
    match = text.match(/^(?:gan nhan(?: cho)?|khoi tao(?: nhan)?(?: cho)?)\s+(\S+)\s*(?:=|la|bang)\s*0\s*(?:\(\s*n_?\S+\s*=\s*0\s*\))?\s*[,;]\s*(?:cac )?dinh (?:khac|con lai)\s*(?:=|la|bang)?\s*∞$/u);
    if (match) return [{ type: 'dijkstra_init', source: label(match[1]!) }];
    const compact = new RegExp(`(?:^|[;,]\\s*|\\s)(?:n_?)?(${vertex})\\s*(?:=|:)\\s*(∞|-?\\d+(?:[.,]\\d+)?)`, 'gu');
    const compactValues = [...text.matchAll(compact)];
    if (compactValues.length) {
      const residue = text.replace(compact, '').replace(/[\s,;.]/gu, '');
      if (!residue) {
        const zeroes = compactValues.filter((item) => item[2] === '0');
        if (zeroes.length > 1) return undefined;
        const result: ClaimBody[] = [];
        if (zeroes.length === 1) result.push({ type: 'dijkstra_init', source: label(zeroes[0]![1]!) });
        for (const item of compactValues) {
          if (item[2] === '0') continue;
          result.push({ type: 'dijkstra_label', v: label(item[1]!), value: item[2] === '∞' ? null : Number(item[2]!.replace(',', '.')) });
        }
        return result.length ? result : undefined;
      }
    }
    match = text.match(new RegExp(`\\bn_?(${vertex})\\s*=\\s*.+?=\\s*(-?\\d+(?:[.,]\\d+)?)$`, 'u'));
    if (match) return [{ type: 'dijkstra_label', v: label(match[1]!), value: Number(match[2]!.replace(',', '.')) }];
    match = text.match(/\b(?:tai cac )?dinh ke voi\s+(\S+).*?\bgom\s+(.+?),\s*lan luot\s+ghi\s+(?:cac\s+)?nhan\s+(.+?)(?:\s*\(|$)/u);
    if (match) {
      const vertices = listedVertices(match[2]!);
      const values = [...match[3]!.matchAll(/-?\d+(?:[.,]\d+)?/gu)].map((value) => Number(value[0].replace(',', '.')));
      if (!vertices.length || vertices.length !== values.length) return undefined;
      return vertices.map((v, index) => ({ type: 'dijkstra_label', v, value: values[index]! }));
    }
    match = text.match(/^tai\s+(\S+)\s+giu nguyen nhan\s+(-?\d+(?:[.,]\d+)?)(?:\s*,|$)/u);
    if (match) return [{ type: 'dijkstra_label', v: label(match[1]!), value: Number(match[2]!.replace(',', '.')) }];
    match = text.match(/\b(?:khoanh(?: tron)?|chon|danh dau|co dinh|(?:dinh )?(?:duoc )?chon\s*:)\s*(?:(?:dinh|diem)\s+)?([^\s:]+)$/u);
    if (match && (vocab.questionFormat !== 'trac_nghiem' || !/^chon\b/u.test(match[0]))) return [{ type: 'dijkstra_select', v: label(match[1]!) }];
    match = text.match(/\b(?:n|l|d)\s*\(\s*([^(),]+)\s*\)\s*(.+)$/u)
      ?? text.match(new RegExp(`\\b(?:(?:nhan|khoang cach|do dai)\\s+${vertexQualifier}(${vertex})|tai\\s+(${vertex})\\s*,?\\s*(?:doi )?nhan)(?![\\p{L}\\p{N}_])\\s*(.+)$`, 'u'));
    if (match) {
      const v = label(match[1] ?? match[2]!);
      let rhs = match.at(-1)!;
      const viaPattern = /\b(?:(?:di )?qua|tu)\s+([^\s(),;]+)/u;
      const via = rhs.match(viaPattern) ?? rhs.match(/(?:n|l|d)\s*\(\s*([^()]+)\s*\)/u);
      rhs = rhs.replace(viaPattern, '').replace(/\(\s*\)/gu, '').replace(/[,;]\s*$/u, '').replace(/^.*\bthanh\s+/u, '').trim();
      // A second bare vertex is not a value connector; via and function arguments have their own slots.
      const bareWords = rhs.replace(/\b(?:n|l|d|w)\s*\([^()]*\)/gu, '').split(/[^\p{L}\p{N}_]+/u);
      if (bareWords.some((word) => vocab.vertexLabels.some((v) => language(v, vocab.vertexLabels) === word))) return undefined;
      const value = /^\s*(?:=|la|bang)?\s*∞$/u.test(rhs) ? null : numericValue(rhs, vocab.vertexLabels, true);
      if (value !== undefined) return [{ type: 'dijkstra_label', v, value, ...(via ? { via: label(via[1]!) } : {}) }];
    }
    match = text.match(/^tai\s+(\S+)\s+doi nhan\s+\S+\s+thanh\s+(.+)$/u);
    if (match) {
      const value = numericValue(match[2]!);
      if (value !== undefined) return [{ type: 'dijkstra_label', v: label(match[1]!), value }];
    }
  }
  if (vocab.task === 'tsp') {
    match = text.match(/^tu\s+([^\s,]+)\s+(?:di )?den\s+([^\s,]+)\s*\(gan nhat\)$/u)
      ?? text.match(/^([^\s,]+)\s*→\s*([^\s,]+)\s+vi\s+.+\b(?:nho|gan) nhat$/u);
    if (match) return [{ type: 'nn_step', from: label(match[1]!), to: label(match[2]!) }];
    match = text.match(/^tu\s+([^\s,]+)\s*,?\s*dinh\s+(?:chua\s+den\s+)?gan nhat\s+la\s+([^\s,]+)(?:\s*,|$)/u);
    if (match) return [{ type: 'nn_step', from: label(match[1]!), to: label(match[2]!) }];
    match = text.match(/\bquay ve\s+([^\s,]+)\s*,?\s*([^\s,]+)\s*=\s*-?\d+(?:[.,]\d+)?/u);
    if (match) {
      const end = label(match[1]!);
      const edge = labelList(match[2]!, vocab.vertexLabels);
      if (edge.length !== 2 || edge[0] !== end && edge[1] !== end) return undefined;
      return [{ type: 'nn_step', from: edge[0] === end ? edge[1]! : edge[0]!, to: end }];
    }
  }
  if (vocab.task === 'postman') {
    const subject = /\b(?:lap lai duong|lap lai canh|them canh lap)\b/u.exec(text);
    if (subject) {
      if (subject[0] === 'lap lai canh') {
        const tail = text.slice(subject.index + subject[0].length).replace(/\s+de\s+.+$/u, '').replace(/^\s*(?:la|gom)\s+/u, '').trim();
        const pairs = [...tail.matchAll(/\(([^()]+)\)/gu)];
        if (pairs.length && !tail.replace(/\([^()]+\)/gu, '').replace(/[,;\s]/gu, '')) {
          return pairs.map((pair) => ({ type: 'postman_duplicate', vertices: labelList(pair[1]!, vocab.vertexLabels) }));
        }
        const routes = tail.split(/\s*,\s*/u).filter(Boolean).map((route) => labelList(route, vocab.vertexLabels));
        return routes.length && routes.every((route) => route.length === 2) ? routes.map((vertices) => ({ type: 'postman_duplicate', vertices })) : undefined;
      }
      const before = unpad(text.slice(0, subject.index), vocab.vertexLabels);
      const after = unpad(text.slice(subject.index + subject[0].length), vocab.vertexLabels);
      if (before && after) return undefined;
      const vertices = labelList(before || after, vocab.vertexLabels);
      if (vertices.length >= 2) return [{ type: 'postman_duplicate', vertices }];
    }
  }
  return undefined;
}
