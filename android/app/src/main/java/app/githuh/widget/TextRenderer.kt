package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import androidx.core.content.res.ResourcesCompat
import androidx.glance.ImageProvider
import app.githuh.R
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.sin

/**
 * RemoteViews cannot be *handed* a Typeface, and a layout inflated into the
 * launcher's process does not resolve `@font` either, so every word on the
 * card — the strip included — is painted onto a bitmap in IBM Plex Mono and
 * given over as an image. Bitmaps are painted fresh at every recomposition,
 * which lets the ink follow the day/night configuration.
 */
object TextRenderer {

    /**
     * Card-widths in one turn of the loop, and so the number of frames the
     * flipper holds. Each frame is two widths; a turn carries it one, which is
     * why `R.anim.strip_in` translates by `-50%` of a frame's own width and
     * why `widget_strip.xml` has exactly this many children.
     */
    const val CYCLE_UNITS = 3

    /** The app's wave, from `Squiggle.tsx`, in the same units. */
    private const val AMPLITUDE_DP = 2.6f
    private const val WAVELENGTH_DP = 13f
    private const val STROKE_DP = 1.25f

    /** How much of a gap is left clear at each end of the wave. */
    private const val SQUIGGLE_INSET = 0.12f

    @Volatile
    private var face: Typeface? = null

    /**
     * A paint for a label painted into another renderer's bitmap — the dot
     * field's "5 wk" over a quiet stretch — in the widget's own mono, at a
     * size in pixels chosen by the caller to suit its grid.
     */
    fun labelPaint(context: Context, sizePx: Float, color: Int): TextPaint =
        TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = plexMono(context)
            textSize = sizePx
            this.color = color
            textAlign = Paint.Align.CENTER
        }

    /** Loaded once; a font resource does not change while the process lives. */
    private fun plexMono(context: Context): Typeface =
        face ?: (ResourcesCompat.getFont(context, R.font.ibmplexmono) ?: Typeface.MONOSPACE)
            .also { face = it }

    private fun paint(context: Context, sizeSp: Float, color: Int): TextPaint =
        TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = plexMono(context)
            textSize = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_SP,
                sizeSp,
                context.resources.displayMetrics,
            )
            this.color = color
        }

    /**
     * The strip's loop, painted as one frame per card-width of it.
     *
     * Each frame is two card widths of the cycle, starting one width further
     * along than the last, and the flipper shows them in turn. That buys two
     * things at once. With animations, a frame slides exactly one width during
     * its turn and hands over to the next frame on identical pixels — a
     * continuous scroll with no seam. **Without** them — and some launchers
     * simply do not run a widget's animations — the frames still change every
     * turn, so the strip advances a card width at a time instead of freezing
     * on the same sentence forever.
     *
     * It also means a turn is one width rather than the whole cycle, so motion
     * resumes within seconds of anything that resets the flipper.
     */
    fun strip(
        context: Context,
        lines: List<WidgetState.Line>,
        unitPx: Int,
        ink: Int,
        faint: Int,
        sizeSp: Float,
    ): List<Bitmap> {
        val inkPaint = paint(context, sizeSp, ink)
        val faintPaint = paint(context, sizeSp, faint)
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
                val fitted =
                    if (width <= cycle - minGap) line
                    else clip(line, cycle - minGap, inkPaint, faintPaint)
                taken.add(fitted to measure(fitted, inkPaint, faintPaint))
                used += taken.last().second
                continue
            }
            if (used + width + minGap * (taken.size + 1) > cycle) break
            taken.add(line to width)
            used += width
        }
        if (taken.isEmpty()) {
            return listOf(Bitmap.createBitmap(1, height, Bitmap.Config.ARGB_8888))
        }

        val gap = ((cycle - used) / taken.size).coerceAtLeast(minGap)
        val density = context.resources.displayMetrics.density
        val wavePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = faint
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeWidth = STROKE_DP * density
        }
        val baseline = -metrics.ascent
        val middle = height / 2f

        return List(CYCLE_UNITS) { frame ->
            val bitmap = Bitmap.createBitmap(unit * 2, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.translate(-(frame * unit).toFloat(), 0f)

            // Two turns of the cycle, which is always enough to cover the two
            // widths this frame shows, wherever in the cycle it starts.
            var x = 0f
            repeat(2) { run ->
                x = (run * cycle).toFloat()
                for ((line, width) in taken) {
                    draw(canvas, line, x, baseline, inkPaint, faintPaint)
                    x += width
                    // The space between two messages is a rule, not a hole: the
                    // same wave the pull request screens separate written things
                    // with, at the same amplitude and wavelength.
                    squiggle(
                        canvas = canvas,
                        paint = wavePaint,
                        from = x + gap * SQUIGGLE_INSET,
                        to = x + gap * (1f - SQUIGGLE_INSET),
                        middle = middle,
                        density = density,
                    )
                    x += gap
                }
            }
            bitmap
        }
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
        maxWidthDp: Float = 0f,
    ): ImageProvider {
        val paint = paint(context, sizeSp, color)

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
