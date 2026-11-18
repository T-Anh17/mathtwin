import type { ClaimBody } from '@mathtwin/core';
import type { ParsedWork, WorkIssueCode, WorkLine, WorkVocabulary } from '../types.js';
import { workMessages } from '../messages.vi.js';
import { labelList, LabelError } from './labels.js';
import { gradingContent, isHeading, proseClause, splitClauses, walkKind } from './prose.js';
import type { ProseContext } from './prose.js';
import { language, sameQuestion, symbols } from './text.js';
import { parseTable, tableLike } from './table.js';
import { clauseEvidence, readingConfidence, stepConfidence } from './confidence.js';
import { strikeUncertain } from '../strikes.js';

export function parsePrimary(lines: WorkLine[], vocab: WorkVocabulary, opts?: { confThreshold?: number }): ParsedWork {
  const parsed: ParsedWork = { steps: [], ignored: [], unchecked: [], issues: [] };
  const context: ProseContext = {};
  const threshold = opts?.confThreshold ?? 0.85;
  const ordered = [...lines].sort((a, b) => a.page - b.page || a.index - b.index);
  const ignoredReason = (line: WorkLine): ParsedWork['ignored'][number]['reason'] | undefined => {
    if (line.skipped) return 'prose';
    if (line.struck) return 'struck';
    if (line.region === 'question') return 'question';
    if (line.region === 'figure') return 'figure';
    if (!line.text.trim() && !strikeUncertain(line) && readingConfidence(line) >= threshold) return 'empty';
    if (vocab.questionText.some((q) => sameQuestion(line.text, q))) return 'question';
    // A copied true/false prompt is not an answer. Bare a) Đ / a) S is handled below.
    if (vocab.questionFormat === 'dung_sai' && /^[a-z][).:]\s+/u.test(language(line.text, vocab.vertexLabels))
      && !/^[a-z][).:]\s*(?:dung|sai|d|s)(?:$|[\s.;,])/u.test(language(line.text, vocab.vertexLabels))) return 'question';
    return undefined;
  };
  const tableLines = new Set<number>();
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end < ordered.length && !ignoredReason(ordered[end]!) && !strikeUncertain(ordered[end]!) && tableLike(ordered[end]!, vocab)) end++;
    if (end - start >= 3) for (const row of ordered.slice(start, end)) tableLines.add(row.index);
    start = Math.max(start + 1, end);
  }
  const issue = (code: keyof typeof workMessages, sources: WorkLine[], severity: 'blocking' | 'warning' = 'blocking'): void => {
    parsed.issues.push({ code: code as WorkIssueCode, severity, lines: sources.map((l) => l.index), message: workMessages[code] });
  };
  const append = (body: ClaimBody, sources: WorkLine[], origin: 'text' | 'table' | 'inferred', evidence = sources): void => {
    const first = sources[0]!;
    const boxes = sources.flatMap((s) => s.box && s.page === first.page ? [s.box] : []);
    const samePage = sources.filter((s) => s.page === first.page);
    const box: [number, number, number, number] | undefined = boxes.length === samePage.length
      ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined;
    const conf = Math.min(...evidence.map((s) => stepConfidence(s, body, vocab, threshold)),
      ...sources.filter((s) => s.conf < 0.5).map((s) => s.conf), origin === 'inferred' ? threshold - 0.01 : 1);
    parsed.steps.push({ claim: { ...body, step: parsed.steps.length + 1, raw: sources.map((s) => s.text).join('\n'), conf, ...(box ? { box } : {}) },
      lines: sources.map((s) => s.index), page: first.page, ...(box ? { box } : {}), candidates: [body], origin });
    if (body.type === 'walk') context.walk = body.vertices;
  };
  const pages = new Set(ordered.map((l) => l.page));
  for (let page = 0; page <= Math.max(-1, ...pages); page++) {
    const pageLines = ordered.filter((l) => l.page === page);
    if (!pageLines.length || pageLines.every((l) => ['empty', 'question'].includes(ignoredReason(l) ?? ''))) issue('page_order', pageLines, 'warning');
  }
  for (let i = 0; i < ordered.length; i++) {
    const line = ordered[i]!;
    const ignored = ignoredReason(line);
    if (ignored) {
      parsed.ignored.push({ line: line.index, reason: ignored });
      if (ignored === 'figure' && /\d|=|[\p{L}]/u.test(line.text)) issue('figure_annotations', [line], 'warning');
      continue;
    }
    if (strikeUncertain(line)) {
      parsed.unchecked.push(line.index); issue('struck_uncertain', [line]); continue;
    }
    if (line.region === 'table' || tableLines.has(line.index)) {
      const sources: WorkLine[] = [];
      while (i < ordered.length && !ignoredReason(ordered[i]!) && !strikeUncertain(ordered[i]!) && (ordered[i]!.region === 'table' || tableLines.has(ordered[i]!.index))) sources.push(ordered[i++]!);
      i--;
      const found = vocab.task === 'shortest_path' ? parseTable(sources, vocab) : undefined;
      if (found) for (const entry of found) append(entry.body, entry.sources, entry.inferred ? 'inferred' : 'table', entry.evidence);
      else { parsed.unchecked.push(...sources.map((s) => s.index)); issue('table_unrecognized', sources, 'warning'); }
      continue;
    }
    const sources = [line];
    while (/(?:→|-|=|\+|×|:)\s*$/u.test(symbols(sources.at(-1)!.text))) {
      const next = ordered[i + 1];
      if (!next || next.page > sources.at(-1)!.page + 1 || ignoredReason(next) || strikeUncertain(next) || next.region === 'table' || tableLines.has(next.index)) break;
      const route = /(?:→|-)\s*$/u.test(symbols(sources.at(-1)!.text));
      if (!route) {
        if (!/^[\d∞(+\-]/u.test(symbols(next.text)) || /[\p{L}]/u.test(symbols(next.text))) break;
        sources.push(next); i++; continue;
      }
      // A wrapped route may consume only route text, not the next independent claim.
      if (!/^[\p{L}\p{N}_\s→,-]+[.]?$/u.test(symbols(next.text))) break;
      try { labelList(symbols(next.text).replace(/(?:→|-)\s*$/u, ''), vocab.vertexLabels); }
      catch (error) { if (error instanceof LabelError) break; throw error; }
      sources.push(next); i++;
    }
    const text = sources.map((l) => l.text).join(' ');
    const normalized = language(text, vocab.vertexLabels);
    if (isHeading(normalized)) {
      context.kind = walkKind(normalized, vocab);
      if (readingConfidence(line) < threshold) { parsed.unchecked.push(line.index); issue('unparsed_line', [line]); }
      else parsed.ignored.push({ line: line.index, reason: 'prose' });
      continue;
    }
    try {
      const bodies: { body: ClaimBody; clause: string }[] = [];
      let incomplete = false;
      // Keep algorithm explanations and equalities together; their numbers are literal.
      const algorithm = /\b(?:chon|danh dau|co dinh|khoanh|nhan(?! (?:thay|xet|duoc|ra|so|tong|do|bac|cac)\b)|gan nhan|lap lai|canh lap|them canh|gan nhat|nho nhat)\b/u.test(normalized) && !/duong di ngan nhat/u.test(normalized)
        || /\b(?:n|l)\s*\(/u.test(normalized);
      const clauses = algorithm ? [text] : splitClauses(text, vocab);
      const local: ProseContext = { ...context };
      local.lastGradingLine = !ordered.slice(i + 1).some((next) => !ignoredReason(next)
        && (next.region === 'table' || gradingContent(next.text, vocab) || (() => {
          try { return labelList(next.text, vocab.vertexLabels).length >= 2; } catch { return false; }
        })()));
      local.reason = /dirac/u.test(normalized) ? 'dirac' : /\bore\b/u.test(normalized) ? 'ore'
        : /bac 1\b/u.test(normalized) ? 'degree1' : /bat buoc|bac 2\b/u.test(normalized) ? 'forced_edges'
        : /tim thay/u.test(normalized) ? 'found' : undefined;
      for (const clause of clauses) {
        const found = proseClause(clause, vocab, local);
        if (found) {
          bodies.push(...found.map((body) => ({ body, clause })));
          for (const body of found) if (body.type === 'walk') local.walk = body.vertices;
        } else if (gradingContent(clause, vocab)) incomplete = true;
      }
      if (bodies.length) {
        for (const { body, clause } of bodies) append(body, sources, 'text', clauseEvidence(sources, clause, body));
      }
      if (incomplete) {
        parsed.unchecked.push(...sources.map((s) => s.index)); issue('unparsed_line', sources);
      } else if (!bodies.length) {
        for (const source of sources) {
          if (readingConfidence(source) < threshold) { parsed.unchecked.push(source.index); issue('unparsed_line', [source]); }
          else parsed.ignored.push({ line: source.index, reason: 'prose' });
        }
      }
    } catch (error) {
      if (!(error instanceof LabelError)) throw error;
      parsed.unchecked.push(...sources.map((s) => s.index)); issue(error.code, sources); issue('unparsed_line', sources);
    }
  }
  if (!parsed.steps.length && !parsed.unchecked.length) issue('no_solution_lines', []);
  return parsed;
}
