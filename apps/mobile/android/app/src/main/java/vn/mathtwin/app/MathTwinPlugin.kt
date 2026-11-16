package vn.mathtwin.app

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Base64
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
    private val busy = AtomicBoolean(false)
    private val cancellation = AtomicLong(0)
    override fun load() {
        store = ModelStore(context); server = ServerRuntime(context, store)
        lifecycle = BenchmarkLifecycle(activity, { requestStop() }, { callback, level ->
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
        activity.runOnUiThread { lifecycle.setState(running, idleMinutes); call.resolve() }
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
        val threads = call.getInt("threads") ?: 1
        val minRam = call.getDouble("minRamGb") ?: 6.0
        if (threads !in 1..256 || !minRam.isFinite() || minRam < 1 || minRam > 64) throw MobileFailure("native_error")
        if (deviceData().getLong("totalRamBytes") < minRam * 1e9 && call.getBoolean("allowLowRam") != true) throw MobileFailure("low_ram")
        server.start(call.getString("model") ?: "", threads) { cancellation.get() != token }
    }
    @PluginMethod fun status(call: PluginCall) { call.resolve(JSObject(server.status().toString())) }
    @PluginMethod fun stop(call: PluginCall) {
        cancellation.incrementAndGet()
        store.cancel()
        controls.execute { try { server.stop(); call.resolve() } catch (_: Exception) { call.reject("server_exit", "server_exit") } }
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
    override fun handleOnPause() { activity.runOnUiThread { lifecycle.pause() } }
    override fun handleOnResume() { activity.runOnUiThread { lifecycle.resume() } }
    override fun handleOnDestroy() {
        lifecycle.close(); cancellation.incrementAndGet(); store.cancel(); server.stop()
        worker.shutdownNow(); controls.shutdownNow()
    }
}
