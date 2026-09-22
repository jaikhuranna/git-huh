package app.githuh.widget

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
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
 * Widget A — the Material You one.
 *
 * The surface is not hardcoded. JS resolves nothing-mtui's widgetBg token
 * (neutral1/50 light, neutral1/900 dark) against this device's live palette,
 * read back over the bridge from android.R.color.system_*, and ships both
 * modes in the sync payload. So the card tracks the user's wallpaper the way
 * com.nothing.communitywidgets does.
 *
 * Nothing's red is **not** here any more, and now sits nowhere in the project:
 * today is a plus rather than a coloured square, so the field reads through
 * shape like every other mark on it. Only the surface is still the package's.
 *
 * The card is **one of your own commit messages, travelling**, and the field
 * of the days under it. Nothing else: the counts that used to sit between
 * them — `7 today`, `448 this year · 6 prs` — are on every screen in the app
 * and were the least interesting thing on the home screen.
 *
 * The strip travels right to left and carries the repository it was written
 * in at its end, in the faint ink, so a line says where the work was as well
 * as what it was. It is the one view on either widget that is not a bitmap —
 * a bitmap cannot move; see `res/layout/widget_strip.xml` for what it took.
 *
 * The handle is not a fallback for any of it. A card that printed the pool
 * when it had one and the handle when it did not was showing the handle far
 * more often than intended — an empty sync used to erase the pool — so a
 * card with no line to run simply runs none.
 */
private const val ROWS = 7

/** One border, every side. */
private val WIDGET_PADDING = 14.dp

/** The strip, the size it is painted at, and the space under it. */
private const val STRIP_SP = 11f
private val STRIP_HEIGHT = 18.dp
private val STRIP_GAP = 8.dp

/**
 * Bitmap text cannot be swapped by a ColorProvider, so the ink colour has to
 * be decided while composing. The background still gets a day/night provider
 * so the surface itself flips even without a fresh bitmap.
 */
/** A reported dp measurement in the pixels the bitmap has to be painted in. */
private fun Dp.toPx(context: Context): Int =
    (value * context.resources.displayMetrics.density).toInt()

private fun isNight(context: Context): Boolean =
    (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES

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
    val night = isNight(context)

    // Read live rather than taken from the payload: the payload's copy is a
    // snapshot from the last sync, so changing the system colour left the card
    // on its old background until the app was reopened.
    val light = Color(NothingMtui.widgetBg(context, dark = false, payload = state?.bgLight))
    val dark = Color(NothingMtui.widgetBg(context, dark = true, payload = state?.bgDark))

    // widgetElements: #000000 in light, #ffffff in dark.
    val ink = if (night) Color(0xFFFFFFFF) else Color(0xFF000000)
    val faint = if (night) Color(0x8CFFFFFF) else Color(0x8C000000)

    // Not Scaffold: it pads the sides and the top and bottom by different
    // amounts, so the card's border was never the same width twice. One
    // padding, all four sides, and the background drawn here rather than
    // under someone else's insets.
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .background(ColorProvider(day = light, night = dark))
            .cornerRadius(android.R.dimen.system_app_widget_background_radius)
            .padding(WIDGET_PADDING)
            .clickable(actionStartActivity(MainActivity::class.java)),
        verticalAlignment = Alignment.Top,
    ) {
        if (state == null) {
            EmptyContent(context, ink, faint)
        } else {
            FilledContent(context, state, LocalSize.current, ink, faint)
        }
    }
}

@androidx.compose.runtime.Composable
private fun androidx.glance.layout.ColumnScope.EmptyContent(
    context: Context,
    ink: Color,
    faint: Color,
) {
    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            provider = GlyphRenderer.render(context, 16f, ink.toArgb()),
            contentDescription = null,
        )
        Spacer(GlanceModifier.height(8.dp))
        Image(
            provider = TextRenderer.render(
                context,
                "open the app to connect",
                9f,
                faint.toArgb(),
            ),
            contentDescription = null,
        )
    }
}

@androidx.compose.runtime.Composable
private fun androidx.glance.layout.ColumnScope.FilledContent(
    context: Context,
    state: WidgetState,
    size: DpSize,
    ink: Color,
    faint: Color,
) {
    // The card's own padding is already taken off by the Column above; these
    // are the box the content actually has, and the field is whatever the
    // strip leaves of it.
    val innerWidth = size.width - (WIDGET_PADDING * 2)
    val line = state.lineOfTheDay()
    val chrome = if (line == null) 0.dp else STRIP_HEIGHT + STRIP_GAP
    val fieldHeight = (size.height - (WIDGET_PADDING * 2) - chrome).coerceAtLeast(28.dp)

    if (line != null) {
        Strip(context, line, innerWidth, ink, faint)
        Spacer(GlanceModifier.height(STRIP_GAP))
    }

    Image(
        provider = DotFieldRenderer.render(
            context = context,
            days = state.days,
            widthPx = innerWidth.toPx(context),
            heightPx = fieldHeight.toPx(context),
            rows = ROWS,
            ink = ink.toArgb(),
            emptyAlpha = 0.07f,
        ),
        contentDescription = "${state.todayCount} contributions today",
        contentScale = ContentScale.Fit,
        modifier = GlanceModifier.fillMaxWidth().height(fieldHeight),
    )
}

/**
 * The travelling line.
 *
 * Both children of the flipper carry the same painted line, so the pass that
 * arrives is the pass that just left and the strip reads as continuous.
 * Nothing here starts the animation — the layout does, which is the only way
 * a widget can have one. `setDisplayedChild` is only to bring the first pass
 * forward: a ViewFlipper shows its first child without animating it, which
 * would leave the line sitting still for a whole interval after every sync.
 *
 * Before API 31 a widget cannot be told the width of one of its own views, so
 * the strip cannot be carried past its own length and it is printed still,
 * clipped to the card. Android 11 and older get a card that does not move.
 */
@androidx.compose.runtime.Composable
private fun Strip(
    context: Context,
    line: WidgetState.Line,
    innerWidth: Dp,
    ink: Color,
    faint: Color,
) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        Image(
            provider = TextRenderer.render(
                context,
                if (line.repo.isBlank()) line.message else "${line.message}   ${line.repo}",
                STRIP_SP,
                ink.toArgb(),
                maxWidthDp = innerWidth.value,
            ),
            contentDescription = line.message,
        )
        return
    }

    val bitmap = TextRenderer.strip(
        context = context,
        message = line.message,
        repo = line.repo,
        ink = ink.toArgb(),
        faint = faint.toArgb(),
        sizeSp = STRIP_SP,
    )

    val views = RemoteViews(context.packageName, R.layout.widget_strip).apply {
        for (id in intArrayOf(R.id.strip_a, R.id.strip_b)) {
            setImageViewBitmap(id, bitmap)
            setViewLayoutWidth(id, bitmap.width.toFloat(), TypedValue.COMPLEX_UNIT_PX)
        }
        setDisplayedChild(R.id.strip, 1)
    }

    AndroidRemoteViews(views, GlanceModifier.fillMaxWidth().height(STRIP_HEIGHT))
}
