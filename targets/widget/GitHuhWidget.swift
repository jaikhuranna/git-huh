import SwiftUI
import WidgetKit

@main
struct GitHuhWidgets: WidgetBundle {
    var body: some Widget {
        GitHuhWidget()
    }
}

struct GitHuhEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
}

/// One entry now and the next at midnight, when the line of the day turns
/// over. The app reloads the timeline itself every time it syncs.
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> GitHuhEntry {
        GitHuhEntry(date: Date(), payload: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (GitHuhEntry) -> Void) {
        completion(GitHuhEntry(date: Date(), payload: WidgetPayload.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<GitHuhEntry>) -> Void) {
        let now = Date()
        let entry = GitHuhEntry(date: now, payload: WidgetPayload.read())
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

struct GitHuhWidget: Widget {
    let kind = "GitHuhWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            GitHuhWidgetView(entry: entry)
        }
        .configurationDisplayName("git-huh?")
        .description("A commit of yours, and the year under it")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

/// A commit message of yours and the dot field, nothing else: no counts, no
/// accent, a plus for today in the bottom-right corner. WidgetKit cannot
/// animate, so the line that travels across the Android card sits still here,
/// cut at the card's edge — it is still one of yours, and still changes daily.
struct GitHuhWidgetView: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetFamily) private var family
    let entry: GitHuhEntry

    private var dark: Bool { scheme == .dark }
    private var ink: Color { dark ? .white : .black }
    private var faint: Color { ink.opacity(0.55) }

    var body: some View {
        content
            .containerBackground(for: .widget) { widgetSurface(dark: dark) }
            .widgetURL(URL(string: "githuh://"))
    }

    @ViewBuilder
    private var content: some View {
        if let payload = entry.payload {
            VStack(alignment: .leading, spacing: 10) {
                if family != .systemSmall, let line = payload.lineOfTheDay(now: entry.date) {
                    strip(line)
                }
                DotFieldView(days: payload.days, ink: ink, rows: family == .systemLarge ? 14 : 7)
                    .accessibilityLabel("a year of contributions, today in the corner")
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(ink)
                Text("open the app to connect")
                    .font(.custom(monoFace, size: 10))
                    .foregroundColor(faint)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func strip(_ line: WidgetPayload.Line) -> some View {
        let repo = line.r ?? ""
        return (
            Text(line.m).foregroundColor(ink)
                + Text(repo.isEmpty ? "" : "   \(repo)").foregroundColor(faint)
        )
        .font(.custom(monoFace, size: 13))
        .lineLimit(1)
        .truncationMode(.tail)
    }
}
