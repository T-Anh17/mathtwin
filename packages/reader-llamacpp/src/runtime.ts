import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';

export interface ServerProcess {
  readonly exited: Promise<void>;
  stop(): Promise<void>;
}
/** Injectable OS/HTTP boundary for tests; the default never contacts a non-loopback URL. */
export interface LlamaRuntime {
  checkFiles(paths: string[]): Promise<void>;
  freePort(): Promise<number>;
  start(executable: string, args: string[]): ServerProcess;
  fetch: typeof fetch;
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
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: 'ignore' });
    let closed = false;
    const exited = new Promise<void>((resolve) => {
      child.once('error', () => { closed = true; resolve(); });
      child.once('close', () => { closed = true; resolve(); });
    });
    return { exited, async stop() {
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
  fetch: (input, init) => fetch(input, init),
};
