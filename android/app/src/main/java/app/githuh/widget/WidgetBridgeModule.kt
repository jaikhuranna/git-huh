package app.githuh.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * JS → widget bridge. The React Native side owns GitHub API access; the
 * widget only renders what it is given. `sync` persists the latest snapshot
 * and asks every placed card to recompose; `clear` empties it on sign-out.
 */
class WidgetBridgeModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GitHuhWidgetBridge"

    @ReactMethod
    fun sync(payload: String, promise: Promise) {
        try {
            WidgetState.write(reactContext, payload)
            redraw(reactContext)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_SYNC_ERROR", error)
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        try {
            WidgetState.clear(reactContext)
            redraw(reactContext)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_CLEAR_ERROR", error)
        }
    }
}

/**
 * One scope for every redraw. A failed update must not cancel the next one,
 * hence the supervisor.
 */
private val redraws = CoroutineScope(SupervisorJob() + Dispatchers.Default)

/** Recompose every placed card off the calling thread. */
internal fun redraw(context: Context) {
    redraws.launch { GitHuhWidget().updateAll(context) }
}

class WidgetBridgePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(WidgetBridgeModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
