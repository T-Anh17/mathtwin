import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// node tools/eval/run-bounded.mjs SECONDS LOG EXECUTABLE [ARG ...]
const [seconds, path, command, ...args] = process.argv.slice(2);
if (!path || !command || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) {
  throw new Error('Expected positive seconds, log path, executable and optional arguments.');
}
await mkdir(dirname(path), { recursive: true });
const log = createWriteStream(path, { flags: 'a' }), started = Date.now();
log.write(`START ${new Date().toISOString()} ${JSON.stringify([command, ...args])}\n`);
try {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let expired = false;
  const timer = setTimeout(() => {
    expired = true; log.write('TIMEOUT: terminating process tree\n');
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      killer.on('error', (error) => log.write(`Termination error: ${error.message}\n`));
    } else child.kill('SIGKILL');
  }, Number(seconds) * 1000);
  child.on('error', (error) => log.write(`${error.message}\n`));
  child.on('close', (code) => {
    clearTimeout(timer);
    const result = `END code=${code} timeout=${expired} seconds=${(Date.now() - started) / 1000}`;
    log.end(result + '\n'); console.log(result); process.exitCode = expired ? 124 : code ?? 1;
  });
} catch (error) {
  log.end(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1;
}
