package app.githuh.widget

import android.content.Context
import android.content.res.ColorStateList
import android.os.Build
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import app.githuh.MainActivity
import app.githuh.R

/**
 * The home-screen card: **one of your own commit messages, travelling**, and
 * the field of the days under it. Nothing else — the counts are on every
 * screen in the app and are the least interesting thing on a home screen.
 *
 * The surface follows the wallpaper ([WidgetSurface]). Today is a plus rather
 * than a coloured square, so the field reads through shape like every other
 * mark on it; there is no accent colour anywhere on the card.
 *
 * The strip travels right to left and carries the repository each line was
 * written in after it, in the faint ink, so a line says where the work was as
 * well as what it was. It runs several of your messages in a loop that starts
 * on screen and never empties; see `res/layout/widget_strip.xml` and
 * `TextRenderer.strip` for what that took. A card with no line to run simply
 * runs none — the handle is never a stand-in.
 */
private const val ROWS = 7

/** One border, every side. */
private val WIDGET_PADDING = 14.dp

/** The strip, the size it is painted at, and the space under it. */
private const val STRIP_SP = 11f
private val STRIP_HEIGHT = 18.dp
private val STRIP_GAP = 8.dp

/** A reported dp measurement in the pixels the bitmap has to be painted in. */
private fun Dp.toPx(context: Context): Int =
    (value * context.resources.displayMetrics.density).toInt()

/**
 * Every mark is painted in one ink, white, with its weight in the alpha, and
 * the launcher tints it: black by day, white at night. The surface is a
 * day/night colour as well, so when the phone changes scheme the launcher
 * re-resolves both on the spot. Ink decided here instead would stay behind
 * until the next redraw — white type on a card that had just turned pale.
 */
private val INK = Color(0xFFFFFFFF)
private val FAINT = Color(0x8CFFFFFF)
private val DAY_INK = Color(0xFF000000)
private val NIGHT_INK = Color(0xFFFFFFFF)
private val TINT = ColorFilter.tint(ColorProvider(day = DAY_INK, night = NIGHT_INK))

class GitHuhWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val state = WidgetState.read(context)
        provideContent {
            GlanceTheme { Content(state) }
        }
    }
}

@androidx.compose.runtime.Composable
private fun Content(state: WidgetState?) {
    val context = LocalContext.current
    val day = Color(WidgetSurface.color(context, night = false))
    val night = Color(WidgetSurface.color(context, night = true))

    // Not Scaffold: it pads the sides and the ends by different amounts. One
    // padding on all four sides, and the background drawn here rather than
    // under someone else's insets.
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(day = day, night = night))
            .cornerRadius(android.R.dimen.system_app_widget_background_radius)
            .padding(WIDGET_PADDING)
            .clickable(actionStartActivity(MainActivity::class.java)),
        verticalAlignment = Alignment.Top,
    ) {
        if (state == null) {
            EmptyContent(context)
        } else {
            FilledContent(context, state, LocalSize.current)
        }
    }
}

@androidx.compose.runtime.Composable
private fun androidx.glance.layout.ColumnScope.EmptyContent(context: Context) {
    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            provider = GlyphRenderer.render(context, 16f, INK.toArgb()),
            contentDescription = null,
            colorFilter = TINT,
        )
        Spacer(GlanceModifier.height(8.dp))
        Image(
            provider = TextRenderer.render(
                context,
                "open the app to connect",
                9f,
                FAINT.toArgb(),
            ),
            contentDescription = null,
            colorFilter = TINT,
        )
    }
}

@androidx.compose.runtime.Composable
private fun androidx.glance.layout.ColumnScope.FilledContent(
    context: Context,
    state: WidgetState,
    size: DpSize,
) {
    // The card's own padding is already taken off by the Column above; these
    // are the box the content actually has, and the field is whatever the
    // strip leaves of it.
    val innerWidth = size.width - (WIDGET_PADDING * 2)
    val lines = state.linesFromToday()
    val chrome = if (lines.isEmpty()) 0.dp else STRIP_HEIGHT + STRIP_GAP
    val fieldHeight = (size.height - (WIDGET_PADDING * 2) - chrome).coerceAtLeast(28.dp)

    if (lines.isNotEmpty()) {
        Strip(context, lines, innerWidth)
        Spacer(GlanceModifier.height(STRIP_GAP))
    }

    Image(
        provider = DotFieldRenderer.render(
            context = context,
            days = state.days,
            widthPx = innerWidth.toPx(context),
            heightPx = fieldHeight.toPx(context),
            rows = ROWS,
            ink = INK.toArgb(),
            emptyAlpha = 0.07f,
        ),
        contentDescription = "${state.todayCount} contributions today",
        contentScale = ContentScale.Fit,
        colorFilter = TINT,
        modifier = GlanceModifier.fillMaxWidth().height(fieldHeight),
    )
}

/**
 * The travelling line.
 *
 * Each child of the flipper holds the next card-width of the loop, so the
 * hand-over from one turn to the next lands on identical pixels — and a
 * launcher that declines to run the animation still gets a strip that advances
 * a width every turn rather than one that never moves at all.
 *
 * Nothing here starts the animation; the layout does, which is the only way a
 * widget can have one at all. It is deliberately *not* kicked off with
 * `setDisplayedChild` either: asking for an animated show while the view is
 * still being applied, off the window, leaves the card blank until the first
 * flip rescues it — a quarter of a minute of nothing. Shown plainly, the first
 * child rests at the start of the cycle, so the line is on the card from the
 * first frame and starts travelling at the first flip.
 *
 * Before API 31 a widget cannot be told the width of one of its own views, so
 * the strip cannot be carried past its own length and it is printed still,
 * clipped to the card. Android 11 and older get a card that does not move.
 */
@androidx.compose.runtime.Composable
private fun Strip(
    context: Context,
    lines: List<WidgetState.Line>,
    innerWidth: Dp,
) {
    val first = lines.firstOrNull() ?: return

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        Image(
            provider = TextRenderer.render(
                context,
                if (first.repo.isBlank()) first.message else "${first.message}   ${first.repo}",
                STRIP_SP,
                INK.toArgb(),
                maxWidthDp = innerWidth.value,
            ),
            contentDescription = first.message,
            colorFilter = TINT,
        )
        return
    }

    val frames = TextRenderer.strip(
        context = context,
        lines = lines,
        unitPx = innerWidth.toPx(context),
        ink = INK.toArgb(),
        faint = FAINT.toArgb(),
        sizeSp = STRIP_SP,
    )

    val ids = intArrayOf(R.id.strip_a, R.id.strip_b, R.id.strip_c)
    val views = RemoteViews(context.packageName, R.layout.widget_strip).apply {
        for ((index, id) in ids.withIndex()) {
            val frame = frames[index % frames.size]
            setImageViewBitmap(id, frame)
            setViewLayoutWidth(id, frame.width.toFloat(), TypedValue.COMPLEX_UNIT_PX)
            // The same day/night tint as the Glance images, for the one view
            // Glance does not draw.
            setColorStateList(
                id,
                "setImageTintList",
                ColorStateList.valueOf(DAY_INK.toArgb()),
                ColorStateList.valueOf(NIGHT_INK.toArgb()),
            )
        }
    }

    AndroidRemoteViews(views, GlanceModifier.fillMaxWidth().height(STRIP_HEIGHT))
}
