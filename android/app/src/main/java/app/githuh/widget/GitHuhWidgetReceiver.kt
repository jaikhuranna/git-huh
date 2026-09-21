package app.githuh.widget

import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class GitHuhWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GitHuhWidget()

    /**
     * The Material You background is resolved while the widget is drawn, so a
     * theme or wallpaper change has to force a repaint — otherwise the card
     * keeps its old colour until the next half-hourly update.
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_CONFIGURATION_CHANGED) {
            CoroutineScope(Dispatchers.Default).launch {
                GitHuhWidget().updateAll(context)
            }
        }
    }
}
