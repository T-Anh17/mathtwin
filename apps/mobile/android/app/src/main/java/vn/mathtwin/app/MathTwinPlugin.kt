package vn.mathtwin.app

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.view.WindowManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

private class DatasetFailure(
    val reason: String, val id: String? = null, val file: String? = null, val operation: String? = null,
) : Exception("dataset_invalid") {
    fun data() = JSObject().apply {
        put("reason", reason)
        id?.let { put("id", it) }
        file?.let { put("file", it) }
        operation?.let { put("operation", it) }
    }
}

@CapacitorPlugin(name = "MathTwin")
class MathTwinPlugin : Plugin() {
    private lateinit var store: ModelStore
    private lateinit var server: ServerRuntime
    private lateinit var lifecycle: BenchmarkLifecycle
    private val worker = Executors.newSingleThreadExecutor()
    private val controls = Executors.newSingleThreadExecutor()
    // HTTP must not block start/dataset work or the cancel/stop control executor.
    private val httpWorker = Executors.newCachedThreadPool()
    private class PendingRequest {
        val cancelled = AtomicBoolean(false)
        private var connection: HttpURLConnection? = null
        // Cancel may arrive before a socket exists. Open the output stream under this lock so a
        // pre-connect disconnect cannot be followed by a new implicit connection on outputStream.
        @Synchronized fun output(conn: HttpURLConnection): OutputStream {
            if (cancelled.get()) { conn.disconnect(); throw MobileFailure("aborted") }
            connection = conn
            val output = conn.outputStream
            if (cancelled.get()) { conn.disconnect(); throw MobileFailure("aborted") }
            return output
        }
        fun cancel() { cancelled.set(true); synchronized(this) { connection?.disconnect() } }
        @Synchronized fun close() { connection?.disconnect(); connection = null }
    }
    private val requests = ConcurrentHashMap<String, PendingRequest>()
    private val busy = AtomicBoolean(false)
    private val cancellation = AtomicLong(0)
    @Volatile private var appPressure: JSONObject? = null
    override fun load() {
        store = ModelStore(context); server = ServerRuntime(context, store)
        lifecycle = BenchmarkLifecycle(activity, { requestStop() }, { callback, level ->
            appPressure = JSONObject().put("callback", callback).put("trimLevel", level ?: JSONObject.NULL)
            // Publish the cause before cancellation or asynchronous process teardown can be observed.
            server.recordMemoryPressure(callback, level) { cancellation.incrementAndGet() }
            controls.execute { server.stop() }
        })
        cleanCameraFiles()
    }
    private fun requestStop() {
        cancellation.incrementAndGet()
        controls.execute { server.stop() }
    }
    @PluginMethod fun setBenchmarkState(call: PluginCall) {
        val running = call.getBoolean("running") ?: false
        val idleMinutes = call.getDouble("backgroundIdleMinutes") ?: 5.0
        if (!idleMinutes.isFinite() || idleMinutes < 1 || idleMinutes > 60) { call.reject("native_error", "native_error"); return }
        activity.runOnUiThread {
            lifecycle.setState(running, idleMinutes)
            // A screen-off during a long benchmark sends the app to the background, where Android may kill it.
            if (running) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            call.resolve()
        }
    }
    // The installed @capacitor/camera legacy Base64 flow uses JPEG_<timestamp>_<random>.jpg here.
    // Never delete gallery items, dataset files, imported models or arbitrary paths supplied by JavaScript.
    private fun cleanCameraFiles() {
        val directory = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: return
        directory.listFiles()?.filter { it.name.matches(Regex("JPEG_\\d{8}_\\d{6}_.+\\.jpg")) }?.forEach { file ->
            if (file.isFile && file.canonicalFile.parentFile == directory.canonicalFile && !file.delete()) throw MobileFailure("native_error")
        }
    }
    @PluginMethod fun cleanupCameraTempFiles(call: PluginCall) = task(call) { cleanCameraFiles(); null }
    private fun task(call: PluginCall, exclusive: Boolean = false, action: (Long) -> JSONObject?) {
        if (exclusive && !busy.compareAndSet(false, true)) { call.reject("busy", "busy"); return }
        if (exclusive) store.beginOperation()
        val token = cancellation.get()
        worker.execute {
            try {
                if (exclusive && cancellation.get() != token) throw MobileFailure("aborted")
                call.resolve(action(token)?.let { JSObject(it.toString()) } ?: JSObject())
            }
            catch (e: DatasetFailure) { call.reject("dataset_invalid", "dataset_invalid", e.data()) }
            catch (e: MobileFailure) { call.reject(e.code, e.code) }
            catch (_: Exception) { call.reject("native_error", "native_error") }
            finally { if (exclusive) busy.set(false) }
        }
    }
    private fun deviceData(): JSONObject {
        val memory = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(memory)
        return JSONObject().put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL)
            .put("android", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT)
            .put("cores", Runtime.getRuntime().availableProcessors()).put("totalRamBytes", memory.totalMem)
            .put("availableRamBytes", memory.availMem).put("freeStorageBytes", context.filesDir.usableSpace)
    }
    @PluginMethod fun device(call: PluginCall) { call.resolve(JSObject(deviceData().toString())) }
    @PluginMethod fun models(call: PluginCall) {
        try { call.resolve(JSObject().put("models", JSArray(store.states().toString()))) }
        catch (_: Exception) { call.reject("native_error", "native_error") }
    }
    @PluginMethod fun download(call: PluginCall) = task(call, true) { server.stop(); store.download(call.getString("model") ?: ""); null }
    @PluginMethod fun importModel(call: PluginCall) = task(call, true) { server.stop(); store.importModel(call.getString("model") ?: ""); null }
    @PluginMethod fun cancelDownload(call: PluginCall) { cancellation.incrementAndGet(); store.cancel(); call.resolve() }
    @PluginMethod fun start(call: PluginCall) = task(call, true) { token ->
        if (call.getString("model") !in listOf("a", "b")) throw MobileFailure("model_missing")
        val threads = call.getInt("threads") ?: 1
        val minRam = call.getDouble("minRamGb") ?: 6.0
        if (threads !in 1..256 || !minRam.isFinite() || minRam < 1 || minRam > 64) throw MobileFailure("native_error")
        if (deviceData().getLong("totalRamBytes") < minRam * 1e9 && call.getBoolean("allowLowRam") != true) throw MobileFailure("low_ram")
        server.start(call.getString("model") ?: "", threads) { cancellation.get() != token }
    }
    /** Verified local paths only; the WebView reads these through Capacitor's file handler. */
    @PluginMethod fun ocrModels(call: PluginCall) = task(call, true) { token ->
        server.stop(); appPressure = null
        val began = android.os.SystemClock.elapsedRealtime()
        val files = store.verifiedFiles("c").associateBy { it.name }
        if (cancellation.get() != token) throw MobileFailure("aborted")
        JSONObject().put("detector", files.getValue("det.onnx").absolutePath)
            .put("encoder", files.getValue("vietocr_encoder.onnx").absolutePath)
            .put("decoder", files.getValue("vietocr_decoder.onnx").absolutePath)
            .put("config", JSONObject(files.getValue("vietocr.json").readText()))
            .put("verifyMs", android.os.SystemClock.elapsedRealtime() - began)
    }
    /** Android app process RSS/high-water mark; separate from llama-server and WebView renderer processes. */
    @PluginMethod fun appMemory(call: PluginCall) {
        try {
            val data = JSObject()
            File("/proc/self/status").useLines { lines ->
                lines.forEach { line ->
                    val key = when {
                        line.startsWith("VmRSS:") -> "rssMemoryMb"
                        line.startsWith("VmHWM:") -> "peakMemoryMb"
                        else -> null
                    }
                    if (key != null) Regex("\\d+").find(line)?.value?.toLongOrNull()?.let { data.put(key, it / 1024.0) }
                }
            }
            appPressure?.let { data.put("memoryPressure", it) }
            call.resolve(data)
        } catch (_: Exception) { call.reject("native_error", "native_error") }
    }
    @PluginMethod fun status(call: PluginCall) { call.resolve(JSObject(server.status().toString())) }
    @PluginMethod fun post(call: PluginCall) {
        val requestId = call.getString("requestId") ?: ""
        val pending = PendingRequest()
        if (!requestId.matches(Regex("[A-Za-z0-9-]{1,100}"))) { call.reject("http_error", "http_error"); return }
        if (requests.putIfAbsent(requestId, pending) != null) { call.reject("busy", "busy"); return }
        httpWorker.execute {
            var conn: HttpURLConnection? = null
            try {
                val url = call.getString("url") ?: throw MobileFailure("http_error")
                val authorization = call.getObject("headers")?.getString("Authorization")
                server.authorizeRequest(url, authorization, "/v1/chat/completions")
                val connectTimeout = call.getInt("connectTimeout") ?: 5000
                val readTimeout = call.getInt("readTimeout") ?: 300000
                if (connectTimeout !in 1..5000 || readTimeout !in 1000..3600000) throw MobileFailure("http_error")
                val body = (call.getObject("data") ?: throw MobileFailure("http_error")).toString().toByteArray(Charsets.UTF_8)
                conn = URL(url).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"; conn.doOutput = true
                conn.connectTimeout = connectTimeout; conn.readTimeout = readTimeout
                conn.instanceFollowRedirects = false; conn.useCaches = false
                // Never return this connection to Android's persistent connection pool.
                conn.setRequestProperty("Connection", "close")
                conn.setRequestProperty("Authorization", authorization)
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setFixedLengthStreamingMode(body.size)
                pending.output(conn).use { it.write(body) }
                if (pending.cancelled.get()) throw MobileFailure("aborted")
                val status = conn.responseCode
                val text = (if (status < 400) conn.inputStream else conn.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                if (pending.cancelled.get()) throw MobileFailure("aborted")
                val data = if (status == 200) {
                    try { JSONObject(text) } catch (_: JSONException) { throw MobileFailure("invalid_json") }
                } else JSONObject.NULL
                call.resolve(JSObject().put("status", status).put("data", data))
            } catch (_: SocketTimeoutException) {
                val code = if (pending.cancelled.get()) "aborted" else "timeout"
                call.reject(code, code)
            } catch (e: MobileFailure) {
                val code = if (pending.cancelled.get()) "aborted" else e.code
                call.reject(code, code)
            } catch (_: Exception) {
                val code = if (pending.cancelled.get()) "aborted" else "http_error"
                call.reject(code, code)
            } finally {
                pending.close(); conn?.disconnect(); requests.remove(requestId, pending)
            }
        }
    }
    @PluginMethod fun cancelRequest(call: PluginCall) {
        val requestId = call.getString("requestId") ?: ""
        // A request that already finished has closed its socket in finally.
        controls.execute {
            requests[requestId]?.cancel()
            call.resolve()
        }
    }
    @PluginMethod fun slots(call: PluginCall) {
        httpWorker.execute {
            var conn: HttpURLConnection? = null
            try {
                val url = call.getString("url") ?: throw MobileFailure("http_error")
                val authorization = call.getObject("headers")?.getString("Authorization")
                server.authorizeRequest(url, authorization, "/slots")
                val timeout = call.getInt("timeout") ?: 500
                if (timeout !in 1..500) throw MobileFailure("http_error")
                conn = URL(url).openConnection() as HttpURLConnection
                conn.requestMethod = "GET"; conn.connectTimeout = timeout; conn.readTimeout = timeout
                conn.instanceFollowRedirects = false; conn.useCaches = false
                conn.setRequestProperty("Connection", "close"); conn.setRequestProperty("Authorization", authorization)
                if (conn.responseCode != 200) throw MobileFailure("http_error")
                val slots = JSONArray(conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
                val idle = slots.length() > 0 && (0 until slots.length()).all { slots.getJSONObject(it).getBoolean("is_processing") == false }
                call.resolve(JSObject().put("idle", idle))
            } catch (_: Exception) { call.reject("http_error", "http_error") }
            finally { conn?.disconnect() }
        }
    }
    @PluginMethod fun stop(call: PluginCall) {
        cancellation.incrementAndGet()
        store.cancel()
        controls.execute { try { requests.values.forEach { it.cancel() }; server.stop(); call.resolve() } catch (_: Exception) { call.reject("server_exit", "server_exit") } }
    }
    private fun safeName(name: String) = name.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,99}")) && name != "." && name != ".."
    private fun datasetDir(name: String, location: String? = null): Pair<File, String> {
        if (!safeName(name)) throw DatasetFailure("entry_name", file = name)
        if (location != null && location != "internal" && location != "external") throw DatasetFailure("entry_name", file = name)
        val internal = File(context.filesDir, "datasets/$name").absoluteFile
        if (location == "internal" || (location == null && internal.exists())) return internal to "internal"
        val root = context.getExternalFilesDir(null) ?: throw DatasetFailure("ids_missing", file = "ids.json", operation = "stat")
        return File(root, "datasets/$name").absoluteFile to "external"
    }
    private fun datasetEntries(dir: File): JSONArray {
        val ids = File(dir, "ids.json")
        if (!ids.isFile) throw DatasetFailure("ids_missing", file = "ids.json", operation = "stat")
        if (ids.length() > 1024 * 1024) throw DatasetFailure("ids_too_large", file = "ids.json")
        val text = try { ids.readText() }
        catch (_: Exception) { throw DatasetFailure("ids_parse", file = "ids.json", operation = "read") }
        val entries = try { JSONArray(text) }
        catch (_: JSONException) { throw DatasetFailure("ids_parse", file = "ids.json", operation = "parse") }
        val seen = mutableSetOf<String>()
        if (entries.length() < 1 || entries.length() > 1000) throw DatasetFailure("entry_count", file = "ids.json")
        for (i in 0 until entries.length()) {
            val e = entries.optJSONObject(i) ?: throw DatasetFailure("entry_name", file = "ids.json")
            val id = e.opt("id") as? String; val nameFile = e.opt("file") as? String
            if (id == null || nameFile == null || !safeName(id) || !safeName(nameFile) || !nameFile.matches(Regex(".+\\.(png|jpg|jpeg)", RegexOption.IGNORE_CASE)))
                throw DatasetFailure("entry_name", id, nameFile)
            if (!seen.add(id)) throw DatasetFailure("duplicate_id", id, nameFile)
            val image = File(dir, nameFile)
            // safeName forbids separators/traversal; compare lexical absolute paths, independent of FUSE aliases.
            if (image.parentFile != dir) throw DatasetFailure("entry_name", id, nameFile)
            if (!image.isFile) throw DatasetFailure("image_missing", id, nameFile, "stat")
            if (image.length() > 10 * 1024 * 1024) throw DatasetFailure("image_too_large", id, nameFile)
        }
        return entries
    }
    @PluginMethod fun dataset(call: PluginCall) = task(call) {
        val (dir, location) = datasetDir(call.getString("name") ?: "")
        JSONObject().put("entries", datasetEntries(dir)).put("location", location)
    }
    @PluginMethod fun datasetImage(call: PluginCall) = task(call) {
        val name = call.getString("name") ?: ""; val filename = call.getString("file") ?: ""
        val (dir, _) = datasetDir(name, call.getString("location"))
        val entries = datasetEntries(dir)
        if (!(0 until entries.length()).any { entries.getJSONObject(it).getString("file") == filename }) throw DatasetFailure("entry_name", file = filename)
        val image = File(dir, filename)
        val mime = if (filename.endsWith(".png", true)) "png" else "jpeg"
        JSONObject().put("dataUrl", "data:image/$mime;base64," + Base64.encodeToString(image.readBytes(), Base64.NO_WRAP))
    }
    @PluginMethod fun exportResult(call: PluginCall) = task(call) {
        val text = call.getString("json") ?: throw MobileFailure("native_error")
        if (text.length > 16 * 1024 * 1024) throw MobileFailure("native_error")
        val report = JSONObject(text)
        if (report.getInt("version") != 1 || !report.has("device") || !report.has("results")) throw MobileFailure("native_error")
        val dir = File(context.getExternalFilesDir(null), "results").apply { mkdirs() }
        val output = File.createTempFile("read-", ".json", dir); output.writeText(report.toString(2))
        JSONObject().put("path", output.absolutePath)
    }
    /** Overwrites one file per benchmark run after every image, so an interrupted run keeps its results. */
    @PluginMethod fun saveProgress(call: PluginCall) = task(call) {
        val runId = call.getString("runId") ?: ""
        if (!runId.matches(Regex("[A-Za-z0-9-]{1,64}"))) throw MobileFailure("native_error")
        val text = call.getString("json") ?: throw MobileFailure("native_error")
        if (text.length > 16 * 1024 * 1024) throw MobileFailure("native_error")
        val report = JSONObject(text)
        if (report.getInt("version") != 1 || !report.has("device") || !report.has("results")) throw MobileFailure("native_error")
        val dir = File(context.getExternalFilesDir(null), "results").apply { mkdirs() }
        val output = File(dir, "run-$runId.json"); val partial = File(dir, "run-$runId.json.tmp")
        partial.writeText(report.toString(2))
        if (!partial.renameTo(output)) { output.delete(); if (!partial.renameTo(output)) throw MobileFailure("native_error") }
        JSONObject().put("path", output.absolutePath)
    }
    override fun handleOnPause() { activity.runOnUiThread { lifecycle.pause() } }
    override fun handleOnResume() { activity.runOnUiThread { lifecycle.resume() } }
    override fun handleOnDestroy() {
        lifecycle.close(); cancellation.incrementAndGet(); store.cancel(); requests.values.forEach { it.cancel() }; server.stop()
        worker.shutdownNow(); controls.shutdownNow(); httpWorker.shutdownNow()
    }
}
