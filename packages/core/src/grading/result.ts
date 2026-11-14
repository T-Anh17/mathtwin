import type { ErrorCode } from '../types.js';

export type CheckResult =
  | { status: 'pass'; facts: Record<string, unknown> }
  | { status: 'fail'; errorCode: ErrorCode; facts: Record<string, unknown> }
  | { status: 'skip'; facts: Record<string, unknown> }
  | { status: 'confirm'; item: string; facts: Record<string, unknown> };

export const pass = (facts: Record<string, unknown> = {}): CheckResult => ({ status: 'pass', facts });
export const fail = (errorCode: ErrorCode, facts: Record<string, unknown> = {}): CheckResult => ({ status: 'fail', errorCode, facts });
export const skip = (reason: string): CheckResult => ({ status: 'skip', facts: { reason } });
export function compare(expected: unknown, got: unknown, errorCode: ErrorCode = 'SAI_PHEP_TINH'): CheckResult {
  return equal(expected, got) ? pass({ expected, got }) : fail(errorCode, { expected, got });
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** JSON structural equality, independent of object key order. */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
