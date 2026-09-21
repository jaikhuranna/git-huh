package app.githuh.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * No configuration hook here: the board card is a printed card with fixed
 * colours, so a theme change has nothing to repaint.
 */
class GitHuhBoardWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GitHuhBoardWidget()
}
