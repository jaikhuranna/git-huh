package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import androidx.glance.ImageProvider

/**
 * The contribution field, painted as one bitmap.
 *
 * It used to be a Glance `Column` of `Row`s of weighted `Box`es, and that
 * layout could not produce a square grid. The columns took an equal share of
 * whatever width the launcher reported, while the rows were pinned to a dp
 * height capped at 11 — so the horizontal pitch was two and a half times the
 * vertical one and the field read as a set of stripes rather than as a
 * calendar. Rows also went missing: a launcher that over-reports its height
 * leaves the nested LinearLayouts short, and RemoteViews resolves that by
 * giving the last children no height at all, which is why a seven-row grid
 * arrived on the home screen with five rows in it.
 *
 * One bitmap has neither problem. The pitch is equal in both axes by
 * construction, every row exists because it is painted rather than measured,
 * and `ContentScale.Fit` scales the whole field uniformly to whatever space
 * the widget really has — so it stays square however badly the launcher
 * describes itself. It is also the same technique the type and the sigil on
 * these widgets already use.
 */
object DotFieldRenderer {

    /** Internal pitch. Near enough to the on-screen pitch to stay crisp. */
    private const val PITCH_DP = 13f

    /** Share of a cell the mark occupies at each intensity. */
    private val SCALES = floatArrayOf(0.26f, 0.44f, 0.62f, 0.82f, 1.0f)
    private val ALPHAS = floatArrayOf(0.26f, 0.46f, 0.66f, 0.84f, 1.0f)

    /** The gap between two marks, as a share of the pitch. */
    private const val GAP_SHARE = 0.30f

    fun render(
        context: Context,
        days: List<WidgetState.DayCell>,
        columns: Int,
        rows: Int,
        ink: Int,
        accent: Int,
        /** Alpha for a cell with no day behind it — the grid's own ghost. */
        emptyAlpha: Float,
        /**
         * Widget B's source pin has no accent colour at all, so there today
         * reads through size alone and this is false.
         */
        markToday: Boolean = true,
    ): ImageProvider {
        val pitch = PITCH_DP * context.resources.displayMetrics.density
        val cell = pitch * (1f - GAP_SHARE)

        val width = (pitch * columns).toInt().coerceAtLeast(1)
        val height = (pitch * rows).toInt().coerceAtLeast(1)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        // Column-major, oldest week on the left, same as the payload.
        val visible = days.takeLast(columns * rows)

        for (col in 0 until columns) {
            for (row in 0 until rows) {
                val day = visible.getOrNull(col * rows + row)
                val level = day?.level ?: 0
                val today = markToday && day?.isToday == true

                paint.color = when {
                    today -> accent
                    day == null -> withAlpha(ink, emptyAlpha)
                    else -> withAlpha(ink, ALPHAS[level])
                }

                val size = cell * if (today) 1f else SCALES[level]
                val cx = col * pitch + pitch / 2f
                val cy = row * pitch + pitch / 2f
                val box = RectF(cx - size / 2f, cy - size / 2f, cx + size / 2f, cy + size / 2f)

                // A peak day squares off, so intensity is legible in the mark's
                // shape as well as in its size — the widget is often looked at
                // from across a room.
                if (today || level >= 4) {
                    val radius = size * 0.22f
                    canvas.drawRoundRect(box, radius, radius, paint)
                } else {
                    canvas.drawCircle(cx, cy, size / 2f, paint)
                }
            }
        }

        return ImageProvider(bitmap)
    }

    private fun withAlpha(color: Int, alpha: Float): Int =
        Color.argb(
            (alpha.coerceIn(0f, 1f) * 255f).toInt(),
            Color.red(color),
            Color.green(color),
            Color.blue(color),
        )
}
