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
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

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
        lifecycle = BenchmarkLifecycle(activity) { requestStop() }
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
    private fun datasetDir(name: String): File {
        if (!safeName(name)) throw MobileFailure("dataset_invalid")
        return File(context.getExternalFilesDir(null), "datasets/$name")
    }
    private fun datasetEntries(name: String): JSONArray {
        val dir = datasetDir(name); val ids = File(dir, "ids.json")
        if (!ids.isFile || ids.length() > 1024 * 1024) throw MobileFailure("dataset_invalid")
        val entries = JSONArray(ids.readText()); val seen = mutableSetOf<String>()
        if (entries.length() < 1 || entries.length() > 1000) throw MobileFailure("dataset_invalid")
        for (i in 0 until entries.length()) {
            val e = entries.getJSONObject(i); val id = e.getString("id"); val nameFile = e.getString("file")
            if (!safeName(id) || !seen.add(id) || !safeName(nameFile) || !nameFile.matches(Regex(".+\\.(png|jpg|jpeg)", RegexOption.IGNORE_CASE)))
                throw MobileFailure("dataset_invalid")
            val image = File(dir, nameFile)
            if (image.canonicalFile.parentFile != dir.canonicalFile || !image.isFile || image.length() > 10 * 1024 * 1024) throw MobileFailure("dataset_invalid")
        }
        return entries
    }
    @PluginMethod fun dataset(call: PluginCall) = task(call) {
        JSONObject().put("entries", datasetEntries(call.getString("name") ?: ""))
    }
    @PluginMethod fun datasetImage(call: PluginCall) = task(call) {
        val name = call.getString("name") ?: ""; val filename = call.getString("file") ?: ""
        val entries = datasetEntries(name)
        if (!(0 until entries.length()).any { entries.getJSONObject(it).getString("file") == filename }) throw MobileFailure("dataset_invalid")
        val image = File(datasetDir(name), filename)
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
