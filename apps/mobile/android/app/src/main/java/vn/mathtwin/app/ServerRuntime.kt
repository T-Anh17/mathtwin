package vn.mathtwin.app

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

internal class ServerRuntime(private val context: Context, private val store: ModelStore) {
    private val generation = AtomicLong(0)
    private val lock = Any()
    @Volatile private var process: Process? = null
    @Volatile private var pid: Long? = null
    @Volatile private var session: JSONObject? = null
    @Volatile private var configuration = ""
    @Volatile private var highWaterKb: Long? = null
    @Volatile private var rssKb: Long? = null
    @Volatile private var cpuVariant: String? = null
    private val cpuBackendLine = Regex("^load_backend: loaded CPU backend from [^\\r\\n]+/libggml-cpu-(android_armv(?:8\\.0_1|8\\.2_[12]|8\\.6_1|9\\.0_1|9\\.2_[12]))\\.so$")

    fun status(): JSONObject = synchronized(lock) {
        if (process?.isAlive == true) sample()
        JSONObject().put("alive", process?.isAlive == true).also { result ->
            highWaterKb?.let { result.put("peakMemoryMb", it / 1024.0) }
            rssKb?.let { result.put("rssMemoryMb", it / 1024.0) }
            cpuVariant?.let { result.put("cpuVariant", it) }
            process?.takeIf { !it.isAlive }?.let { result.put("exitCode", it.exitValue()) }
        }
    }
    private fun sample() {
        val childPid = pid ?: return
        try {
            File("/proc/$childPid/status").useLines { lines ->
                lines.forEach { line ->
                    if (line.startsWith("VmHWM:")) {
                        val n = Regex("\\d+").find(line)?.value?.toLong() ?: return@forEach
                        highWaterKb = maxOf(highWaterKb ?: 0, n)
                    }
                    if (line.startsWith("VmRSS:")) rssKb = Regex("\\d+").find(line)?.value?.toLong()
                }
            }
        } catch (_: Exception) { /* Unavailable means absent, never fabricated as zero. */ }
    }
    fun stop() {
        generation.incrementAndGet()
        val old = synchronized(lock) { process.also { process = null; session = null; pid = null; configuration = "" } }
        old?.let { it.destroy(); if (!it.waitFor(500, TimeUnit.MILLISECONDS)) { it.destroyForcibly(); it.waitFor(500, TimeUnit.MILLISECONDS) } }
    }
    fun start(model: String, threads: Int, cancelled: () -> Boolean): JSONObject {
        if (cancelled()) throw MobileFailure("aborted")
        val wanted = "$model:$threads"
        synchronized(lock) {
            if (process?.isAlive == true && configuration == wanted && session != null)
                return JSONObject(session.toString()).put("reused", true).put("loadMs", 0).put("verifyMs", 0)
        }
        stop()
        val token = generation.get()
        val verifyBegan = SystemClock.elapsedRealtime()
        val files = store.verifiedFiles(model)
        val verifyMs = SystemClock.elapsedRealtime() - verifyBegan
        val began = SystemClock.elapsedRealtime()
        if (generation.get() != token || cancelled()) throw MobileFailure("aborted")
        val executable = File(context.applicationInfo.nativeLibraryDir, "libllama_server.so")
        if (!executable.isFile || !executable.canExecute()) throw MobileFailure("exec_blocked")
        val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
        val key = ByteArray(32).apply { SecureRandom().nextBytes(this) }.joinToString("") { "%02x".format(it) }
        val args = listOf(executable.absolutePath, "--model", files[0].absolutePath, "--mmproj", files[1].absolutePath,
            "--host", "127.0.0.1", "--port", port.toString(), "--api-key", key, "--threads", threads.toString(),
            "--gpu-layers", "0", "--no-mmproj-offload", "--ctx-size", "8192", "--parallel", "1", "--offline", "--no-webui", "--no-warmup",
            // common_init enables prefixes/timestamps and maps GGML INFO to trace (4) in this pinned revision.
            "--log-colors", "off", "--no-log-prefix", "--no-log-timestamps", "--verbosity", "4")
        // Process.pid() is not available on our Android baseline. A fixed shell writes its PID then execs,
        // preserving that PID. No reflection/hidden API, no user-provided shell program.
        val pidFile = File.createTempFile("server-", ".pid", context.cacheDir)
        val child: Process
        try {
            val builder = ProcessBuilder(listOf("/system/bin/sh", "-c", "echo $$ > \"$1\"; shift; exec \"$@\"", "mathtwin", pidFile.absolutePath) + args)
                .directory(File(context.applicationInfo.nativeLibraryDir)).redirectErrorStream(true)
            builder.environment()["LD_LIBRARY_PATH"] = context.applicationInfo.nativeLibraryDir
            // ggml scans the executable directory and cwd for scored CPU modules, never a preselected backend.
            builder.environment().remove("GGML_BACKEND_PATH")
            child = builder.start()
        } catch (_: Exception) { pidFile.delete(); throw MobileFailure("exec_blocked") }
        synchronized(lock) {
            if (generation.get() != token || cancelled()) { child.destroyForcibly(); pidFile.delete(); throw MobileFailure("aborted") }
            process = child; highWaterKb = null; rssKb = null; cpuVariant = null; configuration = wanted
        }
        // Drain output without retaining logs. Only the exact upstream backend-loaded line may yield metadata.
        // Bounded line storage also prevents arbitrary prompt/image content in a long log line consuming RAM.
        Thread({
            try {
                child.inputStream.use { input ->
                    val line = StringBuilder(); val buffer = ByteArray(4096); var overflow = false
                    while (true) {
                        val count = input.read(buffer); if (count < 0) break
                        for (i in 0 until count) {
                            val c = (buffer[i].toInt() and 255).toChar()
                            if (c == '\n') {
                                if (!overflow) cpuBackendLine.matchEntire(line.toString().trimEnd('\r'))?.let { match ->
                                    synchronized(lock) { if (generation.get() == token && cpuVariant == null) cpuVariant = match.groupValues[1] }
                                }
                                line.setLength(0); overflow = false
                            } else if (!overflow && line.length < 1024) line.append(c)
                            else { overflow = true; line.setLength(0) }
                        }
                    }
                }
            } catch (_: Exception) { /* No raw server log is persisted, forwarded or printed. */ }
        }, "mathtwin-backend-name").apply { isDaemon = true; start() }
        try {
            val pidDeadline = SystemClock.elapsedRealtime() + 2000
            while (pid == null && child.isAlive && SystemClock.elapsedRealtime() < pidDeadline) {
                pid = pidFile.readText().trim().toLongOrNull(); if (pid == null) Thread.sleep(10)
            }
            pidFile.delete()
            Thread({
                while (child.isAlive && generation.get() == token) {
                    synchronized(lock) { sample() }; Thread.sleep(100)
                }
            }, "mathtwin-server-memory").apply { isDaemon = true; start() }
            val deadline = SystemClock.elapsedRealtime() + 180000
            while (true) {
                if (generation.get() != token || cancelled()) throw MobileFailure("aborted")
                if (!child.isAlive) throw MobileFailure(when (child.exitValue()) {
                    126, 127 -> "exec_blocked"; 137, 9 -> "server_killed"; else -> "server_exit"
                })
                if (SystemClock.elapsedRealtime() > deadline) throw MobileFailure("timeout")
                val conn = URL("http://127.0.0.1:$port/health").openConnection() as HttpURLConnection
                val ready = try {
                    conn.connectTimeout = 1000; conn.readTimeout = 1000; conn.instanceFollowRedirects = false
                    conn.setRequestProperty("Authorization", "Bearer $key"); conn.responseCode == 200
                } catch (_: Exception) { false } finally { conn.disconnect() }
                if (ready) break
                Thread.sleep(100)
            }
            val backendDeadline = SystemClock.elapsedRealtime() + 2000
            while (cpuVariant == null && child.isAlive && generation.get() == token && SystemClock.elapsedRealtime() < backendDeadline) Thread.sleep(10)
            if (cpuVariant == null) throw MobileFailure("cpu_backend_unknown")
            return synchronized(lock) {
                if (generation.get() != token || !child.isAlive) throw MobileFailure("server_exit")
                JSONObject().put("port", port).put("apiKey", key).put("reused", false)
                    .put("loadMs", SystemClock.elapsedRealtime() - began).put("verifyMs", verifyMs).also { session = it }
            }
        } catch (e: Exception) { stop(); throw e }
        finally { pidFile.delete() }
    }
}
