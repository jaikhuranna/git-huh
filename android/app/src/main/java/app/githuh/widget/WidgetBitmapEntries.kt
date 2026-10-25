package app.githuh.widget

import java.util.LinkedHashMap

/** Byte accounting is independent of Android so the exact budget contract is JVM-testable. */
internal class WidgetBitmapEntries<T>(
    private val budget: Long,
    private val bytesOf: (T) -> Long,
) {
    private data class Entry<T>(val value: T, val bytes: Long)

    private val entries = LinkedHashMap<String, Entry<T>>(8, 0.75f, true)

    @Volatile
    var byteCount: Long = 0
        private set

    init {
        require(budget >= 0)
    }

    @Synchronized
    fun get(key: String): T? = entries[key]?.value

    @Synchronized
    fun put(key: String, value: T): T {
        val bytes = bytesOf(value)
        require(bytes >= 0)
        entries.remove(key)?.let { byteCount -= it.bytes }

        // The caller can still display a large picture, but the cache must
        // never retain one that exceeds its entire budget on its own.
        if (bytes > budget) return value

        val oldest = entries.entries.iterator()
        while (byteCount > budget - bytes && oldest.hasNext()) {
            byteCount -= oldest.next().value.bytes
            oldest.remove()
        }
        entries[key] = Entry(value, bytes)
        byteCount += bytes
        return value
    }

    @Synchronized
    fun clear() {
        entries.clear()
        byteCount = 0
    }
}
