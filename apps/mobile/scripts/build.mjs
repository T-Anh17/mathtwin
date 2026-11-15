import { spawn } from 'node:child_process';
import { readFile, mkdir, copyFile, access, writeFile, open, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const mobile = join(root, 'apps/mobile');
const cache = join(root, '.build-cache');
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk');
const java = process.env.JAVA_HOME ?? 'C:/Program Files/Android/Android Studio/jbr';
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_USER_HOME: join(cache, 'android'),
  GRADLE_USER_HOME: join(cache, 'gradle'), npm_config_cache: join(cache, 'npm'),
  PATH: `${join(java, 'bin')};${process.env.PATH ?? ''}` };
async function run(command, args, cwd = root, capture = false, verbatim = false) {
  // A file descriptor also works in Windows environments that prohibit anonymous child-process pipes.
  const capturePath = join(cache, `capture-${process.pid}.txt`);
  const output = capture ? await open(capturePath, 'w') : undefined;
  try {
    await new Promise((accept, reject) => {
      const p = spawn(command, args, { cwd, env, windowsHide: true, windowsVerbatimArguments: verbatim, stdio: output ? ['ignore', output.fd, 'inherit'] : 'inherit' });
      p.on('error', reject); p.on('exit', (code) => code === 0 ? accept() : reject(new Error(`${command} exited ${code}`)));
    });
    return capture ? (await readFile(capturePath, 'utf8')).trim() : '';
  } finally { await output?.close(); if (capture) await rm(capturePath, { force: true }); }
}
const npm = (args, cwd = root) => run(process.execPath, [join(process.env.ProgramFiles ?? 'C:/Program Files', 'nodejs/node_modules/npm/bin/npm-cli.js'), ...args], cwd);
try {
  await mkdir(cache, { recursive: true });
  await access(join(sdk, 'ndk/27.1.12297006/build/cmake/android.toolchain.cmake'));
  await access(join(java, 'bin/java.exe'));
  if (!/JAVA_VERSION="21\./.test(await readFile(join(java, 'release'), 'utf8'))) throw new Error('Set JAVA_HOME to JDK 21 (Android Studio/jbr).');
  const manifest = JSON.parse(await readFile(join(root, 'tools/models/manifest.json'), 'utf8'));
  const pin = manifest.llamaCppSource;
  if (pin.url !== 'https://github.com/ggml-org/llama.cpp.git' || !/^b[0-9]+$/.test(pin.revision) || !/^[a-f0-9]{40}$/.test(pin.commit)) throw new Error('Invalid source pin.');
  const source = join(cache, 'llama.cpp');
  try { await access(join(source, '.git')); }
  catch {
    await run('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--branch', pin.revision, pin.url, source]);
    await run('git', ['sparse-checkout', 'set', '--no-cone', '/*', '!/models/', '!/tests/'], source);
    await run('git', ['checkout', '--detach', pin.commit], source);
  }
  const commit = await run('git', ['rev-parse', 'HEAD'], source, true);
  const tag = await run('git', ['rev-parse', `${pin.revision}^{commit}`], source, true);
  if (commit !== pin.commit || tag !== pin.commit) throw new Error('llama.cpp tag/commit mismatch.');
  if (await run('git', ['status', '--porcelain', '--untracked-files=no'], source, true)) throw new Error('llama.cpp source is modified.');
  const cmake = join(sdk, 'cmake/3.22.1/bin/cmake.exe');
  const nativeBuild = join(cache, 'llama-android');
  await run(cmake, ['-S', source, '-B', nativeBuild, '-G', 'Ninja',
    `-DCMAKE_MAKE_PROGRAM=${join(sdk, 'cmake/3.22.1/bin/ninja.exe')}`,
    `-DCMAKE_TOOLCHAIN_FILE=${join(sdk, 'ndk/27.1.12297006/build/cmake/android.toolchain.cmake')}`,
    '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-26', '-DANDROID_STL=c++_shared', '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON', '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=ON', '-DGGML_BACKEND_DL=ON', '-DGGML_CPU_ALL_VARIANTS=ON', '-DGGML_CPU_ARM_ARCH=',
    '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF', '-DGGML_LLAMAFILE=OFF',
    '-DGGML_VULKAN=OFF', '-DGGML_OPENCL=OFF', '-DGGML_CUDA=OFF', '-DGGML_CPU_KLEIDIAI=OFF',
    '-DLLAMA_OPENSSL=OFF', '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_SERVER=ON',
    '-DLLAMA_BUILD_UI=OFF', '-DLLAMA_USE_PREBUILT_UI=OFF', '-DLLAMA_CONNECT=OFF']);
  if (process.env.MOBILE_BUILD_NO_PIPES === '1') {
    // Ninja's child-output pipes can be prohibited in a managed Windows sandbox. Execute the same
    // generated dependency-ordered commands with inherited handles, batching only compile commands.
    const commands = (await run(join(sdk, 'cmake/3.22.1/bin/ninja.exe'), ['-C', nativeBuild, '-t', 'commands', 'llama-server'], root, true)).split(/\r?\n/).filter(Boolean);
    const jobs = Math.max(1, Number(process.env.MOBILE_BUILD_JOBS ?? '6'));
    let pending = [];
    const execute = (command) => run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], nativeBuild, false, true);
    const flush = async () => { await Promise.all(pending); pending = []; };
    for (const [i, command] of commands.entries()) {
      console.log(`[${i + 1}/${commands.length}] ${/ -c /.test(command) ? 'Compiling' : 'Linking / generating'}`);
      if (!/ -c /.test(command)) { await flush(); await execute(command); }
      else { pending.push(execute(command)); if (pending.length >= jobs) await flush(); }
    }
    await flush();
  } else await run(cmake, ['--build', nativeBuild, '--target', 'llama-server', '--parallel', process.env.MOBILE_BUILD_JOBS ?? '6']);
  const jni = join(mobile, 'android/app/src/main/jniLibs/arm64-v8a'); await mkdir(jni, { recursive: true });
  // Remove only generated ELF files in this exact ABI directory so stale backends cannot be shipped.
  for (const name of await readdir(jni)) if (/^lib[\w.-]+\.so$/.test(name)) await rm(join(jni, name));
  await copyFile(join(nativeBuild, 'bin/llama-server'), join(jni, 'libllama_server.so'));
  for (const name of await readdir(join(nativeBuild, 'bin'))) if (/^lib[\w.-]+\.so$/.test(name))
    await copyFile(join(nativeBuild, 'bin', name), join(jni, name));
  await copyFile(join(sdk, 'ndk/27.1.12297006/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so'), join(jni, 'libc++_shared.so'));
  for (const name of await readdir(jni)) if (name.endsWith('.so'))
    await run(join(sdk, 'ndk/27.1.12297006/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-strip.exe'), ['--strip-debug', join(jni, name)]);
  const assets = join(mobile, 'android/app/src/main/assets'); await mkdir(assets, { recursive: true });
  await copyFile(join(root, 'tools/models/manifest.json'), join(assets, 'model-manifest.json'));
  await copyFile(join(source, 'LICENSE'), join(assets, 'llama-LICENSE.txt'));
  await npm(['run', 'build', '--workspace', '@mathtwin/mobile']);
  await npm(['exec', '--workspace', '@mathtwin/mobile', '--', 'cap', 'sync', 'android']);
  await writeFile(join(mobile, 'android/local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/').replace(':', '\\:')}\n`);
  await run(join(java, 'bin/java.exe'), ['-Dorg.gradle.appname=gradlew', '-classpath', join(mobile, 'android/gradle/wrapper/gradle-wrapper.jar'),
    'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug', '--no-daemon', '--max-workers=4',
    '-Pandroid.aapt2FromMavenOverride=' + join(sdk, 'build-tools/36.0.0/aapt2.exe')], join(mobile, 'android'));
  console.log(`APK debug: ${resolve(mobile, 'android/app/build/outputs/apk/debug/app-debug.apk')}`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Build failed.'); process.exitCode = 1; }
