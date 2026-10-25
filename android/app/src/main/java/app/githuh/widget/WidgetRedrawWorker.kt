package app.githuh.widget

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** One redraw at a time, retaining only the latest request while a draw is running. */
internal class WidgetRedrawWorker<T>(
    private val scope: CoroutineScope,
    private val draw: suspend (T) -> Unit,
    private val onFailure: (Exception) -> Unit,
) {
    private data class Pending<T>(val target: T)

    private val lock = Any()
    private var pending: Pending<T>? = null
    private var worker: Job? = null

    fun request(target: T) {
        synchronized(lock) {
            pending = Pending(target)
            startIfNeeded()
        }
    }

    /** Called with [lock] held, including from the completion callback. */
    private fun startIfNeeded() {
        if (worker?.isActive == true || pending == null || !scope.isActive) return
        val next = scope.launch(start = CoroutineStart.LAZY) { drain() }
        worker = next
        next.invokeOnCompletion {
            synchronized(lock) {
                if (worker === next) {
                    worker = null
                    // A request may arrive after drain found an empty slot
                    // but before its Job completed. It still needs a worker.
                    startIfNeeded()
                }
            }
        }
        next.start()
    }

    private suspend fun drain() {
        while (true) {
            val next = synchronized(lock) {
                pending?.also { pending = null }
            } ?: return
            try {
                draw(next.target)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                onFailure(error)
            }
        }
    }
}
