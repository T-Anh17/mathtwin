import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apk = fileURLToPath(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url));
await access(apk);
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk');
const p = spawn(join(sdk, 'platform-tools/adb.exe'), ['install', '-r', apk], { stdio: 'inherit', windowsHide: true });
p.on('error', (e) => { console.error(e.message); process.exitCode = 1; });
p.on('exit', (code) => { process.exitCode = code ?? 1; });
