package app.githuh.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
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

    fun render(
        context: Context,
        text: String,
        sizeSp: Float,
        color: Int,
        @FontRes font: Int = R.font.ibmplexmono,
        letterSpacing: Float = 0f,
    ): ImageProvider {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.typeface = typeface(context, font)
            this.textSize = sizeSp * context.resources.displayMetrics.scaledDensity
            this.color = color
            this.letterSpacing = letterSpacing
        }

        val metrics = paint.fontMetrics
        val width = ceil(paint.measureText(text)).toInt().coerceAtLeast(1)
        val height = ceil(metrics.descent - metrics.ascent).toInt().coerceAtLeast(1)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        Canvas(bitmap).drawText(text, 0f, -metrics.ascent, paint)
        return ImageProvider(bitmap)
    }
}
