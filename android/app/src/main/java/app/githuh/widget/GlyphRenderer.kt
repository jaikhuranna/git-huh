package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.glance.ImageProvider
import kotlin.math.ceil

/**
 * The app's sigil: a 2x2 grid of geometric primitives — quarter circle, dot
 * pair, dome, disc — after the Urbit ID cards on the design board (pin08),
 * the same mark as the launcher icon. The card draws it when it has nothing
 * to show yet.
 */
object GlyphRenderer {

    fun render(context: Context, sizeDp: Float, color: Int): ImageProvider {
        val density = context.resources.displayMetrics.density
        val size = ceil(sizeDp * density).toInt().coerceAtLeast(1)
        val tile = size / 2f

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

        // One primitive per tile, left to right and top to bottom.
        for (index in 0 until 4) {
            draw(canvas, paint, index, left = (index and 1) * tile, top = (index ushr 1) * tile, tile = tile)
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
    ) {
        when (primitive) {
            // Quarter circle, centred on the tile's bottom-right corner.
            0 -> canvas.drawArc(
                RectF(left, top, left + tile * 2f, top + tile * 2f),
                180f,
                90f,
                true,
                paint,
            )

            // Dot pair, side by side.
            1 -> {
                val radius = tile * 0.14f
                val spread = tile * 0.22f
                val cx = left + tile / 2f
                val cy = top + tile / 2f
                canvas.drawCircle(cx - spread, cy, radius, paint)
                canvas.drawCircle(cx + spread, cy, radius, paint)
            }

            // Dome, flat side down.
            2 -> {
                val radius = tile * 0.42f
                val cx = left + tile / 2f
                val cy = top + tile / 2f
                canvas.drawArc(
                    RectF(cx - radius, cy - radius, cx + radius, cy + radius),
                    180f,
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
