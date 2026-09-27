package app.githuh.widget

import android.content.Context
import android.os.Build

/**
 * The card's surface: the Material You neutral the system's own widgets sit on,
 * `system_neutral1_50` by day and `system_neutral1_900` at night — the mapping
 * Nothing's community widgets use. It follows the wallpaper, so it is read
 * while the card is composed rather than carried in the sync payload, which
 * would keep the old colour after the system's had changed.
 *
 * Android 11 and older have no dynamic palette and get fixed tones, the same
 * ones the iOS widget uses.
 */
object WidgetSurface {

    private val STATIC_DAY = 0xFFE5E5E5.toInt()
    private val STATIC_NIGHT = 0xFF1B1B1B.toInt()

    fun color(context: Context, night: Boolean): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getColor(
                if (night) android.R.color.system_neutral1_900 else android.R.color.system_neutral1_50,
            )
        } else {
            if (night) STATIC_NIGHT else STATIC_DAY
        }
}
