package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.annotation.FontRes
import androidx.core.content.res.ResourcesCompat
import androidx.glance.ImageProvider
import app.githuh.R
import kotlin.math.ceil

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
     * The travelling line as one bitmap: the message in the ink, the
     * repository after it in the faint ink.
     *
     * A Bitmap rather than an ImageProvider, because the view that carries it
     * has to be laid out to exactly this width — the animation that takes the
     * strip off the left of the card is expressed as "its own width", so a
     * view any wider or narrower than the line either cuts the message short
     * or leaves a long wait after it.
     */
    fun strip(
        context: Context,
        message: String,
        repo: String,
        ink: Int,
        faint: Int,
        sizeSp: Float,
        @FontRes font: Int = R.font.ibmplexmono,
    ): Bitmap {
        val inkPaint = paint(context, sizeSp, ink, font, 0f)
        val faintPaint = paint(context, sizeSp, faint, font, 0f)

        val head = if (repo.isBlank()) message else "$message   "
        val headWidth = inkPaint.measureText(head)
        val tailWidth = if (repo.isBlank()) 0f else faintPaint.measureText(repo)

        val metrics = inkPaint.fontMetrics
        val width = ceil(headWidth + tailWidth).toInt().coerceAtLeast(1)
        val height = ceil(metrics.descent - metrics.ascent).toInt().coerceAtLeast(1)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawText(head, 0f, -metrics.ascent, inkPaint)
        if (repo.isNotBlank()) canvas.drawText(repo, headWidth, -metrics.ascent, faintPaint)
        return bitmap
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
