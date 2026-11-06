import SwiftUI
import Charts

struct RecoveryView: View {
    @Environment(AppState.self) private var app
    @State private var history: [DailyHealthRow] = []
    @State private var showCheckIn = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            RingGauge(value: Double(app.readiness?.score ?? 0) / 100, color: Theme.readiness(app.readiness?.level), label: app.readiness.map { "\($0.score)" } ?? "–").frame(width: 84, height: 84)
                            VStack(alignment: .leading) {
                                Text("Estado de hoy").font(.caption).foregroundStyle(Theme.text2)
                                Text(app.readiness?.level.capitalized ?? "Sin datos").font(.title2.weight(.bold)).foregroundStyle(Theme.readiness(app.readiness?.level))
                                if let q = app.readiness?.dataQuality { Text("Calidad de datos: \(q.replacingOccurrences(of: "_", with: " "))").font(.caption2).foregroundStyle(Theme.text2) }
                            }
                        }
                        ForEach(app.readiness?.reasons ?? [], id: \.self) { Label($0, systemImage: "circle.fill").font(.footnote).labelStyle(BulletLabel()) }
                    }
                }
                Button { showCheckIn = true } label: { Label("Check-in de hoy", systemImage: "heart.text.square").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
                metricChart("HRV (ms)", { $0.hrvMs }, Theme.green)
                metricChart("FC en reposo (ppm)", { $0.rhr.map(Double.init) }, Theme.red)
                metricChart("Sueño (h)", { $0.sleepH }, Theme.purple)
                Text("Forja no diagnostica lesiones ni sustituye a un médico o fisioterapeuta. Si tienes dolor punzante, articular, inflamación, hormigueo o una molestia que no mejora en una semana, pide valoración profesional.")
                    .font(.caption).foregroundStyle(Theme.text2)
            }.padding(16)
        }
        .screenBackground().navigationTitle("Recuperación")
        .sheet(isPresented: $showCheckIn) { CheckInView() }
        .task {
            history = (try? await SupabaseService.shared.client.from("daily_health").select().gte("date", value: DayKey.add(-60, to: DayKey.today)).order("date").execute().value) ?? []
        }
    }

    private func metricChart(_ title: String, _ value: @escaping (DailyHealthRow) -> Double?, _ color: Color) -> some View {
        let pts = history.compactMap { r in value(r).map { (DayKey.date(r.date), $0) } }
        return Card {
            VStack(alignment: .leading) {
                HStack { Text(title).font(.headline); Spacer(); if let last = pts.last { Text(String(format: "%.0f", last.1)).font(.headline).foregroundStyle(color) } }
                if pts.count >= 3 {
                    Chart(pts, id: \.0) { LineMark(x: .value("Día", $0.0), y: .value(title, $0.1)).interpolationMethod(.monotone).foregroundStyle(color) }
                        .chartYScale(domain: .automatic(includesZero: false)).frame(height: 120)
                } else { Text("Sin datos suficientes. Lleva el Apple Watch puesto (también al dormir).").font(.caption).foregroundStyle(Theme.text2) }
            }
        }
    }
}

struct BulletLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View { HStack(alignment: .top, spacing: 8) { configuration.icon.font(.system(size: 5)).padding(.top, 6); configuration.title } }
}

struct CheckInView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var c = CheckInRow(date: DayKey.today)
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("¿Cómo te encuentras?") {
                    scale("Fatiga", $c.fatigue, ["Fresco", "Bien", "Normal", "Cansado", "Agotado"])
                    scale("Dolor muscular", $c.soreness, ["Nada", "Leve", "Moderado", "Alto", "Muy alto"])
                    scale("Estrés", $c.stress, ["Nada", "Poco", "Normal", "Alto", "Muy alto"])
                    scale("Motivación", $c.motivation, ["Nula", "Baja", "Normal", "Alta", "Máxima"])
                    scale("Calidad del sueño", $c.sleepQuality, ["Muy mala", "Mala", "Normal", "Buena", "Muy buena"])
                }
                Section {
                    ForEach($c.pains) { $p in PainEditor(p: $p) }.onDelete { c.pains.remove(atOffsets: $0) }
                    Button("Añadir molestia", systemImage: "bandage") { c.pains.append(PainReport()) }
                } header: { Text("Molestias") } footer: { Text("Describe dónde y cómo es: así distingo agujetas de algo que conviene que vea un profesional.") }
                Section { TextField("Nota (opcional)", text: Binding(get: { c.note ?? "" }, set: { c.note = $0 }), axis: .vertical) }
            }
            .navigationTitle("Check-in")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Guardar") { Task { await save() } }.disabled(saving) }
            }
            .task {
                let rows: [CheckInRow] = (try? await SupabaseService.shared.client.from("checkins").select().eq("date", value: DayKey.today).execute().value) ?? []
                if let r = rows.first { c = r }
            }
        }
    }

    private func scale(_ title: String, _ v: Binding<Int>, _ labels: [String]) -> some View {
        VStack(alignment: .leading) {
            HStack { Text(title); Spacer(); Text(labels[v.wrappedValue - 1]).foregroundStyle(Theme.accent) }
            Picker(title, selection: v) { ForEach(1...5, id: \.self) { Text("\($0)").tag($0) } }.pickerStyle(.segmented)
        }
    }

    private func save() async {
        saving = true; defer { saving = false }
        c.userId = SupabaseService.shared.userId
        do {
            try await SupabaseService.shared.client.from("checkins").upsert(c, onConflict: "user_id,date").execute()
            try await SupabaseService.shared.replan(trigger: "checkin")
            await app.refresh()
            app.toast = app.readiness.map { "Recuperación: \($0.score)/100" } ?? "Check-in guardado"
            dismiss()
        } catch { app.toast = error.localizedDescription }
    }
}

struct PainEditor: View {
    @Binding var p: PainReport
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Zona (p. ej. rodilla izquierda, gemelo)", text: $p.area)
            Stepper("Intensidad: \(p.intensity)/10", value: $p.intensity, in: 0...10)
            Picker("Tipo", selection: $p.character) {
                Text("Muscular difuso").tag("difuso_muscular"); Text("Punzante").tag("punzante"); Text("Articular").tag("articular"); Text("Tendón").tag("tendon"); Text("Otro").tag("otro")
            }
            Stepper("Desde hace \(p.daysOngoing) día(s)", value: $p.daysOngoing, in: 0...60)
            Toggle("En ambos lados", isOn: $p.bilateral)
            Toggle("Cambia mi forma de moverme / cojeo", isOn: $p.affectsMovement)
            Toggle("Inflamación", isOn: $p.swelling)
            Toggle("Hormigueo o pérdida de fuerza", isOn: $p.numbness)
            Toggle("Va a peor", isOn: $p.worsening)
        }
    }
}
