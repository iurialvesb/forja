import SwiftUI

/// Registro manual de cualquier actividad. Para fuerza/CrossFit/HYROX permite bloques con ejercicios del catálogo.
struct WorkoutLoggerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var discipline = "crossfit"
    @State private var title = ""
    @State private var start = Date()
    @State private var minutes = 60.0
    @State private var rpe = 7.0
    @State private var km = ""
    @State private var elevation = ""
    @State private var isRace = false
    @State private var isTest = false
    @State private var notes = ""
    @State private var blocks: [EditableBlock] = []
    @State private var saving = false
    @State private var result: IngestResult?
    @State private var addToHealth = false

    static let disciplines: [(String, String)] = [
        ("running", "Running"), ("crossfit", "CrossFit"), ("hybrid", "Híbrido"), ("hyrox", "HYROX"), ("strength", "Gimnasio / fuerza"),
        ("weightlifting", "Halterofilia"), ("calisthenics", "Calistenia"), ("swimming", "Natación"), ("cycling", "Ciclismo"), ("dance", "Baile urbano"),
        ("hiking", "Senderismo"), ("walking", "Caminata"), ("skiing", "Esquí"), ("padel", "Pádel"), ("tennis", "Tenis"), ("yoga", "Yoga"), ("mobility", "Movilidad"), ("other", "Otra"),
    ]
    private var structured: Bool { ["crossfit", "hybrid", "hyrox", "strength", "weightlifting", "calisthenics"].contains(discipline) }
    private var hasDistance: Bool { ["running", "cycling", "swimming", "hiking", "walking", "skiing"].contains(discipline) }

    var body: some View {
        Form {
            Section("Actividad") {
                Picker("Disciplina", selection: $discipline) { ForEach(Self.disciplines, id: \.0) { Text($0.1).tag($0.0) } }
                TextField("Título (opcional)", text: $title)
                DatePicker("Inicio", selection: $start)
                Stepper("Duración: \(Int(minutes)) min", value: $minutes, in: 5...600, step: 5)
                VStack(alignment: .leading) {
                    Text("Esfuerzo percibido (RPE): \(Int(rpe))/10")
                    Slider(value: $rpe, in: 1...10, step: 1)
                    Text(rpeHint).font(.caption).foregroundStyle(Theme.text2)
                }
            }
            if hasDistance {
                Section("Distancia") {
                    TextField("Kilómetros", text: $km).keyboardType(.decimalPad)
                    TextField("Desnivel positivo (m)", text: $elevation).keyboardType(.numberPad)
                    if discipline == "running" { Toggle("Competición", isOn: $isRace); Toggle("Test / contrarreloj", isOn: $isTest) }
                }
            }
            if structured {
                ForEach($blocks) { $b in BlockEditor(block: $b) { blocks.removeAll { $0.id == b.id } } }
                Button("Añadir bloque", systemImage: "plus") { blocks.append(EditableBlock()) }
            }
            Section("Notas") { TextField("Sensaciones, molestias…", text: $notes, axis: .vertical) }
            Section { Toggle("Guardar también en Apple Health", isOn: $addToHealth) }
            if let r = result { Section("Resultado") { ResultView(result: r) } }
        }
        .navigationTitle("Nuevo entrenamiento")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button(result == nil ? "Guardar" : "Listo") { if result == nil { Task { await save() } } else { dismiss() } }.disabled(saving) }
        }
        .task { if blocks.isEmpty && structured { blocks = [EditableBlock()] } }
    }

    private var rpeHint: String {
        switch Int(rpe) { case 1...3: return "Muy suave: podrías hablar sin esfuerzo"; case 4...5: return "Moderado"; case 6...7: return "Exigente"; case 8...9: return "Muy duro"; default: return "Máximo" }
    }

    private func save() async {
        saving = true; defer { saving = false }
        var s = EngineSession(startedAt: ISO8601.string(start), durationS: minutes * 60, discipline: discipline, title: title.isEmpty ? nil : title, rpe: rpe,
                              distanceM: Double(km.replacingOccurrences(of: ",", with: ".")).map { $0 * 1000 }, elevationGainM: Double(elevation),
                              isRace: isRace, isTimeTrial: isTest, source: "manual", notes: notes.isEmpty ? nil : notes)
        if structured { s.blocks = blocks.map { $0.engine } }
        do {
            result = try await SupabaseService.shared.ingest(s)
            if addToHealth { try? await HealthKitService.shared.saveWorkout(s) }
            await app.refresh()
        } catch { app.toast = error.localizedDescription }
    }
}

struct EditableBlock: Identifiable {
    let id = UUID()
    var kind = "wod"
    var format = "for_time"
    var rounds = ""
    var result = ""
    var sets: [EngineSet] = []
    var engine: EngineBlock {
        EngineBlock(kind: kind, format: format, rounds: Double(rounds), sets: sets, resultText: result.isEmpty ? nil : result)
    }
}

struct BlockEditor: View {
    @Binding var block: EditableBlock
    let onDelete: () -> Void
    @State private var picking = false
    var body: some View {
        Section {
            Picker("Tipo", selection: $block.kind) { ForEach(["warmup", "strength", "skill", "wod", "accessory", "station"], id: \.self) { Text(blockName($0)).tag($0) } }
            Picker("Formato", selection: $block.format) {
                ForEach([("for_time", "For Time"), ("amrap", "AMRAP"), ("emom", "EMOM"), ("rounds", "Rondas"), ("sets", "Series"), ("intervals", "Intervalos"), ("chipper", "Chipper")], id: \.0) { Text($0.1).tag($0.0) }
            }
            if block.format == "rounds" || block.format == "emom" { TextField("Rondas", text: $block.rounds).keyboardType(.numberPad) }
            ForEach($block.sets) { $set in SetEditor(set: $set) }.onDelete { block.sets.remove(atOffsets: $0) }
            Button("Añadir ejercicio", systemImage: "plus.circle") { picking = true }
            if block.kind == "wod" { TextField("Resultado (tiempo, rondas+reps)", text: $block.result) }
            Button("Eliminar bloque", role: .destructive, action: onDelete)
        } header: { Text(blockName(block.kind)) }
        .sheet(isPresented: $picking) { ExercisePicker { id in block.sets.append(EngineSet(exerciseId: id)) } }
    }
}

struct SetEditor: View {
    @Binding var set: EngineSet
    var body: some View {
        VStack(alignment: .leading) {
            Text(ExercisePicker.names[set.exerciseId] ?? set.exerciseId.replacingOccurrences(of: "custom:", with: "")).font(.subheadline.weight(.semibold))
            HStack {
                numberField("Reps", value: Binding(get: { set.reps.map(Double.init) }, set: { set.reps = $0.map { Int($0) } }))
                numberField("kg", value: $set.loadKg)
                numberField("m", value: $set.distanceM)
                numberField("cal", value: $set.calories)
                numberField("RIR", value: Binding(get: { set.rir.map(Double.init) }, set: { set.rir = $0.map { Int($0) } }))
            }
        }
    }
    private func numberField(_ label: String, value: Binding<Double?>) -> some View {
        TextField(label, value: value, format: .number).keyboardType(.decimalPad).textFieldStyle(.roundedBorder).font(.caption)
    }
}

struct ExercisePicker: View {
    nonisolated(unsafe) static var names: [String: String] = [:]
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var all: [Ex] = []
    struct Ex: Decodable, Identifiable { let id: String; let name: String; let category: String; let aliases: [String] }
    var body: some View {
        NavigationStack {
            List {
                if !query.isEmpty { Button("Usar «\(query)» como ejercicio propio") { onPick("custom:\(query)"); dismiss() } }
                ForEach(results) { e in Button { onPick(e.id); dismiss() } label: { HStack { Text(e.name); Spacer(); Text(e.category).font(.caption).foregroundStyle(Theme.text2) } } }
            }
            .searchable(text: $query, prompt: "Buscar (p. ej. T2B, power clean)")
            .navigationTitle("Ejercicio")
            .task {
                all = (try? await SupabaseService.shared.client.from("exercises").select("id, name, category, aliases").order("name").execute().value) ?? []
                Self.names = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0.name) })
            }
        }
    }
    private var results: [Ex] {
        let q = query.lowercased()
        return q.isEmpty ? all : all.filter { $0.name.lowercased().contains(q) || $0.aliases.contains { $0.contains(q) } }
    }
}

struct ResultView: View {
    let result: IngestResult
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(result.merged ? "Fusionado con una actividad que ya tenías (sin duplicar)" : "Entrenamiento guardado", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.green)
            ForEach(result.prs, id: \.self) { Label($0, systemImage: "trophy.fill").foregroundStyle(Theme.amber) }
            ForEach(result.changes.filter { $0.action != "mark_done" }, id: \.self) { c in
                Label(c.reason, systemImage: "arrow.triangle.2.circlepath").font(.footnote)
            }
            if result.changes.filter({ $0.action != "mark_done" }).isEmpty { Text("El plan de los próximos días sigue siendo adecuado.").font(.footnote).foregroundStyle(Theme.text2) }
        }
    }
}
