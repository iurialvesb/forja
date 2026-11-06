import SwiftUI
import Charts

struct Insights: Decodable {
    struct Running: Decodable {
        let vdot: Double?; let vdotNote: String?; let paces: Paces?; let zones: Zones?
        let predictions: [Prediction]; let weeks: [WeekKm]; let runs: [Run]; let distribution28d: Dist
    }
    struct Paces: Decodable { let easy: [Double]; let marathon: Double; let threshold: Double; let interval: Double; let repetition: Double; let halfMarathon: Double; let tenK: Double }
    struct Zones: Decodable { let method: String; let zones: [[Double]] }
    struct Prediction: Decodable, Identifiable { var id: String { key }; let key: String; let distanceM: Double; let timeS: Double }
    struct WeekKm: Decodable, Identifiable { var id: String { week }; let week: String; let km: Double }
    struct Run: Decodable, Identifiable { var id: String { "\(date)-\(km)" }; let date: String; let km: Double; let paceSecPerKm: Double; let avgHr: Double? }
    struct Dist: Decodable { let low: Double; let mid: Double; let high: Double; let totalS: Double }
    struct Lift: Decodable, Identifiable {
        var id: String { exerciseId }
        let exerciseId: String; let name: String
        let bestActual1RM: KgDate?; let bestE1RM: KgDate?; let workingE1RM: Working?
        let history: [Point]; let suggestion: Suggestion
    }
    struct KgDate: Decodable { let kg: Double; let date: String }
    struct Working: Decodable { let kg: Double; let basis: String }
    struct Point: Decodable, Identifiable { var id: String { date }; let date: String; let e1rm: Double }
    struct Suggestion: Decodable { let loadKg: Double?; let explanation: String }
    struct Fit: Decodable, Identifiable { var id: String { date }; let date: String; let ctl: Double; let atl: Double; let tsb: Double; let acwr: Double? }
    let running: Running; let lifts: [Lift]; let fitness: [Fit]
}

struct ProgressHubView: View {
    @State private var tab = 0
    @State private var data: Insights?
    @State private var records: [PersonalRecord] = []
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Picker("", selection: $tab) { Text("Running").tag(0); Text("Fuerza").tag(1); Text("Carga").tag(2); Text("Récords").tag(3) }.pickerStyle(.segmented)
                if let data {
                    switch tab {
                    case 0: RunningProgress(r: data.running)
                    case 1: StrengthProgress(lifts: data.lifts)
                    case 2: LoadProgress(fit: data.fitness)
                    default: RecordsList(records: records)
                    }
                } else if let error { Text(error).foregroundStyle(Theme.red) } else { ProgressView().padding(40) }
            }.padding(16)
        }
        .screenBackground().navigationTitle("Progreso")
        .task { await load() }.refreshable { await load() }
    }

    private func load() async {
        struct E: Encodable {}
        do { data = try await SupabaseService.shared.call("insights", E()); records = try await SupabaseService.shared.records() }
        catch { self.error = error.localizedDescription }
    }
}

struct RunningProgress: View {
    let r: Insights.Running
    var body: some View {
        VStack(spacing: 16) {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack { Text("Tus ritmos").font(.headline); Spacer(); if let v = r.vdot { Tag(text: String(format: "VDOT %.1f", v), color: Theme.blue) } }
                    if let p = r.paces {
                        Grid(alignment: .leading, verticalSpacing: 6) {
                            row("Suave", "\(fmtPace(p.easy[0]))–\(fmtPace(p.easy[1]))", Theme.green)
                            row("Maratón", fmtPace(p.marathon), Theme.blue)
                            row("Media maratón", fmtPace(p.halfMarathon), Theme.blue)
                            row("Umbral", fmtPace(p.threshold), Theme.amber)
                            row("Series (VO2max)", fmtPace(p.interval), Theme.red)
                            row("Repeticiones", fmtPace(p.repetition), Theme.red)
                        }
                        Text(r.vdotNote ?? "").font(.caption).foregroundStyle(Theme.text2)
                    } else { Text("Registra una competición o un test (marca la actividad como test) para calcular tus ritmos reales.").font(.footnote).foregroundStyle(Theme.text2) }
                }
            }
            if !r.predictions.isEmpty {
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Predicciones orientativas").font(.headline)
                        HStack { ForEach(r.predictions) { p in StatTile(label: label(p.key), value: fmtDuration(p.timeS)) } }
                        Text("Suponen preparación específica para cada distancia.").font(.caption2).foregroundStyle(Theme.text2)
                    }
                }
            }
            Card {
                VStack(alignment: .leading) {
                    Text("Kilómetros por semana").font(.headline)
                    Chart(r.weeks) { BarMark(x: .value("Semana", DayKey.date($0.week), unit: .weekOfYear), y: .value("km", $0.km)).foregroundStyle(Theme.blue.gradient) }.frame(height: 170)
                }
            }
            if r.runs.count >= 3 {
                Card {
                    VStack(alignment: .leading) {
                        Text("Evolución del ritmo").font(.headline)
                        Chart(r.runs) {
                            PointMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("Ritmo", $0.paceSecPerKm / 60)).foregroundStyle(Theme.blue.opacity(0.6))
                        }
                        .chartYScale(domain: .automatic(includesZero: false, reversed: true))
                        .chartYAxisLabel("min/km").frame(height: 170)
                    }
                }
            }
            if r.distribution28d.totalS > 0 {
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Distribución de intensidad (28 días)").font(.headline)
                        GeometryReader { g in
                            HStack(spacing: 2) {
                                Rectangle().fill(Theme.green).frame(width: g.size.width * r.distribution28d.low)
                                Rectangle().fill(Theme.amber).frame(width: g.size.width * r.distribution28d.mid)
                                Rectangle().fill(Theme.red).frame(width: g.size.width * r.distribution28d.high)
                            }.clipShape(Capsule())
                        }.frame(height: 12)
                        Text(String(format: "Baja %.0f %% · Media %.0f %% · Alta %.0f %%. Objetivo orientativo: ~80 %% baja.", r.distribution28d.low * 100, r.distribution28d.mid * 100, r.distribution28d.high * 100)).font(.caption).foregroundStyle(Theme.text2)
                    }
                }
            }
        }
    }
    private func row(_ a: String, _ b: String, _ c: Color) -> some View { GridRow { Text(a).foregroundStyle(Theme.text2); Text(b).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(c) } }
    private func label(_ k: String) -> String { ["5k": "5K", "10k": "10K", "15k": "15K", "half": "Media", "marathon": "Maratón"][k] ?? k }
}

struct StrengthProgress: View {
    let lifts: [Insights.Lift]
    var body: some View {
        VStack(spacing: 12) {
            if lifts.isEmpty { EmptyState(icon: "dumbbell", title: "Sin datos de fuerza", message: "Registra series con peso (o sube la foto de la pizarra) y verás aquí tu evolución y tu 1RM estimado.") }
            ForEach(lifts) { l in
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(l.name).font(.headline)
                        HStack {
                            StatTile(label: "1RM real", value: l.bestActual1RM.map { String(format: "%g", $0.kg) } ?? "–", unit: "kg")
                            StatTile(label: "1RM estimado", value: l.bestE1RM.map { String(format: "%.1f", $0.kg) } ?? "–", unit: "kg", color: Theme.amber)
                            StatTile(label: "De trabajo", value: l.workingE1RM.map { String(format: "%.1f", $0.kg) } ?? "–", unit: "kg", color: Theme.accent)
                        }
                        if l.history.count >= 2 {
                            Chart(l.history) { LineMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("e1RM", $0.e1rm)).interpolationMethod(.monotone).foregroundStyle(Theme.amber)
                                PointMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("e1RM", $0.e1rm)).foregroundStyle(Theme.amber) }
                                .chartYScale(domain: .automatic(includesZero: false)).frame(height: 130)
                            if let first = l.history.first, let last = l.history.last, first.e1rm > 0 {
                                Text(String(format: "%+.1f %% desde %@", (last.e1rm / first.e1rm - 1) * 100, DayKey.date(first.date).formatted(.dateTime.day().month()))).font(.caption).foregroundStyle(Theme.text2)
                            }
                        }
                        Text(l.suggestion.explanation).font(.caption).foregroundStyle(Theme.text2)
                    }
                }
            }
        }
    }
}

struct LoadProgress: View {
    let fit: [Insights.Fit]
    var body: some View {
        VStack(spacing: 12) {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Forma y fatiga").font(.headline)
                    Chart {
                        ForEach(fit) { LineMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("Forma (CTL)", $0.ctl), series: .value("s", "CTL")).foregroundStyle(Theme.blue) }
                        ForEach(fit) { LineMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("Fatiga (ATL)", $0.atl), series: .value("s", "ATL")).foregroundStyle(Theme.red) }
                    }.frame(height: 190)
                    Text("Azul: carga crónica (42 días, tu forma). Rojo: carga aguda (7 días, tu fatiga).").font(.caption).foregroundStyle(Theme.text2)
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ratio agudo:crónico").font(.headline)
                    Chart {
                        RuleMark(y: .value("Mín.", 0.8)).foregroundStyle(Theme.green.opacity(0.5)).lineStyle(StrokeStyle(dash: [4]))
                        RuleMark(y: .value("Máx.", 1.3)).foregroundStyle(Theme.green.opacity(0.5)).lineStyle(StrokeStyle(dash: [4]))
                        ForEach(fit.filter { $0.acwr != nil }) { LineMark(x: .value("Fecha", DayKey.date($0.date)), y: .value("ACWR", $0.acwr!)).foregroundStyle(Theme.accent) }
                    }.frame(height: 150)
                    Text("Entre las líneas verdes (0,8–1,3): progresión segura. Por encima de 1,5 el plan recorta volumen.").font(.caption).foregroundStyle(Theme.text2)
                }
            }
        }
    }
}

struct RecordsList: View {
    let records: [PersonalRecord]
    var body: some View {
        let latest = Dictionary(grouping: records, by: { "\($0.metric)|\($0.kind)" }).compactMap { $0.value.last }.sorted { $0.metric < $1.metric }
        VStack(spacing: 8) {
            if latest.isEmpty { EmptyState(icon: "trophy", title: "Aún sin récords", message: "Se guardan solos al registrar entrenamientos.") }
            ForEach(latest) { r in
                Card(padding: 12) {
                    HStack {
                        VStack(alignment: .leading) { Text(r.detail ?? r.metric).font(.subheadline.weight(.semibold)); Text(DayKey.date(r.achievedOn).formatted(.dateTime.day().month().year())).font(.caption).foregroundStyle(Theme.text2) }
                        Spacer()
                        Tag(text: r.kind == "actual" ? "Real" : "Estimado", color: r.kind == "actual" ? Theme.green : Theme.amber)
                    }
                }
            }
        }
    }
}
