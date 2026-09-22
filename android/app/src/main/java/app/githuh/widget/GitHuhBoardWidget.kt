package app.githuh.widget

import android.content.Context
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

/** Sigil row + footer + the spacers around the field. */
private val CHROME_HEIGHT = 74.dp

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
    val fieldHeight = (size.height - CHROME_HEIGHT).coerceIn(28.dp, 104.dp)
    // Same reasoning as widget A: only the ratio of the reported box is
    // trusted, and the halftone is painted as one bitmap so its pitch is
    // equal in both axes whatever the launcher claims.
    val aspect = (innerWidth / fieldHeight).coerceIn(1.4f, 3.4f)
    val columns = (ROWS * aspect).toInt().coerceIn(10, 24)

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

        Image(
            provider = DotFieldRenderer.render(
                context = context,
                days = state.days,
                columns = columns,
                rows = ROWS,
                ink = INK.toArgb(),
                // The pin has no accent, so today reads through size alone.
                accent = INK.toArgb(),
                emptyAlpha = 0.06f,
                markToday = false,
            ),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = GlanceModifier.fillMaxWidth().height(fieldHeight),
        )

        Spacer(GlanceModifier.height(10.dp))

        Image(
            provider = TextRenderer.render(
                context,
                // The calendar total rather than the public commit count: the
                // field above it is drawn from the calendar, and the two used
                // to disagree by an order of magnitude on the same card.
                "%,d this year · %,d prs".format(state.total, state.openPrs),
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
