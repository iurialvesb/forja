import SwiftUI

struct CalendarView: View {
    @Environment(AppState.self) private var app
    @State private var selected = DayKey.today
    @State private var weekOffset = 0
    @State private var sessions: [PlannedSession] = []
    @State private var done: [SessionRow] = []

    private var monday: String { DayKey.add(7 * weekOffset, to: DayKey.string(DayKey.monday(of: Date()))) }
    private var days: [String] { (0..<7).map { DayKey.add($0, to: monday) } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                phaseStrip
                HStack {
                    Button { weekOffset -= 1 } label: { Image(systemName: "chevron.left") }
                    Spacer()
                    Text("Semana del \(DayKey.date(monday).formatted(.dateTime.day().month(.wide)))").font(.headline)
                    Spacer()
                    Button { weekOffset += 1 } label: { Image(systemName: "chevron.right") }
                }.padding(.horizontal, 4)
                HStack(spacing: 6) {
                    ForEach(days, id: \.self) { d in
                        let items = sessions.filter { $0.date == d }
                        Button { selected = d } label: {
                            VStack(spacing: 6) {
                                Text(DayKey.date(d).formatted(.dateTime.weekday(.narrow))).font(.caption2).foregroundStyle(Theme.text2)
                                Text(DayKey.date(d).formatted(.dateTime.day())).font(.callout.weight(.bold))
                                HStack(spacing: 2) { ForEach(items) { Circle().fill(Theme.discipline($0.discipline)).frame(width: 5, height: 5) } }.frame(height: 5)
                            }.frame(maxWidth: .infinity).padding(.vertical, 10)
                            .background(selected == d ? Theme.accent.opacity(0.22) : Theme.card, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(d == DayKey.today ? Theme.accent : .clear, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                }
                let items = sessions.filter { $0.date == selected }
                VStack(spacing: 10) {
                    if items.isEmpty { Card { Text("Descanso").foregroundStyle(Theme.text2) } }
                    ForEach(items) { s in NavigationLink { PlannedSessionDetailView(session: s) } label: { PlannedRow(session: s, large: true) }.buttonStyle(.plain) }
                    let doneToday = done.filter { DayKey.string($0.start) == selected }
                    if !doneToday.isEmpty { SectionTitle(text: "Realizado") }
                    ForEach(doneToday) { s in NavigationLink { SessionDetailView(session: s) } label: { SessionRowView(session: s) }.buttonStyle(.plain) }
                }
            }.padding(16)
        }
        .screenBackground()
        .navigationTitle("Calendario")
        .task(id: weekOffset) { await load() }
        .refreshable { await load() }
    }

    private var phaseStrip: some View {
        let ph = app.phases.filter { $0.kind != "base" }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ph) { p in
                    let current = p.startDate <= DayKey.today && DayKey.today <= p.endDate
                    VStack(alignment: .leading, spacing: 2) {
                        Text(phaseName(p.kind)).font(.caption.weight(.semibold))
                        Text("\(DayKey.date(p.startDate).formatted(.dateTime.day().month(.abbreviated))) – \(DayKey.date(p.endDate).formatted(.dateTime.day().month(.abbreviated)))").font(.caption2).foregroundStyle(Theme.text2)
                    }.padding(10).background(current ? Theme.accent.opacity(0.25) : Theme.card, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func load() async {
        sessions = (try? await SupabaseService.shared.plannedSessions(from: monday, to: DayKey.add(6, to: monday))) ?? []
        done = (try? await SupabaseService.shared.sessions(days: max(14, -weekOffset * 7 + 14))) ?? []
        if !days.contains(selected) { selected = days.contains(DayKey.today) ? DayKey.today : days[0] }
    }
}

struct PlannedSessionDetailView: View {
    let session: PlannedSession
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var working = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack { Tag(text: session.intensity ?? "", color: Theme.intensity(session.intensity)); if session.key { Tag(text: "Sesión clave", color: Theme.accent) }; Spacer() }
                Text(session.objective ?? "").font(.title3.weight(.semibold))
                HStack {
                    StatTile(label: "Duración", value: "\(session.estMinutes ?? 0)", unit: "min")
                    if let km = session.plannedKm, km > 0 { StatTile(label: "Distancia", value: String(format: "%.1f", km), unit: "km") }
                    StatTile(label: "Carga piernas", value: "\(session.legStress ?? 0)/3")
                }
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Por qué esta sesión", systemImage: "lightbulb").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                        Text(session.rationale ?? "").font(.subheadline)
                    }
                }
                SectionTitle(text: "Sesión")
                VStack(spacing: 8) { ForEach(session.steps) { StepView(step: $0) } }
                if session.status == "planned" || session.status == "modified" {
                    Button(role: .destructive) { Task { await missed() } } label: {
                        Label("No puedo hacerla", systemImage: "calendar.badge.minus").frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered).disabled(working)
                }
            }.padding(16)
        }
        .screenBackground()
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func missed() async {
        working = true; defer { working = false }
        do { try await SupabaseService.shared.replan(trigger: "missed", plannedId: session.id); await app.refresh(); app.toast = "Plan recolocado"; dismiss() }
        catch { app.toast = error.localizedDescription }
    }
}

struct StepView: View {
    let step: PrescriptionStep
    var body: some View {
        Card(padding: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(step.label).font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(metrics).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(Theme.accent)
                }
                if let cue = step.cue { Text(cue).font(.footnote).foregroundStyle(Theme.text2) }
                if let inner = step.steps {
                    VStack(spacing: 6) { ForEach(inner) { StepView(step: $0) } }.padding(.leading, 8)
                }
            }
        }
    }
    private var metrics: String {
        var parts: [String] = []
        if let r = step.repeat_ { parts.append("×\(r)") }
        if let d = step.distanceM, d > 0 { parts.append(d >= 1000 ? String(format: "%.1f km", d / 1000) : "\(Int(d)) m") }
        if let t = step.durationS { parts.append(t >= 60 ? "\(Int(t / 60))′\(Int(t) % 60 > 0 ? "\(Int(t) % 60)″" : "")" : "\(Int(t))″") }
        if let r = step.paceRange, r.count == 2 { parts.append("\(fmtPace(r[0]))–\(fmtPace(r[1]))") }
        else if let p = step.pace { parts.append(fmtPace(Double(p.secPerKm))) }
        if let hr = step.hrRange, hr.count == 2 { parts.append("\(Int(hr[0]))–\(Int(hr[1])) ppm") }
        if let s = step.sets, let r = step.reps { parts.append("\(s)×\(r)") }
        if let kg = step.loadKg { parts.append(String(format: "%g kg", kg)) }
        if let rir = step.rir, step.kind == "exercise" { parts.append("RIR \(rir)") }
        if let rest = step.restS, step.kind == "exercise" { parts.append("desc. \(Int(rest))″") }
        return parts.joined(separator: " · ")
    }
}
