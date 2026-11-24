import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';

export interface ServerProcess {
  readonly exited: Promise<void>;
  onStderr?(listener: (chunk: string) => void): () => void;
  stop(): Promise<void>;
}
/** Injectable OS/HTTP boundary for tests; the default never contacts a non-loopback URL. */
export interface LlamaRuntime {
  checkFiles(paths: string[]): Promise<void>;
  freePort(): Promise<number>;
  start(executable: string, args: string[]): ServerProcess;
  fetch: typeof fetch;
}

/**
 * Node's built-in fetch uses Undici's fixed 300 s headers timeout. A model
 * can legitimately take longer before its one JSON response, so the caller's
 * AbortSignal is the only read deadline for the locally-owned server.
 */
function localHttpFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const source = input instanceof Request ? input : undefined;
  const url = new URL(source?.url ?? String(input));
  if (url.protocol !== 'http:') return Promise.reject(new Error('Only HTTP llama-server URLs are supported.'));
  const signal = init?.signal ?? source?.signal;
  const headers = new Headers(source?.headers);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  const method = init?.method ?? source?.method ?? 'GET', body = init?.body;
  if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof Uint8Array)) return Promise.reject(new Error('Unsupported local HTTP request body.'));
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => { if (!settled) { settled = true; signal?.removeEventListener('abort', abort); action(); } };
    const abort = () => { request.destroy(); settle(() => reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'))); };
    const request = httpRequest(url, { method, headers: Object.fromEntries(headers), agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.once('error', (error) => settle(() => reject(error)));
      response.once('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
        settle(() => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 500, headers: responseHeaders })));
      });
    });
    request.once('error', (error) => settle(() => reject(error)));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    request.end(body ?? undefined);
  });
}
export const nodeRuntime: LlamaRuntime = {
  async checkFiles(paths) { await Promise.all(paths.map((path) => access(path))); },
  freePort: () => new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (address && typeof address !== 'string') resolve(address.port);
        else reject(new Error('No loopback port.'));
      });
    });
  }),
  start(executable, args) {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const stderrListeners = new Set<(chunk: string) => void>();
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => { for (const listener of stderrListeners) listener(chunk); });
    let closed = false;
    const exited = new Promise<void>((resolve) => {
      child.once('error', () => { closed = true; resolve(); });
      child.once('close', () => { closed = true; resolve(); });
    });
    return { exited, onStderr(listener) { stderrListeners.add(listener); return () => stderrListeners.delete(listener); }, async stop() {
      if (closed) return;
      child.kill();
      // Windows terminates the direct child; POSIX gets a bounded graceful shutdown then SIGKILL.
      const killTimer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 2000);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([exited, new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Server shutdown timed out.')), 6000);
        })]);
      } finally { clearTimeout(killTimer); clearTimeout(deadline); }
    } };
  },
  fetch: localHttpFetch,
};
