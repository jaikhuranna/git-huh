package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.annotation.FontRes
import androidx.core.content.res.ResourcesCompat
import androidx.glance.ImageProvider
import app.githuh.R
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.sin

/**
 * RemoteViews cannot be *handed* a Typeface, so widget text is painted onto a
 * bitmap and given over as an image. Bitmaps are rendered fresh at every
 * recomposition, which lets the colour follow the day/night configuration.
 *
 * The exception is widget A's strip, which has to be a real TextView to move:
 * a layout inflated from this package can name the face in XML, and that path
 * does resolve. Everything static stays a bitmap.
 *
 * Both widgets speak IBM Plex Mono — the board's typewriter voice. The
 * dot-matrix face the 2.0 widgets used is gone along with the rest of the
 * Nothing styling.
 */
object TextRenderer {

    /**
     * Card-widths in one turn of the strip. The bitmap is one wider than this;
     * see `strip`. Keep it in step with `R.anim.strip_in`, whose `toXDelta` is
     * `-CYCLE_UNITS / (CYCLE_UNITS + 1)` of the bitmap's own width.
     */
    const val CYCLE_UNITS = 3

    /** The app's wave, from `Squiggle.tsx`, in the same units. */
    private const val AMPLITUDE_DP = 2.6f
    private const val WAVELENGTH_DP = 13f
    private const val STROKE_DP = 1.25f

    /** How much of a gap is left clear at each end of the wave. */
    private const val SQUIGGLE_INSET = 0.12f

    private val cache = HashMap<Int, Typeface>()

    @Synchronized
    private fun typeface(context: Context, @FontRes font: Int): Typeface? =
        cache.getOrPut(font) {
            ResourcesCompat.getFont(context, font) ?: Typeface.MONOSPACE
        }

    private fun paint(
        context: Context,
        sizeSp: Float,
        color: Int,
        @FontRes font: Int,
        letterSpacing: Float,
    ): TextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface(context, font)
        this.textSize = sizeSp * context.resources.displayMetrics.scaledDensity
        this.color = color
        this.letterSpacing = letterSpacing
    }

    /**
     * The strip's whole loop, painted as one bitmap.
     *
     * It is `CYCLE_UNITS + 1` card-widths across: the cycle itself, and then
     * the beginning of the cycle repeated once more. The animation carries the
     * view left by exactly the cycle — three quarters of this bitmap — so the
     * moment it wraps, the pixels in the card are the pixels that were already
     * there. There is no seam and there is no gap, which a strip that entered
     * from beyond the right edge had five seconds of at the top of every pass.
     *
     * As many of the account's lines as the cycle holds go into it, and the
     * space between them is stretched so the last one ends exactly where the
     * cycle does. A Bitmap rather than an ImageProvider because the view that
     * carries it has to be laid out to exactly this width.
     */
    fun strip(
        context: Context,
        lines: List<WidgetState.Line>,
        unitPx: Int,
        ink: Int,
        faint: Int,
        sizeSp: Float,
        @FontRes font: Int = R.font.ibmplexmono,
    ): Bitmap {
        val inkPaint = paint(context, sizeSp, ink, font, 0f)
        val faintPaint = paint(context, sizeSp, faint, font, 0f)
        val metrics = inkPaint.fontMetrics
        val height = ceil(metrics.descent - metrics.ascent).toInt().coerceAtLeast(1)

        val unit = unitPx.coerceAtLeast(1)
        val cycle = unit * CYCLE_UNITS
        val minGap = inkPaint.measureText("      ")

        val taken = ArrayList<Pair<WidgetState.Line, Float>>()
        var used = 0f
        for (line in lines) {
            val width = measure(line, inkPaint, faintPaint)
            if (taken.isEmpty()) {
                // The first line goes in whatever it costs, but not at the
                // price of a loop longer than the animation travels: a message
                // wider than the whole cycle is cut to fit it.
                val fitted = if (width <= cycle - minGap) line else clip(line, cycle - minGap, inkPaint, faintPaint)
                taken.add(fitted to measure(fitted, inkPaint, faintPaint))
                used += taken.last().second
                continue
            }
            if (used + width + minGap * (taken.size + 1) > cycle) break
            taken.add(line to width)
            used += width
        }
        if (taken.isEmpty()) return Bitmap.createBitmap(1, height, Bitmap.Config.ARGB_8888)

        val gap = ((cycle - used) / taken.size).coerceAtLeast(minGap)
        val span = used + gap * taken.size

        val bitmap = Bitmap.createBitmap(cycle + unit, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val baseline = -metrics.ascent

        val wave = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = faint
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = STROKE_DP * context.resources.displayMetrics.density
        }
        val middle = height / 2f

        // Drawn twice: the second run is clipped by the canvas and is only
        // there to fill the repeat at the end.
        var x = 0f
        while (x < bitmap.width) {
            for ((line, width) in taken) {
                draw(canvas, line, x, baseline, inkPaint, faintPaint)
                x += width
                // The space between two messages is a rule, not a hole: the
                // same wave the pull request screens separate written things
                // with, at the same amplitude and wavelength.
                squiggle(
                    canvas = canvas,
                    paint = wave,
                    from = x + gap * SQUIGGLE_INSET,
                    to = x + gap * (1f - SQUIGGLE_INSET),
                    middle = middle,
                    density = context.resources.displayMetrics.density,
                )
                x += gap
            }
            // A cycle shorter than it should be would drift; hold the start of
            // each run on the cycle boundary.
            x = (x - span) + maxOf(span, cycle.toFloat())
        }
        return bitmap
    }

    /**
     * `Squiggle.tsx`, painted: the app's hand-drawn rule, same amplitude and
     * wavelength, sampled every couple of pixels so the curve never shows its
     * facets. It is what fills the space between one commit message and the
     * next, so the strip reads as a line of writing rather than as two
     * messages with a hole between them.
     */
    private fun squiggle(
        canvas: Canvas,
        paint: Paint,
        from: Float,
        to: Float,
        middle: Float,
        density: Float,
    ) {
        val length = to - from
        if (length <= 0f) return

        val amplitude = AMPLITUDE_DP * density
        val wavelength = WAVELENGTH_DP * density
        val steps = ceil(length / (2f * density)).toInt().coerceAtLeast(2)

        val path = Path()
        for (step in 0..steps) {
            val along = length * step / steps
            val across = middle + sin(along / wavelength * 2.0 * PI).toFloat() * amplitude
            if (step == 0) path.moveTo(from, across) else path.lineTo(from + along, across)
        }
        canvas.drawPath(path, paint)
    }

    private fun clip(
        line: WidgetState.Line,
        limit: Float,
        ink: TextPaint,
        faint: TextPaint,
    ): WidgetState.Line {
        val room = limit - if (line.repo.isBlank()) 0f else faint.measureText(line.repo) + ink.measureText("   ")
        val message = TextUtils.ellipsize(line.message, ink, room.coerceAtLeast(0f), TextUtils.TruncateAt.END)
        return line.copy(message = message.toString())
    }

    private fun measure(line: WidgetState.Line, ink: TextPaint, faint: TextPaint): Float =
        if (line.repo.isBlank()) {
            ink.measureText(line.message)
        } else {
            ink.measureText("${line.message}   ") + faint.measureText(line.repo)
        }

    private fun draw(
        canvas: Canvas,
        line: WidgetState.Line,
        x: Float,
        baseline: Float,
        ink: TextPaint,
        faint: TextPaint,
    ) {
        if (line.repo.isBlank()) {
            canvas.drawText(line.message, x, baseline, ink)
            return
        }
        val head = "${line.message}   "
        canvas.drawText(head, x, baseline, ink)
        canvas.drawText(line.repo, x + ink.measureText(head), baseline, faint)
    }

    /**
     * `maxWidthDp` trims the text to fit rather than letting it run off the
     * card. A bitmap wider than its slot is not clipped by RemoteViews — it is
     * scaled down, which shrinks a whole line of type to nothing the moment a
     * long commit subject arrives. An ellipsis is the honest answer.
     */
    fun render(
        context: Context,
        text: String,
        sizeSp: Float,
        color: Int,
        @FontRes font: Int = R.font.ibmplexmono,
        letterSpacing: Float = 0f,
        maxWidthDp: Float = 0f,
    ): ImageProvider {
        val paint = paint(context, sizeSp, color, font, letterSpacing)

        val drawn = if (maxWidthDp > 0f) {
            val limit = maxWidthDp * context.resources.displayMetrics.density
            TextUtils.ellipsize(text, paint, limit, TextUtils.TruncateAt.END).toString()
        } else {
            text
        }

        val metrics = paint.fontMetrics
        val width = ceil(paint.measureText(drawn)).toInt().coerceAtLeast(1)
        val height = ceil(metrics.descent - metrics.ascent).toInt().coerceAtLeast(1)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(bitmap).drawText(drawn, 0f, -metrics.ascent, paint)
        return ImageProvider(bitmap)
    }
}
