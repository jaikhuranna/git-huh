package app.githuh.widget

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

/** Standalone JVM lifecycle tests using the same coroutines version as the widget. */
object WidgetRedrawWorkerTests {
    @JvmStatic
    fun main(args: Array<String>) = runBlocking {
        val scope = CoroutineScope(coroutineContext + SupervisorJob())
        try {
            val attempts = mutableListOf<String>()
            val failures = mutableListOf<Exception>()
            val started = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            val latestDrawn = CompletableDeferred<Unit>()
            val laterDrawn = CompletableDeferred<Unit>()
            val worker = WidgetRedrawWorker<String>(
                scope,
                draw = { target ->
                    attempts.add(target)
                    when (target) {
                        "first" -> {
                            started.complete(Unit)
                            release.await()
                            throw IllegalStateException("redraw failed")
                        }
                        "latest" -> latestDrawn.complete(Unit)
                        "later" -> laterDrawn.complete(Unit)
                    }
                },
                onFailure = { failures.add(it) },
            )
            worker.request("first")
            withTimeout(5_000) { started.await() }
            worker.request("superseded")
            worker.request("latest")
            release.complete(Unit)
            withTimeout(5_000) { latestDrawn.await() }
            check(attempts == listOf("first", "latest"))
            check(failures.single().message == "redraw failed")

            worker.request("later")
            withTimeout(5_000) { laterDrawn.await() }
            check(attempts == listOf("first", "latest", "later"))

            val cancelling = CompletableDeferred<Unit>()
            val cancelRelease = CompletableDeferred<Unit>()
            val afterCancelDrawn = CompletableDeferred<Unit>()
            val cancelledWorker = WidgetRedrawWorker<String>(
                scope,
                draw = { target ->
                    if (target == "cancel") {
                        cancelling.complete(Unit)
                        cancelRelease.await()
                        throw CancellationException("draw cancelled")
                    }
                    afterCancelDrawn.complete(Unit)
                },
                onFailure = { error("cancellation must not be reported as a redraw failure") },
            )
            cancelledWorker.request("cancel")
            withTimeout(5_000) { cancelling.await() }
            cancelledWorker.request("after-cancel")
            cancelRelease.complete(Unit)
            withTimeout(5_000) { afterCancelDrawn.await() }
            println("WidgetRedrawWorker: all lifecycle contracts passed")
        } finally {
            scope.cancel()
        }
    }
}
