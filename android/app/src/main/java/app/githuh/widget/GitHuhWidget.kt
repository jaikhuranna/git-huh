package app.githuh.widget

import android.content.Context
import android.content.res.Configuration
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
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.components.Scaffold
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.size
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
 */
private const val ROWS = 7

private val WIDGET_PADDING = 14.dp
private val DOT_GAP = 3.dp
private val TARGET_DOT = 9.dp

/** Handle row + the hero line + footer + the spacers between them. */
private val CHROME_HEIGHT = 76.dp

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
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                provider = GlyphRenderer.render(context, 16f, ink.toArgb()),
                contentDescription = null,
            )
            Spacer(GlanceModifier.width(8.dp))
            Image(
                provider = TextRenderer.render(context, "~githuh", 11f, faint.toArgb()),
                contentDescription = "git-huh?",
            )
        }
        Spacer(GlanceModifier.height(6.dp))
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

    // The reported size is only a hint for how many week-columns to show.
    // Launchers under-report it often enough that laying the grid out at a
    // fixed pitch left it stranded in the left quarter of the card, so the
    // columns are weighted and fill whatever width actually exists.
    val columns = ((innerWidth + DOT_GAP) / (TARGET_DOT + DOT_GAP))
        .toInt()
        .coerceIn(10, 20)
    // Derive the row pitch from the height that is actually left after the
    // handle, the hero number and the footer, or the bottom rows of the week
    // get clipped off a short widget.
    val cellHeight = ((size.height - CHROME_HEIGHT - DOT_GAP * (ROWS - 1)) / ROWS)
        .coerceIn(4.dp, 11.dp)

    val red = parse(state.food, Color(0xFFD71921))

    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                provider = GlyphRenderer.render(context, 18f, ink.toArgb()),
                contentDescription = null,
            )
            Spacer(GlanceModifier.width(8.dp))
            Image(
                provider = TextRenderer.render(
                    context,
                    "~${state.login.lowercase()}",
                    10f,
                    faint.toArgb(),
                ),
                contentDescription = state.login,
            )
        }

        Spacer(GlanceModifier.height(6.dp))

        Row(verticalAlignment = Alignment.Bottom) {
            Image(
                provider = TextRenderer.render(
                    context,
                    "%,d".format(state.todayCommits),
                    22f,
                    if (state.todayCommits > 0) red.toArgb() else ink.toArgb(),
                ),
                contentDescription = "${state.todayCommits} commits today",
            )
            Spacer(GlanceModifier.width(6.dp))
            Image(
                provider = TextRenderer.render(context, "today", 8f, faint.toArgb()),
                contentDescription = null,
            )
        }

        Spacer(GlanceModifier.height(8.dp))

        DotMatrix(state, columns, cellHeight, ink, red)

        Spacer(GlanceModifier.height(6.dp))

        Image(
            provider = TextRenderer.render(
                context,
                "%,d commits · %,d prs".format(state.totalCommits, state.openPrs),
                8f,
                faint.toArgb(),
            ),
            contentDescription = null,
        )
    }
}

@androidx.compose.runtime.Composable
private fun DotMatrix(
    state: WidgetState,
    columns: Int,
    cellHeight: Dp,
    ink: Color,
    red: Color,
) {
    // Intensity has to change the size of the mark, not just its colour.
    // Previously this scale only fed the corner radius while every cell was
    // drawn at full size, so the whole field rendered as identical squares.
    val dotScales = floatArrayOf(0.30f, 0.50f, 0.70f, 0.88f, 1.0f)
    val dotAlphas = floatArrayOf(0.30f, 0.52f, 0.74f, 0.9f, 1.0f)

    val visible = state.days.takeLast(columns * ROWS)

    Column(modifier = GlanceModifier.fillMaxWidth()) {
        for (row in 0 until ROWS) {
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                for (col in 0 until columns) {
                    val day = visible.getOrNull(col * ROWS + row)
                    val isToday = day?.isToday == true
                    val level = day?.level ?: 0
                    val dot = cellHeight * dotScales[level]
                    val color = when {
                        day == null -> ink.copy(alpha = 0.07f)
                        isToday -> red
                        else -> ink.copy(alpha = dotAlphas[level])
                    }
                    // Each column takes an equal share of the real width, so
                    // the field spans the card whatever size Glance reports.
                    Box(
                        modifier = GlanceModifier
                            .defaultWeight()
                            .height(cellHeight),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = GlanceModifier
                                .size(dot)
                                .cornerRadius(if (isToday || level >= 4) 2.dp else dot)
                                .background(color),
                        ) {}
                    }
                }
            }
            if (row < ROWS - 1) Spacer(GlanceModifier.height(DOT_GAP))
        }
    }
}
