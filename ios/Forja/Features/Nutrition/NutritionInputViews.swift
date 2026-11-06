import SwiftUI
import PhotosUI
import VisionKit

// MARK: - Registrar comida (texto, foto o código de barras)

struct LogFoodView: View {
    let slot: String?
    let date: String
    @Environment(NutritionStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var selectedSlot = "comida"
    @State private var items: [LoggedItem] = []
    @State private var questions: [String] = []
    @State private var busy = false
    @State private var pick: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showScanner = false
    @State private var photoPath: String?
    @State private var fromPantry = true
    @State private var result: String?

    var body: some View {
        Form {
            Section {
                Picker("Comida", selection: $selectedSlot) { ForEach(Slots.all, id: \.self) { Text(Slots.name($0)).tag($0) } }
                TextField("Ej.: 200 g de pollo, 80 g de arroz, una cucharada de aceite y una manzana", text: $text, axis: .vertical).lineLimit(2...5)
                Button("Analizar texto", systemImage: "text.magnifyingglass") { Task { await parse(text: text) } }.disabled(text.isEmpty || busy)
                HStack {
                    Button("Foto del plato", systemImage: "camera") { showCamera = true }.buttonStyle(.bordered)
                    PhotosPicker(selection: $pick, matching: .images) { Label("Fototeca", systemImage: "photo") }.buttonStyle(.bordered)
                    Button("Código", systemImage: "barcode.viewfinder") { showScanner = true }.buttonStyle(.bordered).disabled(!DataScannerViewController.isSupported)
                }.font(.caption)
            } footer: { Text("Los macros se calculan con USDA FoodData Central y Open Food Facts. Revisa los gramos: si vienen de una foto son estimados.") }
            if busy { Section { HStack { ProgressView(); Text("Analizando…") } } }
            if !questions.isEmpty { Section("Necesito saber") { ForEach(questions, id: \.self) { Text($0).font(.footnote) } } }
            if !items.isEmpty {
                Section("Alimentos") {
                    ForEach($items) { $i in
                        VStack(alignment: .leading) {
                            HStack { Text(i.name).font(.subheadline); if i.gramsConfidence == "estimado" { Tag(text: "estimado", color: Theme.amber) } }
                            HStack { TextField("g", value: $i.grams, format: .number).keyboardType(.numberPad).textFieldStyle(.roundedBorder).frame(width: 80); Text("g"); Spacer()
                                if let m = i.macros { Text("\(Int(m.kcal)) kcal").font(.caption).foregroundStyle(Theme.text2) } }
                        }
                    }.onDelete { items.remove(atOffsets: $0) }
                    Toggle("Descontar de mi despensa", isOn: $fromPantry)
                    Button("Registrar") { Task { await confirm() } }.disabled(busy)
                }
            }
            if let result { Section { Text(result).font(.footnote) } }
        }
        .navigationTitle("Registrar comida")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } } }
        .onAppear { if let slot { selectedSlot = slot } else { selectedSlot = currentSlot() } }
        .sheet(isPresented: $showCamera) { CameraPicker { img in Task { await parse(image: img) } }.ignoresSafeArea() }
        .sheet(isPresented: $showScanner) { BarcodeScannerView { code in showScanner = false; Task { await parse(barcode: code) } }.ignoresSafeArea() }
        .onChange(of: pick) { _, p in Task { if let d = try? await p?.loadTransferable(type: Data.self), let img = UIImage(data: d) { await parse(image: img) } } }
    }

    private func currentSlot() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 11 ? "desayuno" : h < 13 ? "media_manana" : h < 16 ? "comida" : h < 20 ? "merienda" : "cena"
    }

    struct ParseRes: Decodable { let items: [LoggedItem]; let questions: [String]? }
    private func parse(text: String? = nil, image: UIImage? = nil, barcode: String? = nil) async {
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "parse"; let text: String?; let photoPath: String?; let barcode: String? }
        do {
            if let image, let data = image.resized(maxSide: 1600).jpegData(compressionQuality: 0.8) { photoPath = try await SupabaseService.shared.uploadPhoto(data) }
            let r: ParseRes = try await SupabaseService.shared.call("nutrition-log", B(text: text, photoPath: image != nil ? photoPath : nil, barcode: barcode))
            items += r.items; questions = r.questions ?? []
        } catch { questions = [error.localizedDescription] }
    }

    private func confirm() async {
        busy = true; defer { busy = false }
        struct It: Encodable { let foodId: String; let name: String; let grams: Double }
        struct B: Encodable { let action = "confirm"; let date: String; let slot: String; let items: [It]; let source: String; let deductPantry: Bool; let photoPath: String? }
        struct R: Decodable { let day: D?; let missingInPantry: [NameGrams]; struct D: Decodable { let alerts: [NutritionAlert] } }
        do {
            let r: R = try await SupabaseService.shared.call("nutrition-log", B(date: date, slot: selectedSlot, items: items.map { It(foodId: $0.foodId, name: $0.name, grams: $0.grams) }, source: photoPath != nil ? "foto" : "texto", deductPantry: fromPantry, photoPath: photoPath))
            await store.load()
            let a = r.day?.alerts.map(\.message) ?? []
            if a.isEmpty && r.missingInPantry.isEmpty { dismiss() } else { result = (a + r.missingInPantry.map { "No tenías \($0.name) en la despensa (\(Int($0.grams)) g)." }).joined(separator: "\n"); items = [] }
        } catch { result = error.localizedDescription }
    }
}

struct BarcodeScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])], qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }
    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void; var done = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for case .barcode(let b) in items { if let v = b.payloadStringValue { done = true; s.stopScanning(); onCode(v); return } }
        }
    }
}

// MARK: - Batch cooking

struct BatchCookingView: View {
    @Environment(NutritionStore.self) private var store
    @State private var busy = false
    @State private var error: String?
    @State private var notes: [String] = []
    @State private var unresolved: [String] = []
    @State private var targetWeek = DayKey.string(DayKey.monday(of: Date().addingTimeInterval(86400 * 2)))

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Card {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Menú semanal y batch cooking").font(.headline)
                        Text("Con lo que tienes en la despensa, diseño las recetas del batch, reparto los táperes por días y ajusto cada ración a tus macros según el entreno de ese día.").font(.footnote).foregroundStyle(Theme.text2)
                        Picker("Semana", selection: $targetWeek) {
                            ForEach([0, 7], id: \.self) { o in let w = DayKey.add(o, to: DayKey.string(DayKey.monday(of: Date()))); Text("Semana del \(DayKey.date(w).formatted(.dateTime.day().month()))").tag(w) }
                        }
                        Button(busy ? "Preparando el menú… (1-2 min)" : "Generar menú y batch cooking") { Task { await generate() } }.buttonStyle(.borderedProminent).disabled(busy)
                    }
                }
                if let error { Text(error).foregroundStyle(Theme.red).font(.footnote) }
                ForEach(notes, id: \.self) { Label($0, systemImage: "info.circle").font(.footnote) }
                if !unresolved.isEmpty { Text("No encontré en la base de datos: \(unresolved.joined(separator: ", ")). Revísalos en la despensa.").font(.caption).foregroundStyle(Theme.amber) }
                if let plan = store.week?.batchPlan {
                    SectionTitle(text: "Plan de cocina", trailing: "≈ \(Int(plan.totalMinutes)) min · \(DayKey.date(plan.cookDate).formatted(.dateTime.weekday(.wide)))")
                    ForEach(Array(plan.tasks.enumerated()), id: \.offset) { _, t in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(Int(t.start))′").font(.caption.monospacedDigit()).frame(width: 36, alignment: .trailing).foregroundStyle(Theme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.text).font(.subheadline)
                                Text("\(t.recipe)\(t.equipment.map { " · \($0)" } ?? "") · \(t.hands == "pasiva" ? "puedes hacer otra cosa" : "manos ocupadas")").font(.caption2).foregroundStyle(Theme.text2)
                            }
                        }
                    }
                    ForEach(plan.warnings, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Theme.amber) }
                    SectionTitle(text: "Cantidades totales")
                    ForEach(plan.totals, id: \.recipe) { r in Card(padding: 12) { VStack(alignment: .leading) { Text(r.recipe).font(.subheadline.weight(.semibold)); Text(r.ingredients.map { "\($0.name) \(Int($0.grams)) g" }.joined(separator: " · ")).font(.caption).foregroundStyle(Theme.text2) } } }
                    SectionTitle(text: "Táperes (\(plan.containers.count))")
                    ForEach(plan.containers, id: \.label) { c in
                        Card(padding: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Text(c.label).font(.caption.weight(.semibold)); Spacer(); Tag(text: c.storage, color: c.storage == "congelador" ? Theme.blue : Theme.green) }
                                Text(c.recipe).font(.subheadline)
                                Text(c.contents.map { "\($0.name) \(Int($0.grams)) g" }.joined(separator: " · ")).font(.caption).foregroundStyle(Theme.text2)
                                if let n = c.note { Text(n).font(.caption2).foregroundStyle(Theme.amber) }
                            }
                        }
                    }
                }
                if let shop = store.week?.shopping, !shop.isEmpty {
                    SectionTitle(text: "Lista de la compra")
                    Card { VStack(alignment: .leading, spacing: 6) { ForEach(shop) { l in HStack { Text(l.name); Spacer(); Text("\(Int(l.buyG)) g").monospacedDigit().foregroundStyle(Theme.text2) }.font(.subheadline) } } }
                    ShareLink(item: shop.map { "• \($0.name): \(Int($0.buyG)) g" }.joined(separator: "\n")) { Label("Compartir lista", systemImage: "square.and.arrow.up") }
                }
            }.padding(16)
        }
    }

    private func generate() async {
        busy = true; defer { busy = false }
        struct B: Encodable { let weekStart: String }
        struct R: Decodable { let notes: [String]; let unresolved: [String] }
        do {
            let r: R = try await SupabaseService.shared.call("menu-plan", B(weekStart: targetWeek))
            notes = r.notes; unresolved = r.unresolved; error = nil
            store.weekStart = targetWeek; await store.load()
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Despensa

struct PantryView: View {
    @State private var items: [PantryRow] = []
    @State private var showAdd = false
    var body: some View {
        List {
            ForEach(["congelador", "nevera", "despensa"], id: \.self) { loc in
                Section(loc.capitalized) {
                    ForEach(items.filter { $0.location == loc }) { i in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(i.name)
                                if let e = i.expiresOn { Text("Caduca \(DayKey.date(e).formatted(.dateTime.day().month()))").font(.caption2).foregroundStyle(e <= DayKey.add(3, to: DayKey.today) ? Theme.red : Theme.text2) }
                            }
                            Spacer()
                            Text(i.quantityG.map { "\(Int($0)) g" } ?? i.units.map { "\(Int($0)) ud" } ?? "—").foregroundStyle(Theme.text2).monospacedDigit()
                            if i.foodId == nil { Image(systemName: "questionmark.circle").foregroundStyle(Theme.amber) }
                        }.listRowBackground(Theme.card)
                        .swipeActions { Button("Borrar", role: .destructive) { Task { await delete(i) } } }
                    }
                }
            }
            if items.isEmpty { EmptyState(icon: "refrigerator", title: "Despensa vacía", message: "Dime todo lo que tienes en casa (por voz con el micro del teclado, por texto o con una foto de la nevera).").listRowBackground(Color.clear) }
        }
        .scrollContentBackground(.hidden)
        .safeAreaInset(edge: .bottom) { Button { showAdd = true } label: { Label("Añadir lo que tengo en casa", systemImage: "plus.circle.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).padding() }
        .sheet(isPresented: $showAdd, onDismiss: { Task { await load() } }) { NavigationStack { PantryAddView() } }
        .task { await load() }.refreshable { await load() }
    }
    private func load() async { items = (try? await SupabaseService.shared.client.from("pantry_items").select().order("name").execute().value) ?? [] }
    private func delete(_ i: PantryRow) async { guard let id = i.id else { return }; try? await SupabaseService.shared.client.from("pantry_items").delete().eq("id", value: id).execute(); await load() }
}

struct PantryAddView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var parsed: [ParsedPantryItem] = []
    @State private var questions: [String] = []
    @State private var busy = false
    @State private var showCamera = false
    var body: some View {
        Form {
            Section {
                TextField("Ej.: en el congelador 1 kg de pechuga de pollo y 2 paquetes de salmón; en la nevera 6 huevos, 2 yogures griegos, espinacas; en la despensa arroz, avena y garbanzos", text: $text, axis: .vertical).lineLimit(4...10)
                Button("Organizar", systemImage: "wand.and.stars") { Task { await parse(photo: nil) } }.disabled(text.isEmpty || busy)
                Button("Foto de la nevera o despensa", systemImage: "camera") { showCamera = true }
            } footer: { Text("Puedes dictarlo con el micrófono del teclado. Revisa las cantidades antes de guardar.") }
            if busy { ProgressView() }
            ForEach(questions, id: \.self) { Text($0).font(.footnote).foregroundStyle(Theme.amber) }
            if !parsed.isEmpty {
                Section("Revisa") {
                    ForEach($parsed) { $p in
                        VStack(alignment: .leading) {
                            TextField("Nombre", text: $p.name)
                            HStack {
                                Picker("", selection: $p.location) { Text("Congelador").tag("congelador"); Text("Nevera").tag("nevera"); Text("Despensa").tag("despensa") }.labelsHidden()
                                TextField("g", value: $p.quantityG, format: .number).keyboardType(.numberPad).textFieldStyle(.roundedBorder).frame(width: 70)
                                TextField("ud", value: $p.units, format: .number).keyboardType(.numberPad).textFieldStyle(.roundedBorder).frame(width: 55)
                            }
                        }
                    }.onDelete { parsed.remove(atOffsets: $0) }
                    Button("Guardar \(parsed.count) artículos") { Task { await save() } }.disabled(busy)
                }
            }
        }
        .navigationTitle("Añadir a la despensa")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } } }
        .sheet(isPresented: $showCamera) { CameraPicker { img in Task { await parse(photo: img) } }.ignoresSafeArea() }
    }
    private func parse(photo: UIImage?) async {
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "parse"; let text: String?; let photoPath: String? }
        struct R: Decodable { let items: [ParsedPantryItem]; let questions: [String]? }
        do {
            var path: String?
            if let photo, let d = photo.resized(maxSide: 1600).jpegData(compressionQuality: 0.8) { path = try await SupabaseService.shared.uploadPhoto(d) }
            let r: R = try await SupabaseService.shared.call("pantry", B(text: text.isEmpty ? nil : text, photoPath: path))
            parsed += r.items; questions = r.questions ?? []
        } catch { questions = [error.localizedDescription] }
    }
    private func save() async {
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "save"; let items: [ParsedPantryItem] }
        struct R: Decodable { let saved: Int; let unresolved: [String] }
        do { let r: R = try await SupabaseService.shared.call("pantry", B(items: parsed)); if r.unresolved.isEmpty { dismiss() } else { questions = ["Guardado. Sin datos nutricionales para: \(r.unresolved.joined(separator: ", ")). Escanea su código de barras si es un producto envasado."]; parsed = [] } }
        catch { questions = [error.localizedDescription] }
    }
}

// MARK: - Suplementos

struct SupplementsView: View {
    @Environment(NutritionStore.self) private var store
    @State private var mine: [SupplementRow] = []
    @State private var taken: Set<String> = []
    @State private var adding = SupplementRow(kind: "vitamina_c", name: "Vitamina C", doseText: "")
    private let kinds = [("vitamina_c", "Vitamina C"), ("magnesio", "Magnesio"), ("colageno", "Colágeno"), ("creatina", "Creatina"), ("omega3", "Omega-3"), ("vitamina_d", "Vitamina D"), ("otro", "Otro")]
    var body: some View {
        List {
            Section("Hoy") {
                ForEach(store.week?.supplements.recs ?? []) { r in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: r.take ? "checkmark.seal.fill" : "minus.circle").foregroundStyle(r.take ? Theme.green : Theme.text2)
                            Text(r.name).font(.subheadline.weight(.semibold)); Spacer()
                            if r.take, let sid = r.supplementId { Button(taken.contains(sid) ? "Tomado" : "Marcar") { Task { await mark(sid) } }.font(.caption).buttonStyle(.bordered) }
                        }
                        if let w = r.when, r.take { Text(w).font(.caption).foregroundStyle(Theme.accent) }
                        Text(r.reason).font(.caption).foregroundStyle(Theme.text2)
                    }.listRowBackground(Theme.card)
                }
                ForEach(store.week?.supplements.notes ?? [], id: \.self) { Text($0).font(.caption2).foregroundStyle(Theme.text2).listRowBackground(Theme.card) }
            }
            Section("Los que tengo") {
                ForEach(mine) { s in HStack { Text(s.name); Spacer(); Text(s.doseText).foregroundStyle(Theme.text2); if let st = s.stock { Text("· \(st) dosis").foregroundStyle(Theme.text2) } }.listRowBackground(Theme.card) }
                    .onDelete { idx in let ids = idx.compactMap { mine[$0].id }; Task { for id in ids { try? await SupabaseService.shared.client.from("supplements").delete().eq("id", value: id).execute() }; await load() } }
            }
            Section("Añadir") {
                Picker("Tipo", selection: $adding.kind) { ForEach(kinds, id: \.0) { Text($0.1).tag($0.0) } }
                    .onChange(of: adding.kind) { _, k in adding.name = kinds.first { $0.0 == k }?.1 ?? "" }
                TextField("Nombre", text: $adding.name)
                TextField("Dosis (p. ej. 500 mg, 15 g)", text: $adding.doseText)
                TextField("Dosis que te quedan", value: $adding.stock, format: .number).keyboardType(.numberPad)
                Button("Añadir") { Task { var s = adding; s.userId = SupabaseService.shared.userId; try? await SupabaseService.shared.client.from("supplements").insert(s).execute(); adding.doseText = ""; await load(); await store.load() } }.disabled(adding.doseText.isEmpty)
            }
        }
        .scrollContentBackground(.hidden)
        .task { await load() }
    }
    private func load() async {
        mine = (try? await SupabaseService.shared.client.from("supplements").select().eq("active", value: true).execute().value) ?? []
        struct L: Decodable { let supplementId: String }
        let logs: [L] = (try? await SupabaseService.shared.client.from("supplement_logs").select("supplement_id").eq("date", value: DayKey.today).execute().value) ?? []
        taken = Set(logs.map(\.supplementId))
    }
    private func mark(_ id: String) async {
        struct Row: Encodable { let userId: String; let date: String; let supplementId: String }
        guard let uid = SupabaseService.shared.userId, !taken.contains(id) else { return }
        try? await SupabaseService.shared.client.from("supplement_logs").upsert(Row(userId: uid, date: DayKey.today, supplementId: id), onConflict: "user_id,date,supplement_id").execute()
        if let s = mine.first(where: { $0.id == id }), let st = s.stock, st > 0 {
            struct U: Encodable { let stock: Int }
            try? await SupabaseService.shared.client.from("supplements").update(U(stock: st - 1)).eq("id", value: id).execute()
        }
        await load()
    }
}

// MARK: - Objetivo nutricional

struct NutritionSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var s = NutritionSettingsRow()
    @State private var originalMode = ""
    @State private var dislikes = ""
    @State private var intolerances = ""
    var body: some View {
        Form {
            Section {
                Picker("Objetivo", selection: $s.mode) { ForEach(GoalModes.all, id: \.0) { Text($0.1).tag($0.0) } }
                if s.mode == "definicion" || s.mode == "volumen" {
                    Stepper(String(format: "Ritmo: %.2f kg/semana", s.rateKgPerWeek ?? (s.mode == "definicion" ? 0.4 : 0.2)), value: Binding(get: { s.rateKgPerWeek ?? (s.mode == "definicion" ? 0.4 : 0.2) }, set: { s.rateKgPerWeek = $0 }), in: 0.1...0.8, step: 0.05)
                }
                Stepper(String(format: "Proteína: %.1f g/kg", s.proteinGPerKg ?? (s.mode == "definicion" ? 2.2 : 2.0)), value: Binding(get: { s.proteinGPerKg ?? (s.mode == "definicion" ? 2.2 : 2.0) }, set: { s.proteinGPerKg = $0 }), in: 1.4...2.6, step: 0.1)
                Picker("Actividad fuera del entreno", selection: $s.activityFactor) { Text("Sedentaria").tag(1.3); Text("Ligera").tag(1.4); Text("Activa").tag(1.5); Text("Muy activa").tag(1.6) }
            } header: { Text("Objetivo") } footer: { Text("Puedes cambiarlo cuando quieras (p. ej. definir ahora y ganar masa después): recalculo todos tus días a partir de hoy. Los hidratos suben y bajan con el entreno de cada día.") }
            Section("Comidas que haces") {
                ForEach(Slots.all, id: \.self) { slot in
                    Toggle(Slots.name(slot), isOn: Binding(get: { s.mealSlots.contains(slot) }, set: { on in if on { s.mealSlots.append(slot) } else { s.mealSlots.removeAll { $0 == slot } } }))
                }
            }
            Section("Batch cooking") { Picker("Día de cocinar", selection: $s.batchDay) { ForEach(1...7, id: \.self) { Text(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][$0 - 1]).tag($0) } } }
            Section("Preferencias") {
                TextField("No me gusta (separado por comas)", text: $dislikes)
                TextField("Intolerancias o alergias", text: $intolerances)
                Stepper("Máx. suplementos al día: \(s.maxSupplementsPerDay.map(String.init) ?? "sin límite")", value: Binding(get: { s.maxSupplementsPerDay ?? 0 }, set: { s.maxSupplementsPerDay = $0 == 0 ? nil : $0 }), in: 0...5)
                Toggle("Avisos de macros y suplementos", isOn: $s.notify)
                Toggle("Compensar a lo largo de la semana", isOn: $s.compensate)
                Picker("Día de hacer la compra", selection: $s.shoppingDay) { ForEach(1...7, id: \.self) { Text(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][$0 - 1]).tag($0) } }
            }
            Section { Text("Forja es una herramienta de planificación, no sustituye a un dietista-nutricionista. Si tienes una patología, tomas medicación o notas que tu relación con la comida empeora, consulta con un profesional.").font(.caption).foregroundStyle(Theme.text2) }
        }
        .navigationTitle("Objetivo nutricional")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Guardar") { Task { await save() } } }
                   ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
        .task {
            let rows: [NutritionSettingsRow] = (try? await SupabaseService.shared.client.from("nutrition_settings").select().execute().value) ?? []
            if let r = rows.first { s = r }
            originalMode = s.mode; dislikes = s.dislikes.joined(separator: ", "); intolerances = s.intolerances.joined(separator: ", ")
        }
    }
    private func save() async {
        let uid = SupabaseService.shared.userId
        s.userId = uid
        s.dislikes = dislikes.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        s.intolerances = intolerances.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        UserDefaults.standard.set(s.notify, forKey: "nutrition.notify")
        try? await SupabaseService.shared.client.from("nutrition_settings").upsert(s, onConflict: "user_id").execute()
        if s.mode != originalMode, let uid {
            struct H: Encodable { let userId: String; let mode: String; let fromDate: String }
            try? await SupabaseService.shared.client.from("nutrition_goal_history").insert(H(userId: uid, mode: s.mode, fromDate: DayKey.today)).execute()
        }
        dismiss()
    }
}

// MARK: - Lista de la compra

struct ShoppingListView: View {
    @State private var list: ShoppingListDTO?
    @State private var checked: Set<String> = []
    @State private var busy = false
    @State private var weekOffset = 7
    @State private var message: String?
    private var weekStart: String { DayKey.add(weekOffset, to: DayKey.string(DayKey.monday(of: Date()))) }

    var body: some View {
        List {
            Section {
                Picker("Semana", selection: $weekOffset) { Text("Esta semana").tag(0); Text("Semana que viene").tag(7) }.pickerStyle(.segmented)
                Button(busy ? "Calculando…" : "Calcular la compra") { Task { await build() } }.disabled(busy)
            } footer: { Text("Lo que vas a comer esa semana menos lo que tienes en congelador, nevera y despensa, descontando lo que aún comerás antes y lo que caduca antes de usarlo. Incluye un 5 % de margen.") }
            if let note = list?.note { Text(note).foregroundStyle(Theme.text2) }
            let groups = Dictionary(grouping: list?.items ?? [], by: \.aisle)
            ForEach(groups.keys.sorted(), id: \.self) { aisle in
                Section(aisle) {
                    ForEach(groups[aisle]!) { i in
                        Button { Task { await toggle(i.foodId) } } label: {
                            HStack(alignment: .top) {
                                Image(systemName: checked.contains(i.foodId) ? "checkmark.circle.fill" : "circle").foregroundStyle(checked.contains(i.foodId) ? Theme.green : Theme.text2)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(i.name).strikethrough(checked.contains(i.foodId))
                                    Text("Necesitas \(Int(i.needG)) g · tienes \(Int(i.haveG)) g · desde el \(DayKey.date(i.firstNeeded).formatted(.dateTime.weekday(.abbreviated)))").font(.caption2).foregroundStyle(Theme.text2)
                                    if let n = i.note { Text(n).font(.caption2).foregroundStyle(Theme.amber) }
                                }
                                Spacer()
                                Text(i.buyUnits.map { "\($0) ud" } ?? "\(Int(i.buyG)) g").monospacedDigit().font(.subheadline.weight(.semibold))
                            }
                        }.buttonStyle(.plain).listRowBackground(Theme.card)
                    }
                }
            }
            if let covered = list?.coveredByStock, !covered.isEmpty {
                Section("Ya lo tienes en casa") { DisclosureGroup("\(covered.count) alimentos cubiertos") { ForEach(covered, id: \.name) { Text("\($0.name) · \(Int($0.grams)) g").font(.caption) } } }
            }
            if !(list?.items.isEmpty ?? true) {
                Section {
                    Button("Pasar lo marcado a la despensa (\(checked.count))") { Task { await bought() } }.disabled(checked.isEmpty || busy)
                    ShareLink(item: shareText) { Label("Compartir lista", systemImage: "square.and.arrow.up") }
                } footer: { Text("La carne y el pescado de los 2 próximos días van a la nevera; el resto, al congelador.") }
            }
            if let message { Text(message).font(.footnote).foregroundStyle(Theme.green) }
        }
        .scrollContentBackground(.hidden)
        .task(id: weekOffset) { await build() }
    }

    private var shareText: String {
        let g = Dictionary(grouping: list?.items ?? [], by: \.aisle)
        return g.keys.sorted().map { a in "\(a.uppercased())\n" + g[a]!.map { "☐ \($0.name) – \($0.buyUnits.map { "\($0) ud" } ?? "\(Int($0.buyG)) g")" }.joined(separator: "\n") }.joined(separator: "\n\n")
    }

    private func build() async {
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "build"; let weekStart: String }
        do { list = try await SupabaseService.shared.call("shopping-list", B(weekStart: weekStart)); checked = Set(list?.checked ?? []) } catch { message = error.localizedDescription }
    }
    private func toggle(_ id: String) async {
        let on = !checked.contains(id); if on { checked.insert(id) } else { checked.remove(id) }
        struct B: Encodable { let action = "check"; let weekStart: String; let foodId: String; let checked: Bool }
        struct R: Decodable { let checked: [String] }
        _ = try? await SupabaseService.shared.call("shopping-list", B(weekStart: weekStart, foodId: id, checked: on), as: R.self)
    }
    private func bought() async {
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "bought"; let weekStart: String }
        struct R: Decodable { let addedToPantry: Int }
        do { let r: R = try await SupabaseService.shared.call("shopping-list", B(weekStart: weekStart)); message = "\(r.addedToPantry) artículos añadidos a tu despensa."; await build() } catch { message = error.localizedDescription }
    }
}
