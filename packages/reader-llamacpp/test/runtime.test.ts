import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));
import { nodeRuntime } from '../src/runtime.js';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function nativeChild() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn((_signal?: string) => true) });
  spawnMock.mockReturnValue(child);
  return child;
}

it('launches the direct child without a shell, visible window or content logs and waits for close', async () => {
  const child = nativeChild();
  const process = nodeRuntime.start('D:/fixture/llama-server.exe', ['--host', '127.0.0.1']);
  expect(spawnMock).toHaveBeenCalledWith('D:/fixture/llama-server.exe', ['--host', '127.0.0.1'],
    { shell: false, windowsHide: true, stdio: 'ignore' });
  const stopped = process.stop();
  expect(child.kill).toHaveBeenCalledOnce();
  child.emit('close', 0);
  await stopped; await process.exited;
  await process.stop(); expect(child.kill).toHaveBeenCalledOnce();
});

it('escalates to SIGKILL when a direct child ignores graceful termination', async () => {
  vi.useFakeTimers(); const child = nativeChild();
  child.kill.mockImplementation((signal) => { if (signal === 'SIGKILL') child.emit('close'); return true; });
  const process = nodeRuntime.start('fixture.exe', []);
  const stopped = process.stop();
  await vi.advanceTimersByTimeAsync(2000);
  await stopped;
  expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  expect(vi.getTimerCount()).toBe(0);
});

it('reports spawn failure through the exit promise without killing a nonexistent child', async () => {
  const child = nativeChild(); const process = nodeRuntime.start('fixture.exe', []);
  child.emit('error', new Error('ENOENT'));
  await process.exited; await process.stop();
  expect(child.kill).not.toHaveBeenCalled();
});
