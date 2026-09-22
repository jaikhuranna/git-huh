package app.githuh.widget

import android.content.Context
import android.content.res.Configuration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
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
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.components.Scaffold
import androidx.glance.appwidget.provideContent
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width
import app.githuh.MainActivity

/**
 * Widget A — the Material You one.
 *
 * The surface is not hardcoded. JS resolves nothing-mtui's widgetBg token
 * (neutral1/50 light, neutral1/900 dark) against this device's live palette,
 * read back over the bridge from android.R.color.system_*, and ships both
 * modes in the sync payload. So the card tracks the user's wallpaper the way
 * com.nothing.communitywidgets does.
 *
 * This is the only file in the project where Nothing red is allowed: it is
 * the package's own widgetFood token.
 *
 * The masthead is **one of your own commit messages**, picked by the date and
 * held for the day. It replaced the sigil and the `~handle` because those two
 * elements spent a line of a very small card telling their owner their own
 * name; a line out of your history is the thing on this card you cannot get
 * by looking at the phone.
 *
 * The handle is not a fallback for it either. A card that printed the pool
 * when it had one and the handle when it did not was showing the handle far
 * more often than intended — an empty sync used to erase the pool — so a
 * card with no line to print now simply goes without a masthead.
 */
private const val ROWS = 7

private val WIDGET_PADDING = 14.dp

/** Masthead + the hero line + footer + the spacers between them. */
private val CHROME_HEIGHT = 84.dp

private fun parse(hex: String?, fallback: Color): Color =
    hex?.takeIf { it.isNotBlank() }
        ?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() }
        ?: fallback

/**
 * Bitmap text cannot be swapped by a ColorProvider, so the ink colour has to
 * be decided while composing. The background still gets a day/night provider
 * so the surface itself flips even without a fresh bitmap.
 */
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

    Scaffold(
        backgroundColor = ColorProvider(day = light, night = dark),
        horizontalPadding = WIDGET_PADDING,
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity(MainActivity::class.java)),
    ) {
        if (state == null) {
            EmptyContent(context, ink, faint)
        } else {
            FilledContent(context, state, LocalSize.current, ink, faint)
        }
    }
}

@androidx.compose.runtime.Composable
private fun EmptyContent(context: Context, ink: Color, faint: Color) {
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
private fun FilledContent(
    context: Context,
    state: WidgetState,
    size: DpSize,
    ink: Color,
    faint: Color,
) {
    val innerWidth = size.width - (WIDGET_PADDING * 2)
    val fieldHeight = (size.height - CHROME_HEIGHT).coerceIn(28.dp, 104.dp)

    // Only the *shape* of the box is taken from the reported size, never its
    // absolute value: launchers under-report both dimensions, but they tend to
    // get the ratio right, and the field is scaled to fit whatever space it
    // actually lands in. Seven rows of weeks against a wide, short card wants
    // more columns than a square one.
    val aspect = (innerWidth / fieldHeight).coerceIn(1.4f, 3.4f)
    val columns = (ROWS * aspect).toInt().coerceIn(10, 24)

    val red = parse(state.food, Color(0xFFD71921))

    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val line = state.lineOfTheDay()
        if (line != null) {
            Image(
                provider = TextRenderer.render(
                    context,
                    line,
                    10f,
                    ink.toArgb(),
                    maxWidthDp = innerWidth.value,
                ),
                contentDescription = line,
            )

            Spacer(GlanceModifier.height(8.dp))
        }

        Row(verticalAlignment = Alignment.Bottom) {
            Image(
                provider = TextRenderer.render(
                    context,
                    "%,d".format(state.todayCount),
                    22f,
                    if (state.todayCount > 0) red.toArgb() else ink.toArgb(),
                ),
                contentDescription = "${state.todayCount} contributions today",
            )
            Spacer(GlanceModifier.width(6.dp))
            Image(
                provider = TextRenderer.render(context, "today", 8f, faint.toArgb()),
                contentDescription = null,
            )
        }

        Spacer(GlanceModifier.height(8.dp))

        Image(
            provider = DotFieldRenderer.render(
                context = context,
                days = state.days,
                columns = columns,
                rows = ROWS,
                ink = ink.toArgb(),
                accent = red.toArgb(),
                emptyAlpha = 0.07f,
            ),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = GlanceModifier.fillMaxWidth().height(fieldHeight),
        )

        Spacer(GlanceModifier.height(8.dp))

        Image(
            provider = TextRenderer.render(
                context,
                // The calendar total, which counts private work. The old
                // footer printed the public commit count next to a grid drawn
                // from the calendar, so the two disagreed on the same card.
                "%,d this year · %,d prs".format(state.total, state.openPrs),
                8f,
                faint.toArgb(),
                maxWidthDp = innerWidth.value,
            ),
            contentDescription = null,
        )
    }
}
