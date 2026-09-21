package app.githuh.widget

import android.content.Context
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
 * Widget B — the board card, from the Urbit ID cards on the pinboard
 * (design/board/pin08.png).
 *
 * Deliberately the opposite of widget A: no Material You, no Nothing red, no
 * day/night. It is a printed card, so it looks identical on every phone —
 * black stock, paper ink, a sigil generated from the handle, and a halftone
 * field of the year.
 */
private val CARD = Color(0xFF0B0B0A)
private val INK = Color(0xFFF4F2ED)
private val FAINT = Color(0x8CF4F2ED)

private const val ROWS = 7

private val PADDING = 14.dp
private val GAP = 3.dp
private val TARGET_CELL = 9.dp
private val MIN_CELL = 5.dp
private val MAX_CELL = 11.dp

class GitHuhBoardWidget : GlanceAppWidget() {

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
    Scaffold(
        backgroundColor = ColorProvider(day = CARD, night = CARD),
        horizontalPadding = PADDING,
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity(MainActivity::class.java)),
    ) {
        if (state == null) {
            Column(
                modifier = GlanceModifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    provider = GlyphRenderer.render(context, 20f, INK.toArgb(), 0),
                    contentDescription = null,
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
                )
            }
        } else {
            Filled(context, state, LocalSize.current)
        }
    }
}

@androidx.compose.runtime.Composable
private fun Filled(context: Context, state: WidgetState, size: DpSize) {
    val innerWidth = size.width - (PADDING * 2)
    val columns = ((innerWidth + GAP) / (TARGET_CELL + GAP))
        .toInt()
        .coerceIn(8, 24)
    val cell = ((innerWidth - GAP * (columns - 1)) / columns)
        .coerceIn(MIN_CELL, MAX_CELL)

    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Card head: sigil + ~handle, exactly as the pin lays it out.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                provider = GlyphRenderer.render(
                    context,
                    20f,
                    INK.toArgb(),
                    sigilSeed(state.login),
                ),
                contentDescription = null,
            )
            Spacer(GlanceModifier.width(10.dp))
            Image(
                provider = TextRenderer.render(
                    context,
                    "~${state.login.lowercase()}",
                    12f,
                    INK.toArgb(),
                    letterSpacing = 0.04f,
                ),
                contentDescription = state.login,
            )
        }

        Spacer(GlanceModifier.height(12.dp))

        Halftone(state, columns, cell)

        Spacer(GlanceModifier.height(10.dp))

        Image(
            provider = TextRenderer.render(
                context,
                "%,d commits · %,d prs".format(state.totalCommits, state.openPrs),
                8f,
                FAINT.toArgb(),
            ),
            contentDescription = null,
        )
    }
}

/** Stable per-handle seed, so two people never get the same sigil. */
private fun sigilSeed(login: String): Int {
    var value = 0x811c9dc5.toInt()
    for (char in login) {
        value = value xor char.code
        value *= 0x01000193
    }
    return value
}

/**
 * The pin's halftone field: white dots whose radius grows with the day's
 * intensity, peak days squaring off. No accent colour — the pin has none,
 * so today reads through size alone.
 */
@androidx.compose.runtime.Composable
private fun Halftone(state: WidgetState, columns: Int, cell: Dp) {
    val scales = floatArrayOf(0.18f, 0.40f, 0.60f, 0.82f, 1.0f)
    val alphas = floatArrayOf(0.12f, 0.35f, 0.58f, 0.80f, 1.0f)

    val visible = state.days.takeLast(columns * ROWS)

    Column {
        for (row in 0 until ROWS) {
            Row {
                for (col in 0 until columns) {
                    val day = visible.getOrNull(col * ROWS + row)
                    val level = day?.level ?: 0
                    val diameter = cell * scales[level]
                    Box(
                        modifier = GlanceModifier
                            .size(cell)
                            .cornerRadius(if (level >= 4) 2.dp else diameter)
                            .background(INK.copy(alpha = if (day == null) 0.08f else alphas[level])),
                    ) {}
                    if (col < columns - 1) Spacer(GlanceModifier.width(GAP))
                }
            }
            if (row < ROWS - 1) Spacer(GlanceModifier.height(GAP))
        }
    }
}
