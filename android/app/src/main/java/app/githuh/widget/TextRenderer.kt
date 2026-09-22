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
 * RemoteViews cannot load custom fonts, so widget text is painted onto a
 * bitmap and handed over as an image. Bitmaps are rendered fresh at every
 * recomposition, which lets the colour follow the day/night configuration.
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
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            this.typeface = typeface(context, font)
            this.textSize = sizeSp * context.resources.displayMetrics.scaledDensity
            this.color = color
            this.letterSpacing = letterSpacing
        }

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
