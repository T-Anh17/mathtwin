package vn.mathtwin.app

import android.app.Activity
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.os.Handler
import android.os.Looper
import android.view.WindowManager

/** Main-thread lifecycle policy; temporary camera/file-picker Activities do not invalidate a warm server. */
internal class BenchmarkLifecycle(private val activity: Activity, private val stopServer: () -> Unit,
    private val memoryPressure: (String, Int?) -> Unit) : ComponentCallbacks2 {
    private val handler = Handler(Looper.getMainLooper())
    private var foreground = true
    private var measuring = false
    private var idleMinutes = 5.0
    private val idleStop = Runnable { if (!foreground && !measuring) stopServer() }

    init { activity.applicationContext.registerComponentCallbacks(this) }
    private fun scheduleIdleStop() {
        handler.removeCallbacks(idleStop)
        if (!foreground && !measuring) handler.postDelayed(idleStop, (idleMinutes * 60000).toLong())
    }
    fun pause() { foreground = false; scheduleIdleStop() }
    fun resume() { foreground = true; handler.removeCallbacks(idleStop) }
    fun setState(running: Boolean, backgroundIdleMinutes: Double) {
        measuring = running; idleMinutes = backgroundIdleMinutes
        if (running) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        scheduleIdleStop()
    }
    override fun onTrimMemory(level: Int) {
        if (level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL || level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE) {
            memoryPressure("onTrimMemory", level); setState(false, idleMinutes)
        }
    }
    override fun onLowMemory() { memoryPressure("onLowMemory", null); setState(false, idleMinutes) }
    override fun onConfigurationChanged(configuration: Configuration) {}
    fun close() {
        handler.removeCallbacks(idleStop)
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        activity.applicationContext.unregisterComponentCallbacks(this)
    }
}
