import type { ClaimBody } from '@mathtwin/core';
import type { ParsedWork, WorkIssueCode, WorkLine, WorkVocabulary } from '../types.js';
import { workMessages } from '../messages.vi.js';
import { labelList, LabelError } from './labels.js';
import { gradingContent, isHeading, proseClause, splitClauses, walkKind } from './prose.js';
import type { ProseContext } from './prose.js';
import { fold, language, sameQuestion, symbols } from './text.js';
import { parseTable, tableLike } from './table.js';
import { clauseEvidence, readingConfidence, stepConfidence } from './confidence.js';
import { strikeUncertain } from '../strikes.js';

interface ItemPrefix { text: string; statementId?: string; ambiguous: boolean }
/** Join a wrapped proposition only at a syntactic continuation point. */
function joinsLogicalLine(previous: WorkLine, next: WorkLine): boolean {
  const before = symbols(previous.text).trim();
  const after = symbols(next.text).trim();
  if (!before || !after) return false;
  if (/(?:→|-)\s*$/u.test(before)) return !/[=()]/u.test(after) && /^(?:[\p{L}\p{N}_\s→,\-]+)[.]?$/u.test(after);
  if (/(?:=|\+|×)\s*$/u.test(before)) return /^[\d∞(+\-]/u.test(after);
  if (/[:,]\s*$/u.test(before)) return !/^(?:chu\s+trinh|duong\s+di|hanh\s+trinh)\b/iu.test(language(before, []));
  const folded = language(before, []).trim();
  if (/\b(?:va|và|la|là|nen|nên|tu|từ|voi|với|cua|của|do|do đó|vì)\s*$/iu.test(folded)) return true;
  return /^(?:→|=|\+|-)(?=\s|[\p{L}\p{N}(])/u.test(after) && /(?:=|\+|×|→|-)\s*[^.]+$/u.test(before);
}
/**
 * Item markers are not graph vertices.  Strip one only when the surrounding
 * exercise format or the following vocabulary proves it is a marker.  A lone
 * `a)` can also be a genuine vertex label, so keep that case for confirmation.
 */
function itemPrefix(input: string, vocab: WorkVocabulary): ItemPrefix | undefined {
  const match = input.match(/^\s*([a-dA-D])[).]\s*(.*)$/u);
  if (!match) return undefined;
  const label = match[1]!;
  const rest = match[2]!;
  const normalized = language(rest, vocab.vertexLabels);
  const statementId = vocab.statementIds.find((id) => fold(id) === fold(label));
  const cue = /^(?:dung|sai|d|s)(?:$|[\s.,;:])|^(?:chon|tu)\b/u.test(normalized);
  const itemFormat = vocab.questionFormat === 'dung_sai' || vocab.questionFormat === 'trac_nghiem' || statementId !== undefined;
  if (cue || itemFormat && rest.trim()) return { text: rest, ...(statementId ? { statementId } : {}), ambiguous: false };
  if (itemFormat) return undefined;
  const vertexCollision = vocab.vertexLabels.some((vertex) => fold(vertex) === fold(label));
  return { text: input, ambiguous: vertexCollision };
}

function itemJudgment(text: string, statementId: string | undefined): { body?: ClaimBody; remainder: string } {
  if (!statementId) return { remainder: text };
  const match = text.match(/^\s*(đúng|dung|sai|đ|d|s)(?:[.,:;]\s*|\s+|$)(.*)$/iu);
  if (!match) return { remainder: text };
  const value = fold(match[1]!);
  return { body: { type: 'statement', id: statementId, value: value === 'dung' || value === 'd' }, remainder: match[2]!.trim() };
}

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
    while (joinsLogicalLine(sources.at(-1)!, ordered[i + 1] ?? { ...line, text: '' })) {
      const next = ordered[i + 1];
      if (!next || next.page > sources.at(-1)!.page + 1 || ignoredReason(next) || strikeUncertain(next) || next.region === 'table' || tableLines.has(next.index)) break;
      if (/(?:→|-)\s*$/u.test(symbols(sources.at(-1)!.text))) {
        // A wrapped route can consume only vertex notation, never the next claim.
        try { labelList(symbols(next.text).replace(/(?:→|-)\s*$/u, ''), vocab.vertexLabels); }
        catch (error) { if (error instanceof LabelError) break; throw error; }
      }
      sources.push(next); i++;
    }
    const text = sources.map((l) => l.text).join(' ');
    const prefix = itemPrefix(text, vocab);
    if (prefix?.ambiguous) {
      parsed.unchecked.push(...sources.map((source) => source.index)); issue('ambiguous_line', sources); issue('unparsed_line', sources);
      continue;
    }
    const item = itemJudgment(prefix?.text ?? text, prefix?.statementId);
    const parseText = item.remainder;
    const normalized = language(parseText, vocab.vertexLabels);
    if (isHeading(normalized)) {
      context.kind = walkKind(normalized, vocab);
      if (readingConfidence(line) < threshold) { parsed.unchecked.push(line.index); issue('unparsed_line', [line]); }
      else parsed.ignored.push({ line: line.index, reason: 'prose' });
      continue;
    }
    try {
      const bodies: { body: ClaimBody; clause: string }[] = item.body ? [{ body: item.body, clause: prefix?.text ?? text }] : [];
      let incomplete = false;
      // Keep algorithm explanations and equalities together; their numbers are literal.
      const algorithm = /\b(?:chon|danh dau|co dinh|khoanh|nhan(?! (?:thay|xet|duoc|ra|so|tong|do|bac|cac)\b)|gan nhan|lap lai|canh lap|them canh|gan nhat|nho nhat)\b/u.test(normalized) && !/duong di ngan nhat/u.test(normalized)
        || /\b(?:n|l)\s*\(/u.test(normalized);
      // Keep a single algorithm sentence atomic, but do not let an action in a
      // later sentence suppress an independently complete preceding claim.
      const clauses = algorithm ? parseText.split(/(?<=[.])\s+/u).filter(Boolean) : splitClauses(parseText, vocab);
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
        } else if (!item.body && gradingContent(clause, vocab)) incomplete = true;
      }
      if (incomplete) {
        parsed.unchecked.push(...sources.map((s) => s.index)); issue('unparsed_line', sources);
      } else if (bodies.length) {
        // A line is atomic for grading. Keeping a recognized fragment when a
        // sibling fragment is unknown can make core grade it without context.
        const priorSelection = parsed.steps.some((step) => step.claim.type === 'dijkstra_select');
        const initialized = [...parsed.steps.map((step) => step.claim), ...bodies.map(({ body }) => body)]
          .find((body): body is Extract<typeof body, { type: 'dijkstra_init' }> => body.type === 'dijkstra_init');
        const firstLabel = bodies.findIndex(({ body }) => body.type === 'dijkstra_label');
        const implicit = vocab.task === 'shortest_path' && !priorSelection && initialized !== undefined && firstLabel >= 0
          ? { body: { type: 'dijkstra_select' as const, v: initialized.source, implicit: true }, clause: text } : undefined;
        for (let index = 0; index < bodies.length; index++) {
          if (index === firstLabel && implicit) append(implicit.body, sources, 'text', clauseEvidence(sources, implicit.clause, implicit.body));
          const { body, clause } = bodies[index]!;
          append(body, sources, 'text', clauseEvidence(sources, clause, body));
        }
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
