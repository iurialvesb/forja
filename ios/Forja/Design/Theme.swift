import SwiftUI

/// Sistema visual: oscuro, minimalista, un acento cálido y colores semánticos para intensidad y recuperación.
enum Theme {
    static let bg = Color(red: 0.04, green: 0.04, blue: 0.05)
    static let card = Color(red: 0.10, green: 0.10, blue: 0.12)
    static let cardHigh = Color(red: 0.14, green: 0.14, blue: 0.17)
    static let line = Color.white.opacity(0.08)
    static let accent = Color(red: 1.0, green: 0.42, blue: 0.24)        // naranja Forja
    static let text2 = Color.white.opacity(0.62)
    static let green = Color(red: 0.20, green: 0.84, blue: 0.53)
    static let amber = Color(red: 1.0, green: 0.74, blue: 0.20)
    static let red = Color(red: 1.0, green: 0.33, blue: 0.36)
    static let blue = Color(red: 0.36, green: 0.62, blue: 1.0)
    static let purple = Color(red: 0.66, green: 0.48, blue: 1.0)

    static func readiness(_ level: String?) -> Color { level == "verde" ? green : level == "ambar" ? amber : level == "rojo" ? red : text2 }
    static func intensity(_ i: String?) -> Color { i == "alta" ? red : i == "moderada" ? amber : green }
    static func discipline(_ d: String) -> Color {
        switch d { case "running": return blue; case "crossfit": return accent; case "hyrox", "hybrid": return purple; case "strength", "weightlifting": return amber; case "mobility", "yoga": return green; default: return text2 }
    }
    static func icon(_ d: String) -> String {
        switch d {
        case "running": return "figure.run"; case "crossfit": return "figure.cross.training"; case "hyrox", "hybrid": return "figure.mixed.cardio"
        case "strength", "weightlifting": return "dumbbell.fill"; case "mobility", "yoga": return "figure.flexibility"; case "cycling": return "figure.outdoor.cycle"
        case "swimming": return "figure.pool.swim"; case "hiking": return "figure.hiking"; case "walking": return "figure.walk"; case "skiing": return "figure.skiing.downhill"
        case "padel", "tennis": return "figure.tennis"; case "dance": return "figure.dance"; default: return "figure.mixed.cardio"
        }
    }
}

struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    var body: some View {
        content.padding(padding).frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.line))
    }
}

struct SectionTitle: View {
    let text: String; var trailing: String? = nil
    var body: some View {
        HStack { Text(text).font(.headline); Spacer(); if let trailing { Text(trailing).font(.caption).foregroundStyle(Theme.text2) } }
            .padding(.horizontal, 4)
    }
}

struct Tag: View {
    let text: String; var color: Color = Theme.text2
    var body: some View {
        Text(text).font(.caption2.weight(.semibold)).textCase(.uppercase).padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.16), in: Capsule()).foregroundStyle(color)
    }
}

struct StatTile: View {
    let label: String; let value: String; var unit: String? = nil; var color: Color = .white
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(Theme.text2)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(color)
                if let unit { Text(unit).font(.caption).foregroundStyle(Theme.text2) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct RingGauge: View {
    let value: Double   // 0-1
    let color: Color
    var lineWidth: CGFloat = 10
    var label: String
    var body: some View {
        ZStack {
            Circle().stroke(Theme.line, lineWidth: lineWidth)
            Circle().trim(from: 0, to: max(0.02, min(1, value))).stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)).rotationEffect(.degrees(-90))
            Text(label).font(.title.weight(.bold)).monospacedDigit()
        }
    }
}

struct EmptyState: View {
    let icon: String; let title: String; let message: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(Theme.text2)
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(Theme.text2).multilineTextAlignment(.center)
        }.padding(32).frame(maxWidth: .infinity)
    }
}

extension View {
    func screenBackground() -> some View { background(Theme.bg.ignoresSafeArea()) }
}
