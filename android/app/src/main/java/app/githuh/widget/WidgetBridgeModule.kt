package app.githuh.widget

import androidx.glance.appwidget.updateAll
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * JS → widget bridge. The React Native side owns GitHub API access; the
 * widget only renders what it is given. sync() persists the latest snapshot
 * and asks every placed widget instance to recompose. It also reads back the
 * one thing JS cannot see on its own: the device's Material You palette.
 */
class WidgetBridgeModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GitHuhWidgetBridge"

    @ReactMethod
    fun sync(payload: String, promise: Promise) {
        try {
            WidgetState.write(reactContext, payload)
            CoroutineScope(Dispatchers.Default).launch {
                GitHuhWidget().updateAll(reactContext)
            }
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_SYNC_ERROR", error)
        }
    }

    /**
     * The live Material You palette, in the shape nothing-mtui resolves its
     * tokens against. Null on Android 11 and below, where the package's static
     * fallbacks are the only option.
     */
    @ReactMethod
    fun materialYouPalette(promise: Promise) {
        val palette = MaterialYouPalette.read(reactContext)
        promise.resolve(palette?.let(::toWritableMap))
    }

    private fun toWritableMap(palette: Map<String, Map<String, String>>): WritableMap {
        val out = Arguments.createMap()
        for ((key, tones) in palette) {
            val toneMap = Arguments.createMap()
            for ((tone, hex) in tones) toneMap.putString(tone, hex)
            out.putMap(key, toneMap)
        }
        return out
    }

    @ReactMethod
    fun clear(promise: Promise) {
        try {
            WidgetState.clear(reactContext)
            CoroutineScope(Dispatchers.Default).launch {
                GitHuhWidget().updateAll(reactContext)
            }
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("WIDGET_CLEAR_ERROR", error)
        }
    }
}

class WidgetBridgePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(WidgetBridgeModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
