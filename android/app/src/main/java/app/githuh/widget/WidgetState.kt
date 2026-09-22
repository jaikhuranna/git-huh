package app.githuh.widget

import android.content.Context
import org.json.JSONArray
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
    val days: List<DayCell>,
    /**
     * A pool of the account's own commit subjects, shared with the loading
     * screen, each with the repository it was written in. The widget runs one
     * of them across the card instead of a logo and a handle — the handle is
     * the one thing on a home screen its owner already knows.
     */
    val lines: List<Line>,
) {
    data class DayCell(val level: Int, val isToday: Boolean)

    /** A commit subject and where it was written. */
    data class Line(val message: String, val repo: String)

    /**
     * Today's line. Stable for the whole day — a widget that reshuffled its
     * own headline at every recomposition would be a distraction rather than
     * a thing to glance at.
     *
     * The pick hashes the day against each *message* and takes the highest,
     * rather than indexing the list. The app shuffles the pool on every
     * launch, so an index pointed at a different commit each time the app was
     * opened, which is not what "held for the day" was supposed to mean.
     *
     * Length is no longer part of the pick. The strip travels, so a subject
     * too long for the card is read rather than clipped — which is the whole
     * reason it moves.
     */
    fun lineOfTheDay(now: Long = System.currentTimeMillis()): Line? =
        lines.maxByOrNull { seed(now / 86_400_000L, it.message) }

    /**
     * The whole pool, turned so that today's line comes first. The strip runs
     * several of them in a loop rather than the same one over and over, and
     * which ones they are still moves with the date.
     */
    fun linesFromToday(now: Long = System.currentTimeMillis()): List<Line> {
        val first = lineOfTheDay(now) ?: return emptyList()
        val at = lines.indexOf(first).coerceAtLeast(0)
        return lines.drop(at) + lines.take(at)
    }

    companion object {
        private const val PREFS = "git_huh_widget"
        private const val KEY_PAYLOAD = "payload"

        fun read(context: Context): WidgetState? {
            val raw = context
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PAYLOAD, null) ?: return null
            return runCatching { parse(JSONObject(raw)) }.getOrNull()
        }

        /**
         * Persist a sync, keeping the message pool when the payload carries
         * none of its own.
         *
         * The pool is read back off the device while the year is still being
         * fetched, so a sync routinely lands before it — and an account whose
         * commit search is rate-limited has nothing to send at all. Dropping
         * the lines in either case left the card with no masthead every time
         * the app was opened. Only carried across for the same account:
         * someone else's commits are not your masthead.
         */
        fun write(context: Context, payload: String) {
            val json = JSONObject(payload) // throws on malformed input — never persist junk
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

            if (linesOf(json).isEmpty()) {
                val kept = prefs.getString(KEY_PAYLOAD, null)
                    ?.let { runCatching { JSONObject(it) }.getOrNull() }
                    ?.takeIf { it.optString("login") == json.optString("login") }
                    ?.let(::linesOf)
                    .orEmpty()
                if (kept.isNotEmpty()) {
                    val array = JSONArray()
                    for (line in kept) {
                        array.put(
                            JSONObject()
                                .put("m", line.message)
                                .put("r", line.repo),
                        )
                    }
                    json.put("lines", array)
                }
            }

            prefs.edit().putString(KEY_PAYLOAD, json.toString()).apply()
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
            return WidgetState(
                login = json.getString("login"),
                total = json.getInt("total"),
                todayCount = json.getInt("todayCount"),
                todayCommits = json.optInt("todayCommits", json.getInt("todayCount")),
                totalCommits = json.optInt("totalCommits", json.getInt("total")),
                openPrs = json.optInt("openPrs", 0),
                bgLight = bgLight,
                bgDark = bgDark,
                days = days,
                // Absent in payloads written before 2.5; the card then goes
                // without a masthead until the app syncs again.
                lines = linesOf(json),
            )
        }

        /**
         * The commit subjects in a payload, if it has any.
         *
         * Payloads written before 2.7 hold bare strings with no repository to
         * print; they are still perfectly good lines, so they read back with
         * an empty one rather than being thrown away.
         */
        private fun linesOf(json: JSONObject): List<Line> {
            val array = json.optJSONArray("lines") ?: return emptyList()
            return buildList {
                for (index in 0 until array.length()) {
                    val entry = array.opt(index)
                    val line = when (entry) {
                        is JSONObject -> Line(
                            message = entry.optString("m"),
                            repo = entry.optString("r"),
                        )
                        is String -> Line(message = entry, repo = "")
                        else -> null
                    }
                    line?.takeIf { it.message.isNotBlank() }?.let(::add)
                }
            }
        }
    }
}

/**
 * FNV-1a 64, started from the day rather than the standard basis: a pick of
 * one line out of a pool that does not depend on the pool's order.
 */
private const val FNV_BASIS = -3750763034362895579L
private const val FNV_PRIME = 1099511628211L

private fun seed(day: Long, line: String): Long {
    var hash = FNV_BASIS xor day
    for (char in line) hash = (hash xor char.code.toLong()) * FNV_PRIME
    return hash
}
