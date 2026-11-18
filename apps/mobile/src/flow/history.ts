import type { HistoryItem, Verdict } from '../product-types.js';
import type { SessionSummary } from './store.js';
import { sessionVi as m } from './messages.vi.js';

export function historyItem(s: SessionSummary): HistoryItem {
  const verdicts = { DUNG: 'dung', SAI: 'sai', CAN_XAC_NHAN: 'can_xac_nhan', KHONG_DU_CAN_CU: 'khong_du_can_cu' } satisfies Record<NonNullable<SessionSummary['verdict']>, Verdict>;
  const status = s.verdict ? m.verdicts[s.verdict] : m.stages[s.stage];
  return { id: s.id, title: `${s.task ? m.tasks[s.task] : m.untitled} · ${status}`,
    verdict: s.verdict ? verdicts[s.verdict] : 'can_xac_nhan', status,
    meta: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.createdAt)) };
}
