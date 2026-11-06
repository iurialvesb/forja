import SwiftUI

struct DashboardView: View {
    @Environment(AppState.self) private var app
    @State private var showCheckIn = false
    @State private var showPhoto = false
    @State private var nutrition: NutritionDay?
    @State private var supplements: [String] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                recoveryCard
                todayCard
                nutritionCard
                weekLoadCard
                goalsCard
                if let c = app.changes.first(where: { $0.action != "mark_done" }) { coachCard(c) }
                activityCard
            }.padding(16)
        }
        .screenBackground()
        .navigationTitle(greeting)
        .refreshable { await app.refresh(sync: true) }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { NavigationLink { ProfileView() } label: { Image(systemName: "person.crop.circle").font(.title3) } }
            ToolbarItem(placement: .topBarTrailing) {
                Menu { Button("Check-in de hoy", systemImage: "heart.text.square") { showCheckIn = true }
                       Button("Foto de entrenamiento", systemImage: "camera") { showPhoto = true } } label: { Image(systemName: "plus.circle.fill").font(.title3) }
            }
        }
        .sheet(isPresented: $showCheckIn) { CheckInView() }
        .sheet(isPresented: $showPhoto) { NavigationStack { PhotoImportView() } }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let name = app.profile?.displayName.map { ", \($0)" } ?? ""
        return (h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches") + name
    }

    private var recoveryCard: some View {
        NavigationLink { RecoveryView() } label: {
            Card {
                HStack(spacing: 18) {
                    RingGauge(value: Double(app.readiness?.score ?? 0) / 100, color: Theme.readiness(app.readiness?.level), label: app.readiness.map { "\($0.score)" } ?? "–")
                        .frame(width: 92, height: 92)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Recuperación").font(.caption).foregroundStyle(Theme.text2)
                        Text(levelText).font(.title3.weight(.bold)).foregroundStyle(Theme.readiness(app.readiness?.level))
                        Text(app.readiness?.reasons.first ?? "Haz el check-in y sincroniza Apple Health para calcularla.")
                            .font(.footnote).foregroundStyle(Theme.text2).lineLimit(3)
                    }
                    Spacer(minLength: 0)
                }
            }
        }.buttonStyle(.plain)
    }

    private var levelText: String {
        switch app.readiness?.level { case "verde": return "Listo para entrenar"; case "ambar": return "Con precaución"; case "rojo": return "Prioriza recuperar"; default: return "Sin datos" }
    }

    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(text: "Hoy", trailing: DayKey.date(DayKey.today).formatted(.dateTime.weekday(.wide).day().month()))
            if app.today.isEmpty {
                Card { Text(app.week.isEmpty ? "Aún no hay plan. Configura tus objetivos y disponibilidad en Perfil." : "Día de descanso. Camina, duerme bien y come suficiente.").foregroundStyle(Theme.text2) }
            }
            ForEach(app.today) { s in
                NavigationLink { PlannedSessionDetailView(session: s) } label: { PlannedRow(session: s, large: true) }.buttonStyle(.plain)
            }
        }
    }

    private var nutritionCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack { Text("Nutrición de hoy").font(.headline); Spacer(); if let t = nutrition?.target { Tag(text: "carga \(t.load)", color: Theme.accent) } }
                if let d = nutrition {
                    HStack {
                        StatTile(label: "kcal", value: "\(Int(d.totals.kcal))", unit: "/ \(Int(d.target.macros.kcal))")
                        StatTile(label: "Proteína", value: "\(Int(d.totals.protein))", unit: "/ \(Int(d.target.macros.protein)) g", color: Theme.red)
                        StatTile(label: "Hidratos", value: "\(Int(d.totals.carbs))", unit: "/ \(Int(d.target.macros.carbs)) g", color: Theme.blue)
                    }
                    if let next = d.meals.first(where: { $0.status == "planned" }) { Text("Siguiente: \(Slots.name(next.slot)) · \(next.title)").font(.footnote).foregroundStyle(Theme.text2) }
                    if let a = d.alerts.first { Label(a.message, systemImage: "exclamationmark.bubble").font(.footnote).foregroundStyle(Theme.amber) }
                } else { Text("Elige tu objetivo en Nutrición y genera tu menú semanal.").font(.footnote).foregroundStyle(Theme.text2) }
                if !supplements.isEmpty { Text("Hoy: " + supplements.joined(separator: " · ")).font(.footnote) }
            }
        }
        .task(id: app.lastSync) {
            struct B: Encodable { let weekStart: String }
            if let w: NutritionWeek = try? await SupabaseService.shared.call("nutrition-day", B(weekStart: DayKey.string(DayKey.monday(of: Date())))) {
                nutrition = w.days.first { $0.date == DayKey.today }
                supplements = w.supplements.recs.filter(\.take).map { $0.name }
            }
        }
    }

    private var weekLoadCard: some View {
        let monday = DayKey.string(DayKey.monday(of: Date()))
        let thisWeek = app.recentSessions.filter { DayKey.string($0.start) >= monday }
        let km = thisWeek.filter { $0.discipline == "running" }.compactMap(\.distanceM).reduce(0, +) / 1000
        let plannedKm = app.week.filter { $0.date >= monday && $0.date <= DayKey.add(6, to: monday) }.compactMap(\.plannedKm).reduce(0, +)
        let load = thisWeek.compactMap(\.internalLoad).reduce(0, +)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Carga semanal").font(.headline)
                HStack {
                    StatTile(label: "Carrera", value: String(format: "%.1f", km), unit: "/ \(Int(plannedKm)) km", color: Theme.blue)
                    StatTile(label: "Sesiones", value: "\(thisWeek.count)")
                    StatTile(label: "Carga", value: "\(Int(load))", unit: "UA")
                }
                if let acwr = app.readiness?.acwr {
                    HStack { Text("Ratio agudo:crónico").font(.caption).foregroundStyle(Theme.text2); Spacer()
                        Text(String(format: "%.2f", acwr)).font(.caption.weight(.bold)).foregroundStyle(acwr > 1.5 ? Theme.red : acwr > 1.3 ? Theme.amber : acwr < 0.8 ? Theme.blue : Theme.green) }
                }
                if let leg = app.readiness?.legFatigue {
                    ProgressView(value: min(1, leg / 350)) { Text("Fatiga de piernas").font(.caption).foregroundStyle(Theme.text2) }
                        .tint(leg >= 250 ? Theme.red : leg >= 140 ? Theme.amber : Theme.green)
                }
            }
        }
    }

    private var goalsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(text: "Objetivos")
            ForEach(app.goals) { g in
                let days = DayKey.cal.dateComponents([.day], from: DayKey.date(DayKey.today), to: DayKey.date(g.date)).day ?? 0
                let phase = app.phases.first { $0.goalId == g.id && $0.startDate <= DayKey.today && DayKey.today <= $0.endDate }
                let goalPhases = app.phases.filter { $0.goalId == g.id }
                let start = goalPhases.first.map { DayKey.date($0.startDate) } ?? Date()
                let total = max(1, DayKey.date(g.date).timeIntervalSince(start)); let done = Date().timeIntervalSince(start)
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(g.name).font(.headline); Spacer(); Tag(text: "\(days) días", color: Theme.accent) }
                        Text(phase.map { "\(phaseName($0.kind)) · \($0.focus)" } ?? (days < 0 ? "Completado" : "Preparación pendiente")).font(.footnote).foregroundStyle(Theme.text2)
                        ProgressView(value: max(0, min(1, done / total))).tint(Theme.accent)
                    }
                }
            }
            if app.goals.isEmpty { Card { Text("Añade tu próxima competición en Perfil → Objetivos.").foregroundStyle(Theme.text2) } }
        }
    }

    private func coachCard(_ c: PlanChange) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Label("Tu entrenador", systemImage: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                Text(c.reason).font(.subheadline)
            }
        }
    }

    private var activityCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(text: "Última actividad", trailing: app.syncing ? "Sincronizando…" : app.lastSync.map { "Sync \($0.formatted(.relative(presentation: .named)))" })
            ForEach(app.recentSessions.prefix(3)) { s in NavigationLink { SessionDetailView(session: s) } label: { SessionRowView(session: s) }.buttonStyle(.plain) }
        }
    }
}

func phaseName(_ k: String) -> String {
    ["general": "Preparación general", "development": "Desarrollo", "specific": "Preparación específica", "taper": "Puesta a punto", "competition": "Competición", "recovery": "Recuperación", "base": "Base"][k] ?? k
}

struct PlannedRow: View {
    let session: PlannedSession; var large = false
    var body: some View {
        Card(padding: large ? 16 : 12) {
            HStack(spacing: 12) {
                Image(systemName: Theme.icon(session.discipline)).font(large ? .title2 : .body).foregroundStyle(Theme.discipline(session.discipline))
                    .frame(width: large ? 44 : 32, height: large ? 44 : 32).background(Theme.discipline(session.discipline).opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(session.title).font(large ? .headline : .subheadline.weight(.semibold))
                        if session.status == "modified" { Image(systemName: "arrow.triangle.2.circlepath").font(.caption2).foregroundStyle(Theme.amber) }
                        if session.status == "done" { Image(systemName: "checkmark.circle.fill").font(.caption).foregroundStyle(Theme.green) }
                    }
                    Text([session.startLocal ?? (session.slot == "am" ? "Mañana" : "Tarde"), session.estMinutes.map { "\($0) min" }, session.plannedKm.map { String(format: "%.1f km", $0) }].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.text2)
                    if large, let o = session.objective { Text(o).font(.footnote).foregroundStyle(Theme.text2).lineLimit(2) }
                }
                Spacer()
                Tag(text: session.intensity ?? "", color: Theme.intensity(session.intensity))
            }
        }.opacity(session.status == "skipped" ? 0.45 : 1)
    }
}

struct SessionRowView: View {
    let session: SessionRow
    var body: some View {
        Card(padding: 12) {
            HStack(spacing: 12) {
                Image(systemName: Theme.icon(session.discipline)).foregroundStyle(Theme.discipline(session.discipline)).frame(width: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title ?? session.discipline.capitalized).font(.subheadline.weight(.semibold))
                    Text(session.start.formatted(.dateTime.weekday(.abbreviated).day().month().hour().minute())).font(.caption).foregroundStyle(Theme.text2)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    if let d = session.distanceM, d > 0 { Text(String(format: "%.2f km", d / 1000)).font(.subheadline.weight(.semibold)).monospacedDigit() }
                    Text(fmtDuration(Double(session.durationS))).font(.caption).foregroundStyle(Theme.text2).monospacedDigit()
                }
            }
        }
    }
}
