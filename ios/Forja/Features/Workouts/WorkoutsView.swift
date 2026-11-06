import SwiftUI
import UIKit

struct WorkoutsView: View {
    @Environment(AppState.self) private var app
    @State private var filter = "todas"
    @State private var items: [SessionRow] = []
    @State private var showLogger = false
    @State private var showPhoto = false
    @State private var showPaste = false
    @State private var clipboardHasText = false

    private let filters = ["todas", "running", "crossfit", "strength", "hyrox", "other"]

    var body: some View {
        List {
            Section {
                Picker("Disciplina", selection: $filter) {
                    Text("Todas").tag("todas"); Text("Running").tag("running"); Text("CrossFit").tag("crossfit")
                    Text("Fuerza").tag("strength"); Text("HYROX").tag("hyrox"); Text("Otras").tag("other")
                }.pickerStyle(.segmented)
            }.listRowBackground(Color.clear)
            ForEach(grouped, id: \.0) { week, rows in
                Section(week) {
                    ForEach(rows) { s in NavigationLink { SessionDetailView(session: s) } label: { row(s) } }
                }
            }
            if items.isEmpty { EmptyState(icon: "figure.run", title: "Sin entrenamientos", message: "Conecta Apple Health en Perfil, registra uno a mano o sube una foto de la pizarra.").listRowBackground(Color.clear) }
        }
        .scrollContentBackground(.hidden).screenBackground()
        .navigationTitle("Entrenamientos")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Foto de pizarra o captura", systemImage: "camera.viewfinder") { showPhoto = true }
                    Button("Pegar texto (Strava, notas…)", systemImage: "doc.on.clipboard") { showPaste = true }
                    Button("Registro manual", systemImage: "square.and.pencil") { showLogger = true }
                } label: { Image(systemName: "plus.circle.fill").font(.title3) }
            }
        }
        .sheet(isPresented: $showLogger, onDismiss: { Task { await load() } }) { NavigationStack { WorkoutLoggerView() } }
        .sheet(isPresented: $showPhoto, onDismiss: { Task { await load() } }) { NavigationStack { PhotoImportView() } }
        .sheet(isPresented: $showPaste, onDismiss: { Task { await load() } }) { NavigationStack { PasteWorkoutView() } }
        .safeAreaInset(edge: .top) {
            // Si has copiado algo (p. ej. la descripción de Strava), se ofrece pegarlo. hasStrings no muestra el aviso de privacidad.
            if clipboardHasText {
                Button { showPaste = true; clipboardHasText = false; UserDefaults.standard.set(UIPasteboard.general.changeCount, forKey: "clip.seen") } label: { Label("¿Pegar el entreno que has copiado?", systemImage: "doc.on.clipboard").font(.footnote).frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered).padding(.horizontal, 16)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in clipboardHasText = clipboardIsNew() }
        .onAppear { clipboardHasText = clipboardIsNew() }
        .task { await load() }
        .refreshable { await app.refresh(sync: true); await load() }
    }

    private func clipboardIsNew() -> Bool { UIPasteboard.general.hasStrings && UIPasteboard.general.changeCount != UserDefaults.standard.integer(forKey: "clip.seen") }

    private var filtered: [SessionRow] {
        filter == "todas" ? items : filter == "other" ? items.filter { !["running", "crossfit", "strength", "hyrox"].contains($0.discipline) } : items.filter { $0.discipline == filter }
    }
    private var grouped: [(String, [SessionRow])] {
        let g = Dictionary(grouping: filtered) { DayKey.string(DayKey.monday(of: $0.start)) }
        return g.keys.sorted(by: >).map { ("Semana del \(DayKey.date($0).formatted(.dateTime.day().month()))", g[$0]!.sorted { $0.startedAt > $1.startedAt }) }
    }
    private func row(_ s: SessionRow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: Theme.icon(s.discipline)).foregroundStyle(Theme.discipline(s.discipline)).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.title ?? s.discipline.capitalized).font(.subheadline.weight(.semibold))
                Text(s.start.formatted(.dateTime.weekday(.wide).day().hour().minute())).font(.caption).foregroundStyle(Theme.text2)
            }
            Spacer()
            VStack(alignment: .trailing) {
                if let d = s.distanceM, d > 0 { Text(String(format: "%.2f km", d / 1000)).font(.subheadline).monospacedDigit() }
                Text(fmtDuration(Double(s.durationS))).font(.caption).foregroundStyle(Theme.text2)
            }
        }.listRowBackground(Theme.card)
    }
    private func load() async { items = (try? await SupabaseService.shared.sessions(days: 365)) ?? [] }
}

struct SessionDetailView: View {
    let session: SessionRow
    @State private var catalog: [String: String] = [:]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    StatTile(label: "Duración", value: fmtDuration(Double(session.durationS)))
                    if let d = session.distanceM, d > 0 { StatTile(label: "Distancia", value: String(format: "%.2f", d / 1000), unit: "km") }
                    if let p = session.paceSecPerKm, session.discipline == "running" { StatTile(label: "Ritmo", value: fmtPace(p)) }
                }
                HStack {
                    if let hr = session.avgHr { StatTile(label: "FC media", value: "\(hr)", unit: "ppm", color: Theme.red) }
                    if let rpe = session.rpe { StatTile(label: "RPE", value: String(format: "%g", rpe)) }
                    if let l = session.internalLoad { StatTile(label: "Carga", value: "\(Int(l))", unit: "UA") }
                    if let leg = session.legIndex { StatTile(label: "Piernas", value: "\(Int(leg))") }
                }
                if let e = session.elevationGainM, e > 0 { Text("Desnivel positivo: \(Int(e)) m").font(.footnote).foregroundStyle(Theme.text2) }
                ForEach((session.sessionBlocks ?? []).sorted { $0.position < $1.position }) { b in
                    Card {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack { Text(blockName(b.kind)).font(.headline); if let f = b.format { Tag(text: f.replacingOccurrences(of: "_", with: " "), color: Theme.accent) }; Spacer(); if let r = b.rounds { Text("×\(Int(r))").foregroundStyle(Theme.text2) } }
                            ForEach((session.sessionSets ?? []).filter { $0.blockId == b.id }.sorted { $0.position < $1.position }) { s in
                                HStack { Text(catalog[s.exerciseId ?? ""] ?? s.exerciseId ?? "Ejercicio"); Spacer()
                                    Text([s.reps.map { "\($0) reps" }, s.loadKg.map { String(format: "%g kg", $0) }, s.distanceM.map { "\(Int($0)) m" }].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(Theme.text2).monospacedDigit()
                                }.font(.subheadline)
                            }
                            if let r = b.resultText { Text("Resultado: \(r)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.green) }
                        }
                    }
                }
                Text("Fuente: \(sourceName(session.primarySource))").font(.caption).foregroundStyle(Theme.text2)
            }.padding(16)
        }
        .screenBackground()
        .navigationTitle(session.title ?? "Entrenamiento")
        .task {
            struct Ex: Decodable { let id: String; let name: String }
            let rows: [Ex] = (try? await SupabaseService.shared.client.from("exercises").select("id, name").execute().value) ?? []
            catalog = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0.name) })
        }
    }
}

func blockName(_ k: String) -> String { ["warmup": "Calentamiento", "strength": "Fuerza", "skill": "Técnica", "wod": "WOD", "accessory": "Accesorios", "cooldown": "Vuelta a la calma", "run": "Carrera", "station": "Estación"][k] ?? k }
func sourceName(_ s: String) -> String { ["healthkit": "Apple Health", "manual": "Registro manual", "photo": "Foto", "strava": "Strava"][s] ?? s }
