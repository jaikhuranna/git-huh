package app.githuh.widget

import android.content.Context
import org.json.JSONObject

/**
 * Contribution snapshot shared between the React Native app and the Glance
 * widget. Written by the JS side (via WidgetBridgeModule), read at every
 * widget recomposition. Days are stored column-major, seven rows per week.
 */
data class WidgetState(
    val login: String,
    val total: Int,
    val todayCount: Int,
    val todayCommits: Int,
    val totalCommits: Int,
    val openPrs: Int,
    /** nothing-mtui widgetBg, resolved JS-side against the live Material
     *  You palette — one hex per mode, so the widget can flip with the
     *  system theme without a second round trip to JS. */
    val bgLight: String,
    val bgDark: String,
    /** nothing-mtui widgetFood — the accent, and the only red in the app. */
    val food: String,
    val days: List<DayCell>,
) {
    data class DayCell(val level: Int, val isToday: Boolean)

    companion object {
        private const val PREFS = "git_huh_widget"
        private const val KEY_PAYLOAD = "payload"

        fun read(context: Context): WidgetState? {
            val raw = context
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PAYLOAD, null) ?: return null
            return runCatching { parse(JSONObject(raw)) }.getOrNull()
        }

        fun write(context: Context, payload: String) {
            JSONObject(payload) // throws on malformed input — never persist junk
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PAYLOAD, payload)
                .apply()
        }

        fun clear(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_PAYLOAD)
                .apply()
        }

        private fun parse(json: JSONObject): WidgetState {
            val daysJson = json.getJSONArray("days")
            val days = List(daysJson.length()) { index ->
                val day = daysJson.getJSONObject(index)
                DayCell(
                    level = day.getInt("l").coerceIn(0, 4),
                    isToday = day.getBoolean("t"),
                )
            }
            // Old payloads only ever carried a flat "bg" (dark card only).
            // New payloads carry both modes under "mtui"; fall back to "bg"
            // for whichever side is missing so an old JS bundle can't crash
            // a freshly-updated native widget.
            val legacyBg = json.optString("bg", "#000000")
            val mtui = json.optJSONObject("mtui")
            val bgLight = mtui?.optJSONObject("light")?.optString("bg")
                ?.takeIf { it.isNotBlank() } ?: legacyBg
            val bgDark = mtui?.optJSONObject("dark")?.optString("bg")
                ?.takeIf { it.isNotBlank() } ?: legacyBg
            val food = mtui?.optJSONObject("dark")?.optString("food")
                ?.takeIf { it.isNotBlank() } ?: "#d71921"

            return WidgetState(
                login = json.getString("login"),
                total = json.getInt("total"),
                todayCount = json.getInt("todayCount"),
                todayCommits = json.optInt("todayCommits", json.getInt("todayCount")),
                totalCommits = json.optInt("totalCommits", json.getInt("total")),
                openPrs = json.optInt("openPrs", 0),
                bgLight = bgLight,
                bgDark = bgDark,
                food = food,
                days = days,
            )
        }
    }
}
