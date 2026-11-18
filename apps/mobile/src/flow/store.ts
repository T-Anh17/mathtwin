import type { GradeResult, Task } from '@mathtwin/core';
import type { PhotoRef, Session, Stage } from './types.js';

export interface SessionSummary {
  id: string; createdAt: string; stage: Stage; task?: Task['type']; verdict?: GradeResult['verdict'];
}
export interface SessionStore {
  list(): Promise<SessionSummary[]>; get(id: string): Promise<Session | null>;
  put(s: Session): Promise<void>; remove(id: string): Promise<void>;
}
export interface PhotoStore {
  put(blob: Blob, meta: Omit<PhotoRef, 'id'>): Promise<PhotoRef>;
  url(id: string): Promise<string>; remove(id: string): Promise<void>;
}
export function summarize(s: Session): SessionSummary {
  return { id: s.id, createdAt: s.createdAt, stage: s.stage, ...(s.spec ? { task: s.spec.task.type } : {}),
    ...(s.workGrade ? { verdict: s.workGrade.result.verdict } : {}) };
}
export function newestFirst(a: SessionSummary, b: SessionSummary): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}
export function photoIds(s: Session): string[] { return [...new Set([...s.problemPhotos, ...s.workPhotos].map((p) => p.id))]; }
