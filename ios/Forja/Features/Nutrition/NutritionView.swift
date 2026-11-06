import SwiftUI

@MainActor @Observable
final class NutritionStore {
    var week: NutritionWeek?
    var loading = false
    var error: String?
    var weekStart = DayKey.string(DayKey.monday(of: Date()))

    func load() async {
        loading = true; defer { loading = false }
        struct B: Encodable { let weekStart: String }
        do {
            week = try await SupabaseService.shared.call("nutrition-day", B(weekStart: weekStart))
            if let week { NotificationService.schedule(from: week) }
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    var lastAdjustments: [MealAdjustmentDTO] = []

    @discardableResult
    func update(meal: String, action: String, ingredients: [MealIngredient]? = nil, recipeId: String? = nil, fraction: Double? = nil) async -> [NutritionAlert] {
        struct B: Encodable { let mealId: String; let action: String; let ingredients: [MealIngredient]?; let recipeId: String?; let fraction: Double? }
        struct R: Decodable { let alerts: [NutritionAlert]; let adjustments: [MealAdjustmentDTO]? }
        do {
            let r: R = try await SupabaseService.shared.call("meal-update", B(mealId: meal, action: action, ingredients: ingredients, recipeId: recipeId, fraction: fraction))
            lastAdjustments = r.adjustments ?? []
            await load(); return r.alerts
        } catch { self.error = error.localizedDescription; return [] }
    }

    var today: NutritionDay? { week?.days.first { $0.date == DayKey.today } }
}

struct NutritionView: View {
    @State private var store = NutritionStore()
    @State private var tab = 0
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(["Hoy", "Menú", "Compra", "Batch", "Despensa", "Suplementos"].enumerated()), id: \.offset) { i, t in
                        Button(t) { tab = i }.font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                            .background(tab == i ? Theme.accent : Theme.card, in: Capsule()).foregroundStyle(tab == i ? .black : .white).buttonStyle(.plain)
                    }
                }.padding(.horizontal, 16).padding(.vertical, 8)
            }
            Group {
                switch tab {
                case 0: NutritionTodayView()
                case 1: WeekMenuView()
                case 2: ShoppingListView()
                case 3: BatchCookingView()
                case 4: PantryView()
                default: SupplementsView()
                }
            }.frame(maxHeight: .infinity)
        }
        .screenBackground()
        .navigationTitle("Nutrición")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showSettings = true } label: { Image(systemName: "target") } } }
        .sheet(isPresented: $showSettings, onDismiss: { Task { await store.load() } }) { NavigationStack { NutritionSettingsView() } }
        .environment(store)
        .task { await NotificationService.requestPermission(); await store.load() }
    }
}

// MARK: - Hoy

struct NutritionTodayView: View {
    @Environment(NutritionStore.self) private var store
    @State private var logging: String?    // slot
    @State private var editing: MealDTO?
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let d = store.today {
                    MacroSummaryCard(day: d)
                    ForEach(d.alerts, id: \.message) { a in Card(padding: 12) { Label(a.message, systemImage: "exclamationmark.bubble").font(.footnote).foregroundStyle(Theme.amber) } }
                    if let m = store.week?.balance.message { Card(padding: 12) { Label(m, systemImage: "calendar.badge.clock").font(.footnote) } }
                    let adj = d.adjustments ?? store.lastAdjustments
                    if !adj.isEmpty {
                        Card(padding: 12) {
                            VStack(alignment: .leading, spacing: 6) {
                                Label("He reajustado lo que te queda hoy", systemImage: "arrow.triangle.2.circlepath").font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                                ForEach(adj, id: \.mealId) { Text("• " + $0.text.prefix(1).uppercased() + $0.text.dropFirst()).font(.footnote) }
                            }
                        }
                    }
                    ForEach(d.meals.sorted { Slots.all.firstIndex(of: $0.slot) ?? 0 < Slots.all.firstIndex(of: $1.slot) ?? 0 }) { m in
                        MealCard(meal: m, onEdit: { editing = m }, onAction: { action, fraction in Task { await store.update(meal: m.id, action: action, fraction: fraction) } })
                    }
                    HStack {
                        Button { logging = "" } label: { Label("He comido algo extra", systemImage: "plus.circle.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
                    }
                    if let a = d.adherence { Text("Cumplimiento de hoy: \(a.mealsDone)/\(a.mealsTotal) comidas · \(a.score)/100").font(.caption).foregroundStyle(Theme.text2) }
                    DisclosureGroup("Por qué estos objetivos") { VStack(alignment: .leading, spacing: 4) { ForEach(d.target.explanation, id: \.self) { Text($0).font(.caption) } } }.foregroundStyle(Theme.text2)
                } else if store.loading { ProgressView().padding(40) }
                else { EmptyState(icon: "fork.knife", title: "Sin datos", message: store.error ?? "Configura tu objetivo nutricional (icono de diana).") }
            }.padding(16)
        }
        .refreshable { await store.load() }
        .sheet(item: Binding(get: { logging.map { SlotBox(slot: $0) } }, set: { logging = $0?.slot })) { b in NavigationStack { LogFoodView(slot: b.slot.isEmpty ? nil : b.slot, date: DayKey.today) } }
        .sheet(item: $editing) { m in NavigationStack { MealEditorView(meal: m) } }
    }
}
struct SlotBox: Identifiable { let slot: String; var id: String { slot } }

struct MacroSummaryCard: View {
    let day: NutritionDay
    var body: some View {
        Card {
            VStack(spacing: 12) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Día de carga \(day.target.load)").font(.caption).foregroundStyle(Theme.text2)
                        Text("\(Int(day.totals.kcal)) / \(Int(day.target.macros.kcal)) kcal").font(.title2.weight(.bold)).monospacedDigit()
                    }
                    Spacer()
                    RingGauge(value: day.totals.kcal / max(1, day.target.macros.kcal), color: Theme.accent, lineWidth: 8, label: "\(Int(min(999, day.totals.kcal / max(1, day.target.macros.kcal) * 100)))%").frame(width: 70, height: 70).font(.caption)
                }
                macroBar("Proteína", day.totals.protein, day.target.macros.protein, Theme.red)
                macroBar("Hidratos", day.totals.carbs, day.target.macros.carbs, Theme.blue)
                macroBar("Grasa", day.totals.fat, day.target.macros.fat, Theme.amber)
                Text("Previsto con el menú + lo registrado fuera del menú (\(Int(day.eaten.kcal)) kcal).").font(.caption2).foregroundStyle(Theme.text2)
            }
        }
    }
    private func macroBar(_ n: String, _ v: Double, _ t: Double, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack { Text(n).font(.caption); Spacer(); Text("\(Int(v)) / \(Int(t)) g").font(.caption.weight(.semibold)).monospacedDigit() }
            ProgressView(value: min(1, v / max(1, t))).tint(abs(v - t) / max(1, t) > 0.12 ? Theme.amber : c)
        }
    }
}

struct MealCard: View {
    let meal: MealDTO; let onEdit: () -> Void; let onAction: (String, Double?) -> Void
    var body: some View {
        Card(padding: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(Slots.name(meal.slot)).font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                    if meal.locked == true { Image(systemName: "lock.fill").font(.caption2) }
                    Spacer()
                    Text("\(Int(meal.macros.kcal)) kcal · P\(Int(meal.macros.protein)) C\(Int(meal.macros.carbs)) G\(Int(meal.macros.fat))").font(.caption).monospacedDigit().foregroundStyle(Theme.text2)
                }
                Text(meal.title).font(.subheadline.weight(.semibold)).strikethrough(meal.status == "skipped")
                Text(meal.ingredients.map { "\($0.name) \(Int($0.grams)) g" }.joined(separator: " · ")).font(.caption).foregroundStyle(Theme.text2)
                HStack(spacing: 6) {
                    switch meal.status {
                    case "eaten": Label("Cumplido", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(Theme.green)
                        Button("Deshacer") { onAction("reset", nil) }.font(.caption).buttonStyle(.borderless)
                    case "skipped": Label("No comido", systemImage: "xmark.circle.fill").font(.caption).foregroundStyle(Theme.red)
                        Button("Deshacer") { onAction("reset", nil) }.font(.caption).buttonStyle(.borderless)
                    default:
                        Button { onAction("eaten", nil) } label: { Label("Cumplido", systemImage: "checkmark") }.font(.caption).buttonStyle(.bordered).tint(Theme.green)
                        Menu { Button("¼ de la ración") { onAction("partial", 0.25) }; Button("La mitad") { onAction("partial", 0.5) }; Button("¾ de la ración") { onAction("partial", 0.75) }; Button("Un 25 % más") { onAction("partial", 1.25) } } label: { Label("A medias", systemImage: "circle.lefthalf.filled") }.font(.caption).buttonStyle(.bordered)
                        Button { onAction("skip", nil) } label: { Label("No", systemImage: "xmark") }.font(.caption).buttonStyle(.bordered).tint(Theme.red)
                    }
                    Button(action: onEdit) { Image(systemName: "pencil") }.font(.caption).buttonStyle(.bordered)
                    if meal.fromBatch == true { Spacer(); Tag(text: "batch", color: Theme.purple) }
                }
            }
        }
    }
}

// MARK: - Menú semanal

struct WeekMenuView: View {
    @Environment(NutritionStore.self) private var store
    @State private var editing: MealDTO?
    var body: some View {
        List {
            Section {
                HStack {
                    Button { shift(-7) } label: { Image(systemName: "chevron.left") }.buttonStyle(.borderless)
                    Spacer(); Text("Semana del \(DayKey.date(store.weekStart).formatted(.dateTime.day().month()))").font(.headline); Spacer()
                    Button { shift(7) } label: { Image(systemName: "chevron.right") }.buttonStyle(.borderless)
                }
            }.listRowBackground(Color.clear)
            ForEach(store.week?.days ?? []) { d in
                Section {
                    ForEach(d.meals) { m in
                        Button { editing = m } label: {
                            HStack {
                                VStack(alignment: .leading) { Text(Slots.name(m.slot)).font(.caption).foregroundStyle(Theme.accent); Text(m.title).font(.subheadline) }
                                Spacer(); Text("\(Int(m.macros.kcal))").font(.caption).monospacedDigit().foregroundStyle(Theme.text2)
                                if m.status == "edited" || m.locked == true { Image(systemName: "pencil.circle.fill").foregroundStyle(Theme.amber) }
                            }
                        }.listRowBackground(Theme.card)
                    }
                    if d.meals.isEmpty { Text("Sin menú. Genéralo en Batch.").font(.caption).foregroundStyle(Theme.text2).listRowBackground(Theme.card) }
                    ForEach(d.alerts, id: \.message) { Text($0.message).font(.caption).foregroundStyle(Theme.amber).listRowBackground(Theme.card) }
                } header: {
                    HStack { Text(DayKey.date(d.date).formatted(.dateTime.weekday(.wide).day())); Spacer()
                        Text("\(Int(d.totals.kcal))/\(Int(d.target.macros.kcal)) kcal · \(Int(d.totals.protein))/\(Int(d.target.macros.protein)) P").monospacedDigit() }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .refreshable { await store.load() }
        .sheet(item: $editing) { m in NavigationStack { MealEditorView(meal: m) } }
    }
    private func shift(_ d: Int) { store.weekStart = DayKey.add(d, to: store.weekStart); Task { await store.load() } }
}

struct MealEditorView: View {
    @Environment(NutritionStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var meal: MealDTO
    @State private var recipes: [RecipeRow] = []
    @State private var alerts: [NutritionAlert] = []
    struct RecipeRow: Decodable, Identifiable { let id: String; let name: String; let tags: [String] }

    var body: some View {
        Form {
            Section("Cantidades") {
                ForEach($meal.ingredients) { $i in
                    HStack { Text(i.name); Spacer(); TextField("g", value: $i.grams, format: .number).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 70); Text("g").foregroundStyle(Theme.text2) }
                }.onDelete { meal.ingredients.remove(atOffsets: $0) }
                Button("Guardar cambios y reajustar el día") { Task { alerts = await store.update(meal: meal.id, action: "edit", ingredients: meal.ingredients); if alerts.isEmpty { dismiss() } } }
            } footer: { Text("Al cambiar una comida, ajusto las raciones de las que quedan para cuadrar tus macros y calorías del día.") }
            if !alerts.isEmpty { Section("Avisos") { ForEach(alerts, id: \.message) { Text($0.message).font(.footnote).foregroundStyle(Theme.amber) }; Button("Entendido") { dismiss() } } }
            Section("Cambiar por otro plato") {
                ForEach(recipes) { r in Button(r.name) { Task { _ = await store.update(meal: meal.id, action: "swap", recipeId: r.id); dismiss() } } }
            }
            Section {
                Button(meal.locked == true ? "Desbloquear (permitir reajustes)" : "Fijar esta comida tal cual") { Task { _ = await store.update(meal: meal.id, action: meal.locked == true ? "unlock" : "lock"); dismiss() } }
                Button("No voy a hacer esta comida", role: .destructive) { Task { _ = await store.update(meal: meal.id, action: "skip"); dismiss() } }
                if meal.status == "edited" || meal.status == "skipped" { Button("Volver a la propuesta original") { Task { _ = await store.update(meal: meal.id, action: "reset"); dismiss() } } }
            }
        }
        .navigationTitle("\(Slots.name(meal.slot)) · \(DayKey.date(meal.date).formatted(.dateTime.weekday(.abbreviated).day()))")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } } }
        .task { recipes = (try? await SupabaseService.shared.client.from("recipes").select("id, name, tags").order("created_at", ascending: false).limit(30).execute().value) ?? [] }
    }
}
