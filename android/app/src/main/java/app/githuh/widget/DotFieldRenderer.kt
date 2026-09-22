package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import androidx.glance.ImageProvider
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The contribution field, painted as one bitmap.
 *
 * It used to be a Glance `Column` of `Row`s of weighted `Box`es, and that
 * layout could not produce a square grid — the pitch came out two and a half
 * times wider than tall, and a launcher that over-reported its height lost the
 * last rows altogether. One bitmap has neither problem: the pitch is equal in
 * both axes by construction, and `ContentScale.Fit` scales it uniformly. It is
 * painted **at the shape of the box it is going into**, the only way the field
 * lines up with the strip above it.
 *
 * Two rules decide what goes where, and both are about reading the card from
 * across a room:
 *
 * 1. **The newest day is the bottom-right mark.** Days run down each column
 *    and then on to the next, oldest top-left, so the last mark on the card is
 *    today — always the same corner, whatever weekday it is. The field used to
 *    keep GitHub's weekday rows, which put today halfway up the last column
 *    with the rest of the week drawn as empty days that had not happened yet.
 *
 * 2. **A long quiet stretch is a wave, not a wall of empty dots.** Three weeks
 *    or more without a contribution is drawn as the app's hand-drawn rule with
 *    its length written over it — `5 wk`, `4 mo` — and the columns it would have
 *    taken go to days that had something in them. A year with one busy spring
 *    used to be a card of ghost dots with the spring pushed off the left edge;
 *    now the spring is on the card and the silence is one honest line.
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
     * How long a run of empty days has to be before it becomes a wave. Three
     * weeks is three columns, and a wave is three columns wide, so collapsing
     * a stretch can never cost the card room — it only ever gives some back.
     */
    private const val QUIET_DAYS = 21
    private const val QUIET_COLUMNS = 3

    private sealed interface Piece
    /** Days to draw as marks, newest first. */
    private class Marks(val days: List<WidgetState.DayCell>) : Piece
    /** A stretch with nothing in it, and how many days it lasted. */
    private class Quiet(val days: Int) : Piece

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
        val density = context.resources.displayMetrics.density

        val room = height.toFloat() / rows
        val ceiling = MAX_PITCH_DP * density
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

        // Laid out from the right edge leftwards, newest piece first. Nothing
        // after today is drawn: a payload written before 3.1 pads today's week
        // out to seven days, and those blanks would otherwise sit in the
        // corner that belongs to today until the app next syncs.
        val end = days.indexOfLast { it.isToday }
        val history = if (end >= 0) days.subList(0, end + 1) else days
        var column = columns
        val pieces = piecesOf(history)
        for ((index, piece) in pieces.withIndex()) {
            if (column <= 0) break
            when (piece) {
                is Marks -> {
                    for ((k, day) in piece.days.withIndex()) {
                        val col = column - 1 - k / rows
                        if (col < 0) break
                        val row = rows - 1 - k % rows
                        mark(canvas, paint, day, ink,
                            cx = left + col * pitch + pitch / 2f,
                            cy = top + row * pitch + pitch / 2f,
                            cell = cell)
                    }
                    column -= ceil(piece.days.size / rows.toFloat()).toInt()
                }
                is Quiet -> {
                    // The oldest silence runs out to the card's edge: it is
                    // quiet since before anything the card can show.
                    val last = index == pieces.lastIndex
                    val span = if (last) column else minOf(QUIET_COLUMNS, column)
                    if (span < 2) break
                    quiet(context, canvas, piece.days, ink,
                        from = left + (column - span) * pitch,
                        to = left + column * pitch,
                        top = top, pitch = pitch, rows = rows, density = density)
                    column -= span
                }
            }
        }

        // Whatever is left on the left is before the history the app sent —
        // an account younger than the card. Drawn as the grid's ghost, as it
        // always was, so it reads as "no days here" rather than as a hole.
        for (col in 0 until column) {
            for (row in 0 until rows) {
                paint.color = withAlpha(ink, emptyAlpha)
                canvas.drawCircle(
                    left + col * pitch + pitch / 2f,
                    top + row * pitch + pitch / 2f,
                    cell * SCALES[0] / 2f,
                    paint,
                )
            }
        }

        return ImageProvider(bitmap)
    }

    /**
     * The days, newest first, cut into runs of marks and long silences. Today
     * is always a mark, whatever it holds: the corner it sits in is the one
     * fixed point on the card.
     */
    private fun piecesOf(days: List<WidgetState.DayCell>): List<Piece> {
        val pieces = ArrayList<Piece>()
        val marks = ArrayList<WidgetState.DayCell>()
        var i = days.lastIndex
        while (i >= 0) {
            val day = days[i]
            if (day.level > 0 || day.isToday) {
                marks.add(day)
                i--
                continue
            }
            var j = i
            while (j >= 0 && days[j].level == 0 && !days[j].isToday) j--
            val run = i - j
            if (run >= QUIET_DAYS) {
                if (marks.isNotEmpty()) pieces.add(Marks(ArrayList(marks)))
                marks.clear()
                pieces.add(Quiet(run))
            } else {
                for (k in i downTo j + 1) marks.add(days[k])
            }
            i = j
        }
        if (marks.isNotEmpty()) pieces.add(Marks(marks))
        return pieces
    }

    private fun mark(
        canvas: Canvas,
        paint: Paint,
        day: WidgetState.DayCell,
        ink: Int,
        cx: Float,
        cy: Float,
        cell: Float,
    ) {
        // Today is a plus. It used to be the one red mark in the whole
        // project, and a single accent colour is the one thing this app's
        // language does not do — so today reads through shape, in the same
        // ink as every other day.
        if (day.isToday) {
            paint.color = withAlpha(ink, 1f)
            plus(canvas, paint, cx, cy, cell)
            return
        }
        val level = day.level.coerceIn(0, 4)
        paint.color = withAlpha(ink, ALPHAS[level])
        val size = cell * SCALES[level]
        // A peak day squares off, so intensity is legible in the mark's shape
        // as well as in its size.
        if (level >= 4) {
            val box = RectF(cx - size / 2f, cy - size / 2f, cx + size / 2f, cy + size / 2f)
            canvas.drawRoundRect(box, size * 0.22f, size * 0.22f, paint)
        } else {
            canvas.drawCircle(cx, cy, size / 2f, paint)
        }
    }

    /**
     * A silence: the wave the app draws between written things, across the
     * middle of the field, with how long it lasted written above it.
     */
    private fun quiet(
        context: Context,
        canvas: Canvas,
        days: Int,
        ink: Int,
        from: Float,
        to: Float,
        top: Float,
        pitch: Float,
        rows: Int,
        density: Float,
    ) {
        val inset = pitch * 0.35f
        val middle = top + pitch * rows * 0.58f
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.25f * density
            strokeCap = Paint.Cap.ROUND
            color = withAlpha(ink, 0.5f)
        }
        val amplitude = pitch * 0.14f
        val wavelength = pitch * 0.82f
        val length = to - from - inset * 2f
        if (length > 0f) {
            val steps = ceil(length / (2f * density)).toInt().coerceAtLeast(2)
            val path = Path()
            for (step in 0..steps) {
                val along = length * step / steps
                val across = middle + sin(along / wavelength * 2.0 * PI).toFloat() * amplitude
                if (step == 0) path.moveTo(from + inset, across) else path.lineTo(from + inset + along, across)
            }
            canvas.drawPath(path, stroke)
        }

        val label = TextRenderer.labelPaint(context, pitch * 0.62f, withAlpha(ink, 0.72f))
        canvas.drawText(howLong(days), (from + to) / 2f, middle - amplitude - pitch * 0.55f, label)
    }

    /** `3 wk`, `5 mo`, `1 yr` — short enough to sit over three columns. */
    private fun howLong(days: Int): String = when {
        days < 56 -> "${(days / 7f).roundToInt()} wk"
        days < 365 -> "${(days / 30.44f).roundToInt().coerceAtLeast(2)} mo"
        else -> "${(days / 365.25f).roundToInt().coerceAtLeast(1)} yr"
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
