import SwiftUI
import Supabase

struct ProfileView: View {
    @Environment(AppState.self) private var app
    var body: some View {
        List {
            Section("Perfil deportivo") {
                NavigationLink("Datos personales y físicos") { PersonalDataView() }
                NavigationLink("Frecuencia cardíaca y fisiología") { PhysiologyView() }
                NavigationLink("Disponibilidad semanal") { AvailabilityView() }
                NavigationLink("Preferencias de entrenamiento") { PreferencesView() }
                NavigationLink("Lesiones y molestias") { InjuriesView() }
            }
            Section("Planificación") { NavigationLink("Objetivos y competiciones") { GoalsView() } }
            Section("Conexiones") {
                NavigationLink("Apple Health y Apple Watch") { HealthSettingsView() }
                NavigationLink("Calendario y WodBuster") { CalendarSettingsView() }
                NavigationLink("Strava") { StravaSettingsView() }
            }
            Section("Privacidad y datos") {
                NavigationLink("Privacidad e IA") { PrivacyView() }
                NavigationLink("Exportar mis datos") { ExportView() }
            }
            Section { Button("Cerrar sesión", role: .destructive) { Task { await app.signOut() } } }
        }
        .scrollContentBackground(.hidden).screenBackground().navigationTitle("Perfil")
    }
}

// MARK: - Datos personales

struct PersonalDataView: View {
    @Environment(AppState.self) private var app
    @State private var name = ""; @State private var birth = Date(timeIntervalSince1970: 631152000); @State private var sex = "male"
    @State private var height = ""; @State private var weight = ""; @State private var fat = ""; @State private var experience = ""
    var body: some View {
        Form {
            TextField("Nombre", text: $name)
            DatePicker("Fecha de nacimiento", selection: $birth, displayedComponents: .date)
            Picker("Sexo (para pesos de referencia)", selection: $sex) { Text("Hombre").tag("male"); Text("Mujer").tag("female") }
            TextField("Altura (cm)", text: $height).keyboardType(.decimalPad)
            TextField("Peso (kg)", text: $weight).keyboardType(.decimalPad)
            TextField("Grasa corporal (%) — opcional", text: $fat).keyboardType(.decimalPad)
            Section("Experiencia deportiva") { TextField("Años entrenando, disciplinas, marcas…", text: $experience, axis: .vertical) }
            Button("Guardar") { Task { await save() } }
        }
        .navigationTitle("Datos personales")
        .task {
            guard let p = app.profile else { return }
            name = p.displayName ?? ""; sex = p.sex ?? "male"; height = p.heightCm.map { String(format: "%g", $0) } ?? ""; experience = p.experience ?? ""
            if let b = p.birthDate { birth = DayKey.date(b) }
        }
    }
    private func save() async {
        guard let uid = SupabaseService.shared.userId else { return }
        struct Upd: Encodable { let displayName: String; let birthDate: String; let sex: String; let heightCm: Double?; let experience: String }
        do {
            try await SupabaseService.shared.client.from("profiles").update(Upd(displayName: name, birthDate: DayKey.string(birth), sex: sex, heightCm: Double(height.replacingOccurrences(of: ",", with: ".")), experience: experience)).eq("id", value: uid).execute()
            if let w = Double(weight.replacingOccurrences(of: ",", with: ".")) {
                try await SupabaseService.shared.client.from("body_metrics").upsert(BodyMetric(userId: uid, date: DayKey.today, weightKg: w, bodyFatPct: Double(fat.replacingOccurrences(of: ",", with: "."))), onConflict: "user_id,date,source").execute()
            }
            await app.loadProfile(); app.toast = "Guardado"
        } catch { app.toast = error.localizedDescription }
    }
}

// MARK: - Fisiología

struct PhysiologyView: View {
    @Environment(AppState.self) private var app
    @State private var rest = ""; @State private var max = ""; @State private var lthr = ""; @State private var history: [Physiology] = []
    var body: some View {
        Form {
            Section {
                TextField("FC en reposo (ppm)", text: $rest).keyboardType(.numberPad)
                TextField("FC máxima medida (ppm)", text: $max).keyboardType(.numberPad)
                TextField("FC de umbral (ppm) — si la conoces", text: $lthr).keyboardType(.numberPad)
            } footer: { Text("Usa valores medidos: FC máxima vista en una competición o test, no la fórmula 220−edad. Con la FC de umbral las zonas son más precisas. Si no la sabes, Forja usa tu FC de reposo y máxima (Karvonen).") }
            Button("Guardar (desde hoy)") { Task { await save() } }
            if !history.isEmpty { Section("Historial") { ForEach(history, id: \.effectiveFrom) { h in Text("\(h.effectiveFrom): reposo \(h.hrRest ?? 0) · máx \(h.hrMax ?? 0)\(h.lthr.map { " · umbral \($0)" } ?? "")").font(.footnote) } } }
        }
        .navigationTitle("Fisiología")
        .task { await load() }
    }
    private func load() async {
        history = (try? await SupabaseService.shared.client.from("physiology").select().order("effective_from", ascending: false).execute().value) ?? []
        if let h = history.first { rest = h.hrRest.map(String.init) ?? ""; max = h.hrMax.map(String.init) ?? ""; lthr = h.lthr.map(String.init) ?? "" }
    }
    private func save() async {
        let row = Physiology(userId: SupabaseService.shared.userId, effectiveFrom: DayKey.today, hrRest: Int(rest), hrMax: Int(max), lthr: Int(lthr), method: "manual")
        do { try await SupabaseService.shared.client.from("physiology").upsert(row, onConflict: "user_id,effective_from").execute(); await load(); app.toast = "Zonas actualizadas" }
        catch { app.toast = error.localizedDescription }
    }
}

// MARK: - Disponibilidad

struct AvailabilityView: View {
    @Environment(AppState.self) private var app
    @State private var days: [Availability] = (1...7).map { Availability(weekday: $0, am: false, pm: $0 <= 5, maxMinutes: $0 >= 6 ? 120 : 75, boxClass: false) }
    private let names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    var body: some View {
        Form {
            ForEach($days) { $d in
                Section(names[d.weekday - 1]) {
                    Toggle("Mañana", isOn: $d.am); Toggle("Tarde", isOn: $d.pm)
                    Stepper("Máximo \(d.maxMinutes) min", value: $d.maxMinutes, in: 0...300, step: 15)
                    Toggle("Clase de CrossFit en el box", isOn: $d.boxClass)
                }
            }
            Button("Guardar y recalcular plan") { Task { await save() } }
        }
        .navigationTitle("Disponibilidad")
        .task {
            let rows: [Availability] = (try? await SupabaseService.shared.client.from("availability").select().order("weekday").execute().value) ?? []
            if rows.count == 7 { days = rows }
        }
    }
    func save() async {
        let uid = SupabaseService.shared.userId
        do {
            try await SupabaseService.shared.client.from("availability").upsert(days.map { var d = $0; d.userId = uid; return d }, onConflict: "user_id,weekday").execute()
            try await SupabaseService.shared.replan(trigger: "goal_change"); await app.refresh(); app.toast = "Plan recalculado con tu disponibilidad"
        } catch { app.toast = error.localizedDescription }
    }
}

// MARK: - Preferencias

struct PreferencesView: View {
    @Environment(AppState.self) private var app
    @State private var doubles = true; @State private var cf = 3; @State private var division = "open_men"; @State private var sleep = 7.5
    var body: some View {
        Form {
            Toggle("Permitir sesiones dobles (p. ej. rodaje suave por la mañana + CrossFit por la tarde)", isOn: $doubles)
            Stepper("CrossFit: \(cf) sesiones/semana", value: $cf, in: 0...6)
            Picker("Categoría HYROX", selection: $division) { Text("Open hombre").tag("open_men"); Text("Open mujer").tag("open_women"); Text("Pro hombre").tag("pro_men"); Text("Pro mujer").tag("pro_women") }
            Stepper(String(format: "Sueño que necesitas: %.1f h", sleep), value: $sleep, in: 6...10, step: 0.5)
            Button("Guardar y recalcular plan") { Task { await save() } }
        }
        .navigationTitle("Preferencias")
        .task { if let p = app.profile { doubles = p.allowDoubles; cf = p.crossfitPerWeek; division = p.hyroxDivision ?? "open_men"; sleep = p.sleepNeedH } }
    }
    private func save() async {
        struct Upd: Encodable { let allowDoubles: Bool; let crossfitPerWeek: Int; let hyroxDivision: String; let sleepNeedH: Double }
        do {
            try await SupabaseService.shared.client.from("profiles").update(Upd(allowDoubles: doubles, crossfitPerWeek: cf, hyroxDivision: division, sleepNeedH: sleep)).eq("id", value: SupabaseService.shared.userId ?? "").execute()
            try await SupabaseService.shared.replan(trigger: "goal_change"); await app.loadProfile(); app.toast = "Plan recalculado"
        } catch { app.toast = error.localizedDescription }
    }
}

// MARK: - Lesiones

struct InjuriesView: View {
    @State private var items: [Injury] = []
    @State private var area = ""; @State private var desc = ""
    var body: some View {
        Form {
            Section("Activas") {
                ForEach(items.filter { $0.resolvedOn == nil }) { i in
                    VStack(alignment: .leading) { Text(i.area).font(.headline); if let d = i.description { Text(d).font(.footnote).foregroundStyle(Theme.text2) } }
                        .swipeActions { Button("Resuelta") { Task { await resolve(i) } }.tint(Theme.green) }
                }
            }
            Section("Añadir") {
                TextField("Zona", text: $area); TextField("Descripción / diagnóstico de tu fisio", text: $desc, axis: .vertical)
                Button("Guardar") { Task { await add() } }.disabled(area.isEmpty)
            }
            Section("Historial") { ForEach(items.filter { $0.resolvedOn != nil }) { Text("\($0.area) · resuelta \($0.resolvedOn ?? "")").font(.footnote) } }
        }
        .navigationTitle("Lesiones").task { await load() }
    }
    private func load() async { items = (try? await SupabaseService.shared.client.from("injuries").select().order("created_at", ascending: false).execute().value) ?? [] }
    private func add() async {
        try? await SupabaseService.shared.client.from("injuries").insert(Injury(userId: SupabaseService.shared.userId, area: area, description: desc, startedOn: DayKey.today)).execute()
        area = ""; desc = ""; await load()
    }
    private func resolve(_ i: Injury) async {
        guard let id = i.id else { return }
        struct U: Encodable { let resolvedOn: String }
        try? await SupabaseService.shared.client.from("injuries").update(U(resolvedOn: DayKey.today)).eq("id", value: id).execute(); await load()
    }
}

// MARK: - Objetivos

struct GoalsView: View {
    @Environment(AppState.self) private var app
    @State private var editing: Goal?
    var body: some View {
        List {
            ForEach(app.goals) { g in
                Button { editing = g } label: {
                    VStack(alignment: .leading) {
                        HStack { Text(g.name).font(.headline); Spacer(); Tag(text: "Prioridad \(g.priority)", color: g.priority == "A" ? Theme.accent : Theme.text2) }
                        Text(DayKey.date(g.date).formatted(.dateTime.day().month(.wide).year())).font(.footnote).foregroundStyle(Theme.text2)
                    }
                }
            }
            Button("Añadir objetivo", systemImage: "plus") { editing = Goal(name: "", type: "half_marathon", date: DayKey.add(84, to: DayKey.today), priority: "A") }
        }
        .navigationTitle("Objetivos")
        .sheet(item: $editing) { g in NavigationStack { GoalEditor(goal: g) } }
    }
}

extension Goal { var stableId: String { id ?? "new-\(name)-\(date)" } }

struct GoalEditor: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State var goal: Goal
    @State private var date = Date()
    @State private var target = ""
    var body: some View {
        Form {
            TextField("Nombre", text: $goal.name)
            Picker("Tipo", selection: $goal.type) {
                Text("Media maratón").tag("half_marathon"); Text("Maratón").tag("marathon"); Text("10K").tag("10k"); Text("5K").tag("5k")
                Text("HYROX").tag("hyrox"); Text("Competición CrossFit").tag("crossfit_comp"); Text("Fuerza").tag("strength"); Text("General").tag("general")
            }
            DatePicker("Fecha", selection: $date, displayedComponents: .date)
            Picker("Prioridad", selection: $goal.priority) { Text("A (principal)").tag("A"); Text("B").tag("B"); Text("C").tag("C") }
            TextField("Tiempo objetivo (h:mm:ss) — opcional", text: $target)
            if goal.id != nil { Button("Eliminar objetivo", role: .destructive) { Task { await setStatus("cancelled") } } }
        }
        .navigationTitle(goal.id == nil ? "Nuevo objetivo" : "Editar objetivo")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Guardar") { Task { await save() } }.disabled(goal.name.isEmpty) }
                   ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
        .task { date = DayKey.date(goal.date); target = goal.targetTimeS.map { fmtDuration(Double($0)) } ?? "" }
    }
    private func save() async {
        goal.date = DayKey.string(date); goal.userId = SupabaseService.shared.userId
        let parts = target.split(separator: ":").compactMap { Int($0) }
        goal.targetTimeS = parts.isEmpty ? nil : parts.reduce(0) { $0 * 60 + $1 }
        if goal.distanceM == nil { goal.distanceM = ["half_marathon": 21097.5, "marathon": 42195, "10k": 10000, "5k": 5000][goal.type] }
        do {
            if goal.id == nil { try await SupabaseService.shared.client.from("goals").insert(goal).execute() }
            else { try await SupabaseService.shared.client.from("goals").update(goal).eq("id", value: goal.id!).execute() }
            try await SupabaseService.shared.replan(trigger: "goal_change"); await app.refresh(); app.toast = "Planificación actualizada"; dismiss()
        } catch { app.toast = error.localizedDescription }
    }
    private func setStatus(_ s: String) async {
        struct U: Encodable { let status: String }
        try? await SupabaseService.shared.client.from("goals").update(U(status: s)).eq("id", value: goal.id!).execute()
        try? await SupabaseService.shared.replan(trigger: "goal_change"); await app.refresh(); dismiss()
    }
}

// MARK: - Integraciones

struct HealthSettingsView: View {
    @Environment(AppState.self) private var app
    @State private var report: SyncService.Report?
    @State private var busy = false
    var body: some View {
        Form {
            Section {
                Button("Conceder permisos de Apple Health") { Task { try? await HealthKitService.shared.requestAuthorization() } }
                Button(busy ? "Sincronizando…" : "Sincronizar ahora") { Task { busy = true; report = try? await SyncService.shared.syncAll(); busy = false; await app.refresh() } }.disabled(busy)
                Button("Reimportar últimos 120 días") { HealthKitService.shared.resetAnchor(); Task { busy = true; report = try? await SyncService.shared.syncAll(initialDays: 120); busy = false } }.disabled(busy)
            } footer: { Text("Forja lee entrenamientos, FC, HRV, FC en reposo, sueño, pasos y calorías. Los entrenamientos del Apple Watch llegan solos en segundo plano. Para revisar permisos: Ajustes → Salud → Acceso a datos y dispositivos → Forja.") }
            if let r = report { Section("Última sincronización") { Text("\(r.workouts) entrenamientos (\(r.merged) fusionados sin duplicar) · \(r.days) días de salud") ; ForEach(r.prs, id: \.self) { Label($0, systemImage: "trophy") } } }
        }.navigationTitle("Apple Health")
    }
}

struct StravaSettingsView: View {
    @Environment(\.openURL) private var openURL
    @State private var connected = false
    @State private var cache: [CacheRow] = []
    struct CacheRow: Decodable, Identifiable { var id: Int64 { activityId }; let activityId: Int64; let payload: JSONValue }
    var body: some View {
        Form {
            Section {
                if connected {
                    Label("Conectado", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.green)
                    Button("Desconectar Strava", role: .destructive) { Task { await disconnect() } }
                } else { Button("Conectar con Strava") { Task { await connect() } } }
            } footer: {
                Text("Las condiciones de la API de Strava (junio 2026) prohíben usar sus datos en IA y guardarlos más de 7 días. Por eso Strava solo sirve aquí para ver tus segmentos y logros recientes y evitar duplicados. Tu historial se construye con Apple Health: si grabas con la app de Strava, actívale la escritura en Salud (Strava → Ajustes → Aplicaciones → Salud).")
            }
            if !cache.isEmpty {
                Section("Últimos 7 días en Strava") {
                    ForEach(cache) { c in VStack(alignment: .leading) { Text(c.payload["name"]?.string ?? "Actividad").font(.subheadline.weight(.semibold)); Text(c.payload["start_date"]?.string ?? "").font(.caption).foregroundStyle(Theme.text2) } }
                }
            }
        }
        .navigationTitle("Strava")
        .task { await load() }
    }
    private func load() async {
        struct C: Decodable { let athleteId: Int64 }
        let rows: [C] = (try? await SupabaseService.shared.client.from("strava_connections").select("athlete_id").execute().value) ?? []
        connected = !rows.isEmpty
        cache = (try? await SupabaseService.shared.client.from("strava_cache").select("activity_id, payload").order("fetched_at", ascending: false).execute().value) ?? []
    }
    private func connect() async {
        struct B: Encodable { let action = "start" }; struct R: Decodable { let url: String }
        if let r: R = try? await SupabaseService.shared.call("strava-auth", B()), let u = URL(string: r.url) { openURL(u) }
    }
    private func disconnect() async {
        struct B: Encodable { let action = "disconnect" }; struct R: Decodable { let ok: Bool }
        _ = try? await SupabaseService.shared.call("strava-auth", B(), as: R.self); await load()
    }
}

// MARK: - Privacidad

struct PrivacyView: View {
    @State private var consent = false
    @State private var memory: [Mem] = []
    struct Mem: Decodable, Identifiable { let id: String; let fact: String; let category: String }
    var body: some View {
        Form {
            Section {
                Toggle("Permitir el uso de IA (coach y lectura de fotos)", isOn: Binding(get: { consent }, set: { v in consent = v; Task { try? await SupabaseService.shared.setAIConsent(v) } }))
            } footer: { Text("Cuando está activo, los datos necesarios (perfil, entrenamientos, recuperación, objetivos y fotos que subas) se envían a Anthropic (Claude) para generar respuestas. Los datos de Strava nunca se envían. Sin este permiso el plan, los cálculos y el registro siguen funcionando.") }
            Section("Lo que el coach recuerda de ti") {
                ForEach(memory) { m in Text(m.fact).font(.subheadline) }
                    .onDelete { idx in let ids = idx.map { memory[$0].id }; Task { for id in ids { try? await SupabaseService.shared.client.from("coach_memory").delete().eq("id", value: id).execute() }; await load() } }
                if memory.isEmpty { Text("Nada todavía.").foregroundStyle(Theme.text2) }
            }
        }
        .navigationTitle("Privacidad e IA")
        .task { consent = await SupabaseService.shared.hasAIConsent(); await load() }
    }
    private func load() async { memory = (try? await SupabaseService.shared.client.from("coach_memory").select("id, fact, category").eq("active", value: true).execute().value) ?? [] }
}

struct ExportView: View {
    @State private var fileURL: URL?
    @State private var busy = false
    var body: some View {
        Form {
            Section {
                Button(busy ? "Preparando…" : "Generar copia de mis datos (JSON)") { Task { await export() } }.disabled(busy)
                if let fileURL { ShareLink("Compartir / guardar en Archivos", item: fileURL) }
            } footer: { Text("Incluye perfil, objetivos, plan, todos tus entrenamientos, series, récords, salud diaria, check-ins y conversaciones con el coach. Tus datos también están en la nube: no se pierden al cambiar de iPhone.") }
        }.navigationTitle("Exportar")
    }
    private func export() async {
        busy = true; defer { busy = false }
        do {
            let data: Data = try await SupabaseService.shared.client.functions.invoke("export-data", options: FunctionInvokeOptions(method: .get)) { data, _ in data }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("forja-\(DayKey.today).json")
            try data.write(to: url); fileURL = url
        } catch {}
    }
}

// MARK: - Calendario y WodBuster

struct CalendarSettingsView: View {
    @Environment(AppState.self) private var app
    @State private var access = CalendarService.shared.hasAccess
    @State private var selected = Set(UserDefaults.standard.stringArray(forKey: "calendar.ids") ?? [])
    @State private var icsUrl = ""
    @State private var keywords = ""
    @State private var export = UserDefaults.standard.bool(forKey: "calendar.export")
    @State private var result: CalendarService.SyncResult?
    @State private var busy = false
    struct Settings: Codable { var icsUrls: [String]; var crossfitKeywords: [String] }

    var body: some View {
        Form {
            Section {
                if !access { Button("Dar acceso al calendario") { Task { access = (try? await CalendarService.shared.requestAccess()) ?? false } } }
                else {
                    ForEach(CalendarService.shared.calendars(), id: \.calendarIdentifier) { c in
                        Toggle(isOn: Binding(get: { selected.contains(c.calendarIdentifier) }, set: { on in if on { selected.insert(c.calendarIdentifier) } else { selected.remove(c.calendarIdentifier) }; UserDefaults.standard.set(Array(selected), forKey: "calendar.ids") })) {
                            HStack { Circle().fill(Color(cgColor: c.cgColor)).frame(width: 10, height: 10); Text(c.title); Text(c.source.title).font(.caption).foregroundStyle(Theme.text2) }
                        }
                    }
                }
            } header: { Text("Calendarios del iPhone") } footer: { Text("Incluye Google Calendar si tu cuenta de Google está añadida en Ajustes → Calendario → Cuentas. Si no eliges ninguno, leo todos. Uso tu agenda para no ponerte entrenos cuando estás ocupado.") }
            Section {
                TextField("Enlace del calendario de WodBuster (webcal:// o https://)", text: $icsUrl).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Palabras que identifican tus clases (p. ej. nombre del box)", text: $keywords)
            } header: { Text("WodBuster") } footer: { Text("En WodBuster: Perfil → Calendarios. Copia el enlace de sincronización y pégalo aquí (o suscríbete a él desde el calendario del iPhone y actívalo arriba). Tus clases reservadas pasan a ser sesiones fijas del plan, y el resto de la semana se organiza a su alrededor. WodBuster no ofrece API para atletas, así que el contenido del WOD hay que subirlo con una foto.") }
            Section {
                Toggle("Añadir mi plan a un calendario «Forja»", isOn: $export).onChange(of: export) { _, v in UserDefaults.standard.set(v, forKey: "calendar.export") }
                Button(busy ? "Sincronizando…" : "Guardar y sincronizar") { Task { await sync() } }.disabled(busy)
            }
            if let r = result {
                Section("Clases detectadas") {
                    ForEach(r.crossfitClasses, id: \.self) { f in Text("\(DayKey.date(f.date).formatted(.dateTime.weekday(.wide).day())) · \(f.startLocal) · \(f.title)").font(.subheadline) }
                    if r.crossfitClasses.isEmpty { Text("No veo clases reservadas en las próximas 3 semanas.").foregroundStyle(Theme.text2) }
                    if r.replanned { Label("Plan reorganizado", systemImage: "arrow.triangle.2.circlepath").foregroundStyle(Theme.green) }
                    ForEach(r.errors + r.notes, id: \.self) { Text($0).font(.caption).foregroundStyle(Theme.amber) }
                }
            }
        }
        .navigationTitle("Calendario")
        .task {
            let rows: [Settings] = (try? await SupabaseService.shared.client.from("calendar_settings").select("ics_urls, crossfit_keywords").execute().value) ?? []
            icsUrl = rows.first?.icsUrls.first ?? ""; keywords = rows.first?.crossfitKeywords.joined(separator: ", ") ?? ""
        }
    }

    private func sync() async {
        busy = true; defer { busy = false }
        UserDefaults.standard.set(true, forKey: "calendar.configured")
        struct S: Encodable { let ics_urls: [String]; let crossfit_keywords: [String] }
        struct B: Encodable { let settings: S }
        struct Ignore: Decodable {}
        let kw = keywords.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
        _ = try? await SupabaseService.shared.call("calendar-sync", B(settings: S(ics_urls: icsUrl.isEmpty ? [] : [icsUrl], crossfit_keywords: kw)), as: Ignore.self)
        do { result = try await CalendarService.shared.sync(); await app.refresh() } catch { app.toast = error.localizedDescription }
    }
}
