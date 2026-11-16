package vn.mathtwin.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

internal class MobileFailure(val code: String) : Exception(code)

/** Only the bundled manifest can choose download origins, revisions, filenames and checksums. */
internal class ModelStore(private val context: Context) {
    private val root = File(context.filesDir, "models").apply { mkdirs() }
    private val manifest = JSONObject(context.assets.open("model-manifest.json").bufferedReader().use { it.readText() })
    private val cancelled = AtomicBoolean(false)
    @Volatile private var connection: HttpURLConnection? = null
    fun beginOperation() { cancelled.set(false) }

    fun entries(model: String): List<JSONObject> {
        if (model != "a" && model != "b") throw MobileFailure("model_missing")
        val files = manifest.getJSONArray("files")
        return (0 until files.length()).map { files.getJSONObject(it) }.filter { it.getString("model") == model }
            .also { if (it.size != 2) throw MobileFailure("model_missing") }
    }
    fun file(entry: JSONObject): File = File(File(root, entry.getString("model")).apply { mkdirs() }, entry.getString("filename"))
    private fun marker(f: File) = File(f.path + ".verified")
    private fun isVerified(e: JSONObject): Boolean {
        val f = file(e)
        return f.isFile && f.length() == e.getLong("bytes") && marker(f).isFile &&
            marker(f).readText() == "${e.getString("sha256")}:${f.lastModified()}:${f.length()}"
    }
    fun states(): JSONArray = JSONArray().apply {
        for (model in listOf("a", "b")) {
            val items = entries(model)
            put(JSONObject().put("model", model).put("bytes", items.sumOf { it.getLong("bytes") })
                .put("downloadedBytes", items.sumOf { e ->
                    val f = file(e); (if (f.exists()) f.length() else File(f.path + ".part").length()).coerceAtMost(e.getLong("bytes"))
                }).put("ready", items.all { isVerified(it) }))
        }
    }
    fun verify(e: JSONObject, candidate: File = file(e)) {
        if (!candidate.isFile) throw MobileFailure("model_missing")
        var valid = candidate.length() == e.getLong("bytes")
        if (valid) {
            val digest = MessageDigest.getInstance("SHA-256")
            candidate.inputStream().buffered().use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) {
                    if (cancelled.get()) throw MobileFailure("aborted")
                    val n = input.read(buffer); if (n < 0) break
                    digest.update(buffer, 0, n)
                }
            }
            valid = digest.digest().joinToString("") { "%02x".format(it) } == e.getString("sha256")
        }
        if (!valid) { candidate.delete(); marker(file(e)).delete(); throw MobileFailure("checksum") }
    }
    fun verifiedFiles(model: String): List<File> {
        return entries(model).map { e -> verify(e); file(e).also { mark(e) } }
    }
    private fun mark(e: JSONObject) {
        val f = file(e); marker(f).writeText("${e.getString("sha256")}:${f.lastModified()}:${f.length()}")
    }
    fun cancel() { cancelled.set(true); connection?.disconnect() }
    fun download(model: String) {
        val items = entries(model)
        val remaining = items.sumOf { e -> if (isVerified(e)) 0L else
            (e.getLong("bytes") - File(file(e).path + ".part").length()).coerceAtLeast(0) }
        if (root.usableSpace < remaining + 64L * 1024 * 1024) throw MobileFailure("no_space")
        try {
            for (e in items) {
                if (cancelled.get()) throw MobileFailure("aborted")
                if (isVerified(e)) continue
                val target = file(e)
                if (target.exists()) { verify(e); mark(e); continue }
                val part = File(target.path + ".part")
                if (part.length() > e.getLong("bytes")) part.delete()
                if (part.length() != e.getLong("bytes")) receive(e, part)
                verify(e, part)
                if (!part.renameTo(target)) throw IOException("rename")
                mark(e)
            }
        } catch (e: MobileFailure) { throw e }
        catch (_: Exception) { throw MobileFailure(if (cancelled.get()) "aborted" else "download_failed") }
        finally { connection?.disconnect(); connection = null }
    }
    private fun receive(e: JSONObject, part: File) {
        val url = e.getString("url")
        val expected = "https://huggingface.co/${e.getString("repository")}/resolve/${e.getString("revision")}/${e.getString("filename")}"
        if (url != expected) throw MobileFailure("download_failed")
        var current = URL(url)
        var offset = part.length()
        var conn: HttpURLConnection? = null
        // HF redirects to signed CDN URLs; never permit an HTTPS -> HTTP downgrade.
        for (redirect in 0..8) {
            if (current.protocol != "https" || cancelled.get()) throw MobileFailure(if (cancelled.get()) "aborted" else "download_failed")
            conn = (current.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false; connectTimeout = 15000; readTimeout = 15000
                setRequestProperty("Accept-Encoding", "identity")
                if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
            }
            connection = conn
            val code = conn.responseCode
            if (code in listOf(301, 302, 303, 307, 308)) {
                val location = conn.getHeaderField("Location") ?: throw MobileFailure("download_failed")
                conn.disconnect(); current = URL(current, location); continue
            }
            break
        }
        val active = conn ?: throw MobileFailure("download_failed")
        val code = active.responseCode
        if (code == 200) offset = 0
        else if (code == 206) {
            val range = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(active.getHeaderField("Content-Range") ?: "")
                ?: throw MobileFailure("download_failed")
            if (range.groupValues[1].toLong() != offset || range.groupValues[3].toLong() != e.getLong("bytes") ||
                range.groupValues[2].toLong() != e.getLong("bytes") - 1) throw MobileFailure("download_failed")
        } else throw MobileFailure("download_failed")
        if (root.usableSpace < e.getLong("bytes") - offset + 64L * 1024 * 1024) throw MobileFailure("no_space")
        active.inputStream.buffered().use { input ->
            java.io.FileOutputStream(part, offset > 0).buffered().use { output ->
                val buffer = ByteArray(256 * 1024); var total = offset
                while (true) {
                    if (cancelled.get()) throw MobileFailure("aborted")
                    val count = input.read(buffer); if (count < 0) break
                    total += count
                    if (total > e.getLong("bytes")) { output.close(); part.delete(); throw MobileFailure("checksum") }
                    output.write(buffer, 0, count)
                }
            }
        }
        active.disconnect()
        // A short response is an interruption: retain .part for the next explicit Tải.
        if (part.length() < e.getLong("bytes")) throw MobileFailure("download_failed")
    }
    fun importModel(model: String) {
        for (e in entries(model)) {
            val target = file(e)
            if (isVerified(e)) continue
            val internal = File(context.filesDir, "import/$model/${e.getString("filename")}")
            val fromInternal = internal.isFile
            val source = if (fromInternal) internal else {
                val external = context.getExternalFilesDir(null) ?: throw MobileFailure("model_missing")
                File(external, "import/$model/${e.getString("filename")}")
            }
            verify(e, source)
            // Internal imports share the model filesystem: try moving before requiring copy space.
            val moved = fromInternal && source.renameTo(target)
            if (!moved) {
                if (root.usableSpace < e.getLong("bytes") + 64L * 1024 * 1024) throw MobileFailure("no_space")
                val part = File(target.path + ".part")
                source.inputStream().use { input -> part.outputStream().use { output -> input.copyTo(output) } }
                if (!part.renameTo(target)) throw MobileFailure("native_error")
            }
            verify(e, target)
            if (fromInternal && !moved && !source.delete()) throw MobileFailure("native_error")
            mark(e)
        }
    }
}
