import Foundation
import SwiftUI

/// The App Group the app writes into. It has to match
/// `ios.entitlements` in app.json and `APP_GROUP` in src/lib/widgetBridge.ts.
let appGroup = "group.app.githuh"
let payloadKey = "payload"

/// The name the bundled IBM Plex Mono registers under (its PostScript name).
let monoFace = "IBMPlexMono-Regular"

/// What the app last synced: the same JSON the Android widget reads.
struct WidgetPayload: Decodable {
    struct Day: Decodable {
        /// Intensity, 0–4.
        let l: Int
        /// True for today, the bottom-right mark.
        let t: Bool
    }

    /// A commit subject and the repository it was written in.
    struct Line: Decodable {
        let m: String
        let r: String?
    }

    struct Mode: Decodable {
        let bg: String?
    }

    struct Modes: Decodable {
        let light: Mode?
        let dark: Mode?
    }

    let login: String
    let days: [Day]
    let lines: [Line]?
    let mtui: Modes?
    let bg: String?

    static func read() -> WidgetPayload? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: payloadKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }

    /// Today's line, held for the whole day. The pick hashes the day against
    /// each message and takes the highest, so it does not depend on the order
    /// the app happened to shuffle the pool into — the same rule as Android.
    func lineOfTheDay(now: Date) -> Line? {
        let day = Int64(floor(now.timeIntervalSince1970 / 86_400))
        return (lines ?? [])
            .filter { !$0.m.trimmingCharacters(in: .whitespaces).isEmpty }
            .max { seed(day: day, line: $0.m) < seed(day: day, line: $1.m) }
    }

    /// The card's background for a scheme: nothing-mtui's widgetBg as the app
    /// resolved it, or the package's own fallback.
    func background(dark: Bool) -> Color {
        let hex = dark ? (mtui?.dark?.bg ?? bg) : (mtui?.light?.bg ?? bg)
        return Color(hex: hex) ?? WidgetPayload.fallback(dark: dark)
    }

    static func fallback(dark: Bool) -> Color {
        dark
            ? Color(red: 0x1B / 255, green: 0x1B / 255, blue: 0x19 / 255)
            : Color(red: 0xF4 / 255, green: 0xF0 / 255, blue: 0xEA / 255)
    }
}

/// FNV-1a 64, started from the day rather than the standard basis.
private func seed(day: Int64, line: String) -> Int64 {
    var hash: Int64 = -3_750_763_034_362_895_579 ^ day
    for unit in line.utf16 {
        hash = (hash ^ Int64(unit)) &* 1_099_511_628_211
    }
    return hash
}

extension Color {
    /// `#rrggbb`, or nil for anything else.
    init?(hex: String?) {
        guard var text = hex?.trimmingCharacters(in: .whitespaces), !text.isEmpty else {
            return nil
        }
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt64(text, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
