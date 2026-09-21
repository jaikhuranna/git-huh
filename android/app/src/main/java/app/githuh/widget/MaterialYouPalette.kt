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
