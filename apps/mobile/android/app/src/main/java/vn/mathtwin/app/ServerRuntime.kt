package vn.mathtwin.app

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject
import java.io.File
import java.io.IOException
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
    private var cpuVariantSource: String? = null
    private var logCpuVariant: String? = null
    private var backendConflict = false
    private var memoryPressure: JSONObject? = null
    fun authorizeRequest(url: String, authorization: String?, path: String) = synchronized(lock) {
        val current = session ?: throw MobileFailure("http_error")
        if (process?.isAlive != true || url != "http://127.0.0.1:${current.getInt("port")}$path" ||
            authorization != "Bearer ${current.getString("apiKey")}") throw MobileFailure("http_error")
    }
    private val cpuBackendLine = Regex("^load_backend: loaded CPU backend from [^\\r\\n]+/libggml-cpu-(android_armv(?:8\\.0_1|8\\.2_[12]|8\\.6_1|9\\.0_1|9\\.2_[12]))\\.so$")
    private val cpuBackendFile = Regex("^libggml-cpu-(android_armv(?:8\\.0_1|8\\.2_[12]|8\\.6_1|9\\.0_1|9\\.2_[12]))\\.so$")

    // A library normally has several mappings (code/data/etc.). Count distinct allowed files,
    // and accept only direct children of the APK's nativeLibraryDir, never a matching basename elsewhere.
    private fun mappedCpuVariants(): Set<String>? {
        val childPid = pid ?: return null
        val directory = File(context.applicationInfo.nativeLibraryDir).absoluteFile
        return try {
            File("/proc/$childPid/maps").useLines { lines ->
                lines.mapNotNull { line ->
                    val path = line.trim().split(Regex("\\s+"), limit = 6).getOrNull(5) ?: return@mapNotNull null
                    val library = File(path)
                    if (library.parentFile != directory) null else cpuBackendFile.matchEntire(library.name)?.groupValues?.get(1)
                }.toSet()
            }
        } catch (_: IOException) { null }
        catch (_: SecurityException) { null }
    }
    private fun recordBackendLine(line: String, token: Long) {
        val variant = cpuBackendLine.matchEntire(line.trimEnd('\r'))?.groupValues?.get(1) ?: return
        synchronized(lock) {
            if (generation.get() != token) return
            if ((logCpuVariant != null && logCpuVariant != variant) || (cpuVariant != null && cpuVariant != variant)) backendConflict = true
            logCpuVariant = variant
        }
    }
    private fun identifyCpuBackend(child: Process, token: Long) {
        val mapped = mappedCpuVariants()
        // A readable maps file with zero or multiple variants is ambiguous even if a log matched.
        if (mapped != null && mapped.size != 1) throw MobileFailure("cpu_backend_unknown")
        if (mapped == null) {
            val deadline = SystemClock.elapsedRealtime() + 2000
            while (synchronized(lock) { logCpuVariant == null && !backendConflict } && child.isAlive &&
                generation.get() == token && SystemClock.elapsedRealtime() < deadline) Thread.sleep(10)
        }
        synchronized(lock) {
            if (generation.get() != token || !child.isAlive) throw MobileFailure("server_exit")
            val variant = mapped?.single() ?: logCpuVariant ?: throw MobileFailure("cpu_backend_unknown")
            if (backendConflict || (logCpuVariant != null && logCpuVariant != variant)) throw MobileFailure("cpu_backend_unknown")
            cpuVariant = variant; cpuVariantSource = if (mapped != null) "maps" else "log"
        }
    }

    fun status(): JSONObject = synchronized(lock) {
        if (process?.isAlive == true) sample()
        JSONObject().put("alive", process?.isAlive == true).also { result ->
            if (process?.isAlive == true) result.put("model", configuration.substringBefore(":"))
            highWaterKb?.let { result.put("peakMemoryMb", it / 1024.0) }
            rssKb?.let { result.put("rssMemoryMb", it / 1024.0) }
            if (backendConflict) result.put("errorCode", "cpu_backend_unknown")
            else {
                cpuVariant?.let { result.put("cpuVariant", it) }
                cpuVariantSource?.let { result.put("cpuVariantSource", it) }
            }
            memoryPressure?.let { result.put("memoryPressure", JSONObject(it.toString())) }
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
    fun recordMemoryPressure(callback: String, trimLevel: Int?, cancelStart: () -> Unit) = synchronized(lock) {
        memoryPressure = JSONObject().put("callback", callback).put("trimLevel", trimLevel ?: JSONObject.NULL)
        generation.incrementAndGet()
        // A concurrent start cannot clear the marker between publishing it and cancelling its token.
        cancelStart()
    }
    fun stop() {
        // Keep the cause and measured metadata until an explicit new start, including repeated cleanup stops.
        val old = synchronized(lock) { generation.incrementAndGet(); process.also { process = null; session = null; pid = null; configuration = "" } }
        old?.let { it.destroy(); if (!it.waitFor(500, TimeUnit.MILLISECONDS)) { it.destroyForcibly(); it.waitFor(500, TimeUnit.MILLISECONDS) } }
    }
    fun start(model: String, threads: Int, cancelled: () -> Boolean): JSONObject {
        if (cancelled()) throw MobileFailure("aborted")
        val wanted = "$model:$threads"
        synchronized(lock) {
            if (backendConflict && process != null) throw MobileFailure("cpu_backend_unknown")
            if (!backendConflict && memoryPressure == null && process?.isAlive == true && configuration == wanted && session != null)
                return JSONObject(session.toString()).put("reused", true).put("loadMs", 0).put("verifyMs", 0)
        }
        stop()
        val token = synchronized(lock) {
            if (cancelled()) throw MobileFailure(if (memoryPressure != null) "memory_pressure" else "aborted")
            memoryPressure = null; highWaterKb = null; rssKb = null; cpuVariant = null
            cpuVariantSource = null; logCpuVariant = null; backendConflict = false
            generation.get()
        }
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
        // Drain through EOF, including after cancellation. A parser failure must never close the pipe:
        // the old outer catch ended the reader on any line-processing exception, risking a full pipe.
        Thread({
            child.inputStream.use { input ->
                val line = ByteArray(1024); val buffer = ByteArray(4096); var length = 0; var overflow = false
                fun finishLine() {
                    try {
                        if (!overflow && length > 0) recordBackendLine(String(line, 0, length, Charsets.UTF_8), token)
                    } catch (_: Exception) { /* Discard this line; keep draining the process output. */ }
                    catch (_: LinkageError) { /* Android/JDK API linkage must not disable pipe draining either. */ }
                    finally { length = 0; overflow = false }
                }
                while (true) {
                    try {
                        val count = input.read(buffer)
                        if (count < 0) { finishLine(); break }
                        for (i in 0 until count) {
                            if (buffer[i] == '\n'.code.toByte()) finishLine()
                            else if (!overflow && length < line.size) line[length++] = buffer[i]
                            else { overflow = true; length = 0 }
                        }
                    } catch (_: IOException) {
                        // Retry transient reads while the child can still write. Keep memory bounded;
                        // no log contents or exceptions are persisted, forwarded or printed.
                        length = 0; overflow = true
                        if (!child.isAlive) break
                        Thread.sleep(10)
                    }
                }
            }
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
            identifyCpuBackend(child, token)
            return synchronized(lock) {
                if (generation.get() != token || !child.isAlive) throw MobileFailure("server_exit")
                if (backendConflict) throw MobileFailure("cpu_backend_unknown")
                JSONObject().put("port", port).put("apiKey", key).put("reused", false)
                    .put("loadMs", SystemClock.elapsedRealtime() - began).put("verifyMs", verifyMs).also { session = it }
            }
        } catch (e: Exception) {
            val failure = synchronized(lock) { if (memoryPressure != null) MobileFailure("memory_pressure") else e }
            stop(); throw failure
        }
        finally { pidFile.delete() }
    }
}
