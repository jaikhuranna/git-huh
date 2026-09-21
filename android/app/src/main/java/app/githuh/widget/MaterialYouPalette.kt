package app.githuh.widget

import android.content.Context
import android.os.Build
import java.util.Locale

/**
 * The device's live Material You palette, as Android 12+ exposes it in
 * android.R.color.system_*. It is handed to JS so nothing-mtui can resolve the
 * com.nothing.communitywidgets tokens against the user's real wallpaper rather
 * than the static approximations it falls back to with no palette.
 */
object MaterialYouPalette {

    // AOSP names system_(key)_N by luminance step, not by Material tone.
    private val TONES = listOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)

    // nothing-mtui palette keys -> AOSP resource prefixes. accent3 is carried
    // by the framework but referenced by no Nothing widget token.
    private val KEYS = mapOf(
        "neutral1" to "system_neutral1",
        "neutral2" to "system_neutral2",
        "accent1" to "system_accent1",
        "accent2" to "system_accent2",
    )

    /** Null below Android 12, which has no dynamic palette to read. */
    fun read(context: Context): Map<String, Map<String, String>>? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val resources = context.resources
        return KEYS.mapValues { (_, prefix) ->
            TONES.mapNotNull { tone ->
                val id = resources.getIdentifier("${prefix}_$tone", "color", "android")
                if (id == 0) null else tone.toString() to hex(context.getColor(id))
            }.toMap()
        }
    }

    private fun hex(color: Int) = String.format(Locale.US, "#%06x", color and 0xffffff)
}

/**
 * The nothing-mtui token map, resolved against this device at the moment the
 * widget is drawn.
 *
 * The palette also travels in the sync payload, but that is a snapshot taken
 * when the app last ran: change the system colour and the widget would keep
 * the old background until you reopened the app. `widgetBg` is a dynamic
 * Android system colour, so the only correct time to read it is at
 * composition.
 */
object NothingMtui {

    /** widgetBg: neutral1/50 in light, neutral1/900 in dark. */
    fun widgetBg(context: Context, dark: Boolean, payload: String?): Int {
        live(context, if (dark) "system_neutral1_900" else "system_neutral1_50")
            ?.let { return it }
        parseHex(payload)?.let { return it }
        return parseHex(if (dark) "#1b1b1b" else "#e5e5e5") ?: android.graphics.Color.BLACK
    }

    private fun live(context: Context, name: String): Int? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val id = context.resources.getIdentifier(name, "color", "android")
        return if (id == 0) null else runCatching { context.getColor(id) }.getOrNull()
    }

    private fun parseHex(hex: String?): Int? =
        hex?.takeIf { it.isNotBlank() }
            ?.let { runCatching { android.graphics.Color.parseColor(it) }.getOrNull() }
}
