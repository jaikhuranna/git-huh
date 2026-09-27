package app.githuh.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * What the app last synced, read at every recomposition. Written by the JS
 * side through [WidgetBridgeModule]; the shape is `syncWidget`'s payload in
 * `src/lib/widgetBridge.ts`, which the iOS widget reads too.
 */
data class WidgetState(
    val login: String,
    val todayCount: Int,
    /** Every day of the year up to today, oldest first, with no weekday padding. */
    val days: List<DayCell>,
    /**
     * A pool of the account's own commit subjects, shared with the loading
     * screen, each with the repository it was written in. The card runs them
     * across its top instead of a logo and a handle — the handle is the one
     * thing on a home screen its owner already knows.
     */
    val lines: List<Line>,
) {
    data class DayCell(val level: Int, val isToday: Boolean)

    /** A commit subject and where it was written. */
    data class Line(val message: String, val repo: String)

    /**
     * Today's line, stable for the whole day — a card that reshuffled its own
     * headline at every recomposition would be a distraction rather than a
     * thing to glance at.
     *
     * The pick hashes the day against each *message* and takes the highest,
     * rather than indexing the list: the app shuffles the pool on every
     * launch, and an index would point at a different commit each time.
     */
    fun lineOfTheDay(now: Long = System.currentTimeMillis()): Line? {
        // Days are counted from local midnight, so the line turns over when
        // the owner's day does rather than at midnight in Greenwich.
        val day = (now + TimeZone.getDefault().getOffset(now)) / DAY_MS
        return lines.maxByOrNull { seed(day, it.message) }
    }

    /**
     * The whole pool, turned so that today's line comes first. The strip runs
     * several of them in a loop, and which ones still moves with the date.
     */
    fun linesFromToday(now: Long = System.currentTimeMillis()): List<Line> {
        val first = lineOfTheDay(now) ?: return emptyList()
        val at = lines.indexOf(first).coerceAtLeast(0)
        return lines.drop(at) + lines.take(at)
    }

    companion object {
        private const val PREFS = "git_huh_widget"
        private const val KEY_PAYLOAD = "payload"
        private const val DAY_MS = 86_400_000L

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
         * the lines in either case would leave the card with no masthead every
         * time the app was opened. Only carried across for the same account:
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
                    for (line in kept) array.put(JSONObject().put("m", line.message).put("r", line.repo))
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
                DayCell(level = day.getInt("l").coerceIn(0, 4), isToday = day.getBoolean("t"))
            }
            return WidgetState(
                login = json.getString("login"),
                todayCount = json.optInt("todayCount", 0),
                days = days,
                lines = linesOf(json),
            )
        }

        /** The commit subjects in a payload, if it has any. */
        private fun linesOf(json: JSONObject): List<Line> {
            val array = json.optJSONArray("lines") ?: return emptyList()
            return buildList {
                for (index in 0 until array.length()) {
                    val entry = array.optJSONObject(index) ?: continue
                    val line = Line(message = entry.optString("m"), repo = entry.optString("r"))
                    if (line.message.isNotBlank()) add(line)
                }
            }
        }
    }
}

/**
 * FNV-1a 64, started from the day rather than the standard basis: a pick of
 * one line out of a pool that does not depend on the pool's order. The iOS
 * widget's `seed` in Payload.swift is the same function.
 */
private const val FNV_BASIS = -3750763034362895579L
private const val FNV_PRIME = 1099511628211L

private fun seed(day: Long, line: String): Long {
    var hash = FNV_BASIS xor day
    for (char in line) hash = (hash xor char.code.toLong()) * FNV_PRIME
    return hash
}
