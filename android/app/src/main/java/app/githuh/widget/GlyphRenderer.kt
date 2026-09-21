package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.glance.ImageProvider
import kotlin.math.ceil

/**
 * The board's sigil: a 2x2 grid of geometric primitives — quarter circle,
 * dot pair, dome, disc — lifted from the Urbit ID cards on the pinboard
 * (design/board/pin08.png) and shared with the app's launcher icon.
 *
 * A non-zero `seed` rotates each primitive and shuffles which tile it lands
 * in, so a sigil derived from a handle is stable but personal.
 */
object GlyphRenderer {

    fun render(
        context: Context,
        sizeDp: Float,
        color: Int,
        seed: Int = 0,
    ): ImageProvider {
        val density = context.resources.displayMetrics.density
        val size = ceil(sizeDp * density).toInt().coerceAtLeast(1)
        val tile = size / 2f

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

        // Four primitives, distributed over the four tiles. The seed picks the
        // rotation of the run, so every handle gets a different arrangement.
        val offset = if (seed == 0) 0 else (seed ushr 1) and 3
        for (index in 0 until 4) {
            val tileIndex = (index + offset) and 3
            val left = (tileIndex and 1) * tile
            val top = (tileIndex ushr 1) * tile
            val quarterTurn = if (seed == 0) 0 else (seed ushr (index * 2 + 3)) and 3
            draw(canvas, paint, index, left, top, tile, quarterTurn)
        }

        return ImageProvider(bitmap)
    }

    private fun draw(
        canvas: Canvas,
        paint: Paint,
        primitive: Int,
        left: Float,
        top: Float,
        tile: Float,
        quarterTurn: Int,
    ) {
        when (primitive) {
            // Quarter circle, corner chosen by the rotation.
            0 -> canvas.drawArc(
                RectF(
                    left - tile * (if (quarterTurn == 1 || quarterTurn == 2) 1f else 0f),
                    top - tile * (if (quarterTurn >= 2) 1f else 0f),
                    left + tile * (if (quarterTurn == 1 || quarterTurn == 2) 1f else 2f),
                    top + tile * (if (quarterTurn >= 2) 1f else 2f),
                ),
                180f + quarterTurn * 90f,
                90f,
                true,
                paint,
            )

            // Dot pair, horizontal or vertical.
            1 -> {
                val radius = tile * 0.14f
                val spread = tile * 0.22f
                val cx = left + tile / 2f
                val cy = top + tile / 2f
                if (quarterTurn % 2 == 0) {
                    canvas.drawCircle(cx - spread, cy, radius, paint)
                    canvas.drawCircle(cx + spread, cy, radius, paint)
                } else {
                    canvas.drawCircle(cx, cy - spread, radius, paint)
                    canvas.drawCircle(cx, cy + spread, radius, paint)
                }
            }

            // Dome, sitting on one of the four edges.
            2 -> {
                val radius = tile * 0.42f
                val cx = left + tile / 2f
                val cy = top + tile / 2f
                canvas.drawArc(
                    RectF(cx - radius, cy - radius, cx + radius, cy + radius),
                    180f + quarterTurn * 90f,
                    180f,
                    true,
                    paint,
                )
            }

            // Disc.
            else -> canvas.drawCircle(
                left + tile / 2f,
                top + tile / 2f,
                tile * 0.30f,
                paint,
            )
        }
    }
}
