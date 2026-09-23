import SwiftUI

/// The contribution field — a port of the Android widget's DotFieldRenderer,
/// rule for rule, so the two cards read the same:
///
/// 1. The newest day is the bottom-right mark. Days run up each column and on
///    to the one on its left, so today is always the same corner.
/// 2. A long quiet stretch is a wave with its length on it, not a wall of
///    empty dots, and the room it would have taken goes to days with work.
/// 3. A silence starts and ends as empty days: each side of a wave keeps one
///    whole column of them, the newer side finishing its partial column first.
enum DotField {
    static let minColumns = 8
    static let maxColumns = 40
    /// The biggest a dot's cell may get, in points.
    static let maxPitch: CGFloat = 22
    static let scales: [CGFloat] = [0.26, 0.44, 0.62, 0.82, 1.0]
    static let alphas: [Double] = [0.26, 0.46, 0.66, 0.84, 1.0]
    static let gapShare: CGFloat = 0.30
    static let quietDays = 21
    static let quietColumns = 3
    static let ghostAlpha = 0.07

    enum Slot {
        case day(level: Int, today: Bool)
        /// Starts on a column. `toEdge` when it runs back past the oldest day.
        case quiet(days: Int, toEdge: Bool)
    }

    /// The days, newest first, as the cells they will take.
    static func slots(_ days: [WidgetPayload.Day], rows: Int) -> [Slot] {
        var slots: [Slot] = []
        var cells = 0
        var i = days.count - 1
        while i >= 0 {
            let day = days[i]
            if day.l > 0 || day.t {
                slots.append(.day(level: day.l, today: day.t))
                cells += 1
                i -= 1
                continue
            }
            var j = i
            while j >= 0 && days[j].l == 0 && !days[j].t { j -= 1 }
            let run = i - j
            let toEdge = j < 0

            // Finish the column the marks stopped in, then one whole column.
            let lead = (rows - cells % rows) % rows + rows
            let trail = toEdge ? 0 : rows
            let hidden = run - lead - trail
            let folds = run >= quietDays && (toEdge ? hidden > 0 : hidden > quietColumns * rows)

            if folds {
                for _ in 0..<lead { slots.append(.day(level: 0, today: false)) }
                slots.append(.quiet(days: run, toEdge: toEdge))
                for _ in 0..<trail { slots.append(.day(level: 0, today: false)) }
                cells += lead + trail + quietColumns * rows
            } else {
                for _ in 0..<run { slots.append(.day(level: 0, today: false)) }
                cells += run
            }
            i = j
        }
        return slots
    }

    /// `3 wk`, `5 mo`, `1 yr`.
    static func howLong(_ days: Int) -> String {
        if days < 56 { return "\(Int((Double(days) / 7).rounded())) wk" }
        if days < 365 { return "\(max(Int((Double(days) / 30.44).rounded()), 2)) mo" }
        return "\(max(Int((Double(days) / 365.25).rounded()), 1)) yr"
    }
}

struct DotFieldView: View {
    let days: [WidgetPayload.Day]
    let ink: Color
    let rows: Int

    var body: some View {
        Canvas { context, size in
            draw(&context, size: size)
        }
    }

    private func draw(_ context: inout GraphicsContext, size: CGSize) {
        let width = max(size.width, 1)
        let height = max(size.height, 1)
        let room = height / CGFloat(rows)
        let columns = min(
            max(Int(ceil(width / min(room, DotField.maxPitch))), DotField.minColumns),
            DotField.maxColumns
        )
        let pitch = min(width / CGFloat(columns), room)
        let cell = pitch * (1 - DotField.gapShare)
        let left = (width - pitch * CGFloat(columns)) / 2
        let top = (height - pitch * CGFloat(rows)) / 2

        // Nothing after today is drawn.
        var history = days
        if let end = days.lastIndex(where: { $0.t }) {
            history = Array(days[0...end])
        }

        let capacity = columns * rows
        func center(_ k: Int) -> CGPoint {
            CGPoint(
                x: left + CGFloat(columns - 1 - k / rows) * pitch + pitch / 2,
                y: top + CGFloat(rows - 1 - k % rows) * pitch + pitch / 2
            )
        }

        var k = 0
        placing: for slot in DotField.slots(history, rows: rows) {
            if k >= capacity { break }
            switch slot {
            case let .day(level, today):
                mark(&context, level: level, today: today, at: center(k), cell: cell)
                k += 1
            case let .quiet(count, toEdge):
                let remaining = columns - k / rows
                let span = toEdge ? remaining : min(DotField.quietColumns, remaining)
                if span < 2 {
                    // No room for a wave; the last column is the silence's
                    // own empty days.
                    while k < capacity {
                        mark(&context, level: 0, today: false, at: center(k), cell: cell)
                        k += 1
                    }
                    break placing
                }
                quiet(
                    &context,
                    days: count,
                    from: left + CGFloat(remaining - span) * pitch,
                    to: left + CGFloat(remaining) * pitch,
                    top: top,
                    pitch: pitch
                )
                k += span * rows
            }
        }

        // Before the history the app sent: the grid's own ghost.
        while k < capacity {
            let point = center(k)
            let size = cell * DotField.scales[0]
            context.fill(
                Path(ellipseIn: CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)),
                with: .color(ink.opacity(DotField.ghostAlpha))
            )
            k += 1
        }
    }

    private func mark(_ context: inout GraphicsContext, level: Int, today: Bool, at point: CGPoint, cell: CGFloat) {
        // Today is a plus, in the same ink as every other day.
        if today {
            let arm = cell * 0.5
            let bar = cell * 0.22
            let shading = GraphicsContext.Shading.color(ink)
            context.fill(Path(CGRect(x: point.x - arm, y: point.y - bar / 2, width: arm * 2, height: bar)), with: shading)
            context.fill(Path(CGRect(x: point.x - bar / 2, y: point.y - arm, width: bar, height: arm * 2)), with: shading)
            return
        }
        let index = min(max(level, 0), 4)
        let size = cell * DotField.scales[index]
        let rect = CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)
        let shading = GraphicsContext.Shading.color(ink.opacity(DotField.alphas[index]))
        // A peak day squares off, so intensity reads in shape as well as size.
        if index >= 4 {
            context.fill(Path(roundedRect: rect, cornerRadius: size * 0.22), with: shading)
        } else {
            context.fill(Path(ellipseIn: rect), with: shading)
        }
    }

    /// The app's hand-drawn rule across the middle, with how long it lasted over it.
    private func quiet(_ context: inout GraphicsContext, days: Int, from: CGFloat, to: CGFloat, top: CGFloat, pitch: CGFloat) {
        let inset = pitch * 0.35
        let middle = top + pitch * CGFloat(rows) * 0.58
        let amplitude = pitch * 0.14
        let wavelength = pitch * 0.82
        let length = to - from - inset * 2
        if length > 0 {
            var path = Path()
            let steps = max(Int(ceil(length / 2)), 2)
            for step in 0...steps {
                let along = length * CGFloat(step) / CGFloat(steps)
                let wave = sin(Double(along / wavelength) * 2 * Double.pi)
                let point = CGPoint(x: from + inset + along, y: middle + CGFloat(wave) * amplitude)
                if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
            }
            context.stroke(
                path,
                with: .color(ink.opacity(0.5)),
                style: StrokeStyle(lineWidth: 1.25, lineCap: .round)
            )
        }
        let label = Text(DotField.howLong(days))
            .font(.custom(monoFace, size: pitch * 0.62))
            .foregroundColor(ink.opacity(0.72))
        context.draw(label, at: CGPoint(x: (from + to) / 2, y: middle - amplitude - pitch * 0.35), anchor: .bottom)
    }
}
