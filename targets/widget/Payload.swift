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

    let login: String
    let days: [Day]
    let lines: [Line]?

    static func read() -> WidgetPayload? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: payloadKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }

    /// Today's line, held from local midnight to local midnight. The pick
    /// hashes the day against each message and takes the highest, so it does
    /// not depend on the order the app happened to shuffle the pool into —
    /// the same rule as Android's `WidgetState.lineOfTheDay`.
    func lineOfTheDay(now: Date) -> Line? {
        let local = now.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: now))
        let day = Int64(floor(local / 86_400))
        return (lines ?? [])
            .filter { !$0.m.trimmingCharacters(in: .whitespaces).isEmpty }
            .max { seed(day: day, line: $0.m) < seed(day: day, line: $1.m) }
    }
}

/// The card's surface. Android draws on the wallpaper's Material You neutral
/// (tone 50 by day, 900 at night); iOS has no such palette, so it uses the
/// fixed tones Android falls back to before Android 12 (`WidgetSurface.kt`).
func widgetSurface(dark: Bool) -> Color {
    dark
        ? Color(red: 0x1B / 255, green: 0x1B / 255, blue: 0x1B / 255)
        : Color(red: 0xE5 / 255, green: 0xE5 / 255, blue: 0xE5 / 255)
}

/// FNV-1a 64, started from the day rather than the standard basis.
private func seed(day: Int64, line: String) -> Int64 {
    var hash: Int64 = -3_750_763_034_362_895_579 ^ day
    for unit in line.utf16 {
        hash = (hash ^ Int64(unit)) &* 1_099_511_628_211
    }
    return hash
}
