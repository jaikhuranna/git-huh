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
private val MIN_DOT = 5.dp
private val MAX_DOT = 11.dp

/** Package fallbacks, used before the first sync and below Android 12. */
private const val FALLBACK_BG_LIGHT = "#e5e5e5"
private const val FALLBACK_BG_DARK = "#1b1b1b"

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

    val light = parse(state?.bgLight, parse(FALLBACK_BG_LIGHT, Color.White))
    val dark = parse(state?.bgDark, parse(FALLBACK_BG_DARK, Color.Black))

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

    // As many week-columns as fit at the target dot pitch, then size dots
    // to fill the width exactly.
    val columns = ((innerWidth + DOT_GAP) / (TARGET_DOT + DOT_GAP))
        .toInt()
        .coerceIn(8, 22)
    val dotSize = ((innerWidth - DOT_GAP * (columns - 1)) / columns)
        .coerceIn(MIN_DOT, MAX_DOT)

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

        Spacer(GlanceModifier.height(10.dp))

        Image(
            provider = TextRenderer.render(
                context,
                "%,d".format(state.todayCommits),
                24f,
                if (state.todayCommits > 0) red.toArgb() else ink.toArgb(),
            ),
            contentDescription = "${state.todayCommits} commits today",
        )
        Image(
            provider = TextRenderer.render(context, "today", 8f, faint.toArgb()),
            contentDescription = null,
        )

        Spacer(GlanceModifier.height(10.dp))

        DotMatrix(state, columns, dotSize, ink, red)

        Spacer(GlanceModifier.height(8.dp))

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
    cellSize: Dp,
    ink: Color,
    red: Color,
) {
    // Intensity grows the dot toward a filled square on peak days.
    val dotScales = floatArrayOf(0.25f, 0.45f, 0.65f, 0.85f, 1.0f)
    val dotAlphas = floatArrayOf(0.35f, 0.55f, 0.75f, 0.9f, 1.0f)

    val visible = state.days.takeLast(columns * ROWS)

    Column {
        for (row in 0 until ROWS) {
            Row {
                for (col in 0 until columns) {
                    val day = visible.getOrNull(col * ROWS + row)
                    val isToday = day?.isToday == true
                    val level = day?.level ?: 0
                    val diameter = cellSize * dotScales[level]
                    val color = when {
                        day == null -> ink.copy(alpha = 0.10f)
                        isToday -> red
                        else -> ink.copy(alpha = dotAlphas[level])
                    }
                    Box(
                        modifier = GlanceModifier
                            .size(cellSize)
                            .cornerRadius(if (isToday || level >= 4) 2.dp else diameter)
                            .background(color),
                    ) {}
                    if (col < columns - 1) Spacer(GlanceModifier.width(DOT_GAP))
                }
            }
            if (row < ROWS - 1) Spacer(GlanceModifier.height(DOT_GAP))
        }
    }
}
