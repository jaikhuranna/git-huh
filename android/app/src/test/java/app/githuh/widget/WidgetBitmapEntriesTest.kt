package app.githuh.widget

private data class Picture(val name: String, val bytes: Long)

/** Standalone JVM contract tests; no Android runtime or bitmap allocation is needed. */
fun main() {
    val cache = WidgetBitmapEntries<Picture>(10) { it.bytes }
    val first = Picture("first", 4)
    cache.put("first", first)
    check(cache.get("first") === first)
    check(cache.byteCount == 4L)

    cache.put("second", Picture("second", 4))
    cache.get("first")
    cache.put("third", Picture("third", 4))
    check(cache.get("second") == null) { "the least recently used entry must leave" }
    check(cache.get("first") === first)
    check(cache.byteCount == 8L)

    cache.clear()
    cache.put("same", Picture("old", 6))
    val replacement = Picture("replacement", 3)
    cache.put("same", replacement)
    cache.put("other", Picture("other", 7))
    check(cache.get("same") === replacement)
    check(cache.byteCount == 10L) { "replacement must subtract the previous allocation" }

    val oversized = Picture("oversized", 11)
    check(cache.put("too-large", oversized) === oversized)
    check(cache.get("too-large") == null) { "one picture must not exceed the entire cache budget" }
    check(cache.byteCount == 10L)
    check(cache.get("same") === replacement)

    cache.put("same", Picture("oversized replacement", 11))
    check(cache.get("same") == null) { "an uncached replacement must not leave a stale hit" }
    check(cache.byteCount == 7L)

    check(runCatching { cache.put("other", Picture("invalid", -1)) }.isFailure)
    check(cache.get("other")?.name == "other")
    check(cache.byteCount == 7L) { "failed size validation must leave accounting intact" }

    cache.clear()
    check(cache.byteCount == 0L)
    check(cache.get("other") == null)
    println("WidgetBitmapEntries: all contracts passed")
}
