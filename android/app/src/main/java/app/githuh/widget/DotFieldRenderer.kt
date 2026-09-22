package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import androidx.glance.ImageProvider
import kotlin.math.ceil

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
 *
 * The bitmap is painted **at the shape of the box it is going into**, which is
 * the only way the field can line up with anything else on the card. A bitmap
 * of any other shape is letterboxed by `ContentScale.Fit`, and the field then
 * floats inside the card with margins that match neither the strip above it
 * nor each other. Only the *ratio* of the reported box is trusted — a launcher
 * that under-reports its size just gets a smaller bitmap scaled back up.
 */
object DotFieldRenderer {

    /**
     * Column bounds. A very wide card would otherwise ask for a year of weeks
     * at four pixels each, and a very narrow one for three.
     */
    private const val MIN_COLUMNS = 8
    private const val MAX_COLUMNS = 40

    /** The biggest a dot's cell is allowed to get, whatever room there is. */
    private const val MAX_PITCH_DP = 22f

    /** Share of a cell the mark occupies at each intensity. */
    private val SCALES = floatArrayOf(0.26f, 0.44f, 0.62f, 0.82f, 1.0f)
    private val ALPHAS = floatArrayOf(0.26f, 0.46f, 0.66f, 0.84f, 1.0f)

    /** The gap between two marks, as a share of the pitch. */
    private const val GAP_SHARE = 0.30f

    /**
     * The field, painted to fill a box `widthPx` by `heightPx` exactly.
     *
     * The pitch comes from the height — as many rows as there are days in a
     * week, as big as the box allows — and the column count is then whatever
     * fills the width at that pitch, so the grid runs from one edge of the
     * card's padding to the other. There is nothing left over to centre, which
     * is the point: the field's left edge is the strip's left edge.
     *
     * The weeks are laid out **from the right**. Today is always the last
     * column, and a payload holding less history than the card has room for
     * shows that as empty weeks on the left, where the missing history would
     * be — rather than as a block of dead grid to the right of today, which is
     * what indexing from the left did on any card wider than the payload.
     */
    fun render(
        context: Context,
        days: List<WidgetState.DayCell>,
        widthPx: Int,
        heightPx: Int,
        rows: Int,
        ink: Int,
        /** Alpha for a cell with no day behind it — the grid's own ghost. */
        emptyAlpha: Float,
    ): ImageProvider {
        val width = widthPx.coerceAtLeast(1)
        val height = heightPx.coerceAtLeast(1)

        val room = height.toFloat() / rows
        val ceiling = MAX_PITCH_DP * context.resources.displayMetrics.density
        val columns = ceil(width / minOf(room, ceiling))
            .toInt()
            .coerceIn(MIN_COLUMNS, MAX_COLUMNS)
        // `room` is the floor as well as the ceiling: on a card too narrow for
        // MIN_COLUMNS at this height, the grid keeps its square pitch and the
        // slack goes to the sides rather than the rows going oval.
        val pitch = minOf(width.toFloat() / columns, room)
        val cell = pitch * (1f - GAP_SHARE)
        val left = (width - pitch * columns) / 2f
        val top = (height - pitch * rows) / 2f

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        // Column-major, seven rows to a week, same as the payload.
        val visible = days.takeLast(columns * rows)
        val weeks = ceil(visible.size / rows.toFloat()).toInt()
        val offset = columns - weeks

        for (col in 0 until columns) {
            val week = col - offset
            for (row in 0 until rows) {
                val day = if (week < 0) null else visible.getOrNull(week * rows + row)
                val level = day?.level ?: 0
                val cx = left + col * pitch + pitch / 2f
                val cy = top + row * pitch + pitch / 2f

                // Today is a plus. It used to be the one red mark in the whole
                // project, and a single accent colour is the one thing this
                // app's language does not do — so today reads through shape
                // now, in the same ink as every other day.
                if (day?.isToday == true) {
                    paint.color = withAlpha(ink, 1f)
                    plus(canvas, paint, cx, cy, cell)
                    continue
                }

                paint.color =
                    if (day == null) withAlpha(ink, emptyAlpha) else withAlpha(ink, ALPHAS[level])

                val size = cell * SCALES[level]

                // A peak day squares off, so intensity is legible in the mark's
                // shape as well as in its size — the widget is often looked at
                // from across a room.
                if (level >= 4) {
                    val box = RectF(cx - size / 2f, cy - size / 2f, cx + size / 2f, cy + size / 2f)
                    canvas.drawRoundRect(box, size * 0.22f, size * 0.22f, paint)
                } else {
                    canvas.drawCircle(cx, cy, size / 2f, paint)
                }
            }
        }

        return ImageProvider(bitmap)
    }

    /**
     * Two bars on the cell's centre — the app's own mark, not a brand's. It
     * fills its cell exactly, like the square a peak day gets, so the grid's
     * pitch still reads through it.
     */
    private fun plus(canvas: Canvas, paint: Paint, cx: Float, cy: Float, cell: Float) {
        val arm = cell * 0.5f
        val bar = cell * 0.22f
        canvas.drawRect(cx - arm, cy - bar / 2f, cx + arm, cy + bar / 2f, paint)
        canvas.drawRect(cx - bar / 2f, cy - arm, cx + bar / 2f, cy + arm, paint)
    }

    private fun withAlpha(color: Int, alpha: Float): Int =
        Color.argb(
            (alpha.coerceIn(0f, 1f) * 255f).toInt(),
            Color.red(color),
            Color.green(color),
            Color.blue(color),
        )
}
