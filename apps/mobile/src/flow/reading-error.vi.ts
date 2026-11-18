import { settingsVi as m } from '../settings.vi.js';

/** Only known error categories reach the student; never print adapter diagnostics or ids. */
export function readingError(error: unknown): string {
  const e = typeof error === 'object' && error !== null ? error as { code?: unknown; reason?: unknown; name?: unknown } : {};
  const code = typeof e.code === 'string' ? e.code : e.reason;
  if (e.name === 'AbortError' || code === 'aborted') return m.cancelled;
  if (error instanceof RangeError || e.name === 'OutOfMemoryError' || ['memory_pressure', 'server_killed', 'low_ram', 'out_of_memory', 'no_space'].includes(String(code))) return m.failures.memory;
  if (code === 'timeout' || e.name === 'TimeoutError') return m.failures.timeout;
  if (['server_exit', 'server_start', 'server_start_failed', 'exec_blocked', 'http_error', 'native_error', 'cpu_backend_unknown'].includes(String(code))) return m.failures.server;
  if (code === 'image_invalid' || e.name === 'EncodingError') return m.failures.image;
  return m.failures.other;
}
