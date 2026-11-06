import SwiftUI
import UIKit

/// Pega el texto del entreno (descripción de Strava, notas, WhatsApp del box). Forja lo interpreta con su motor de CrossFit,
/// te pregunta lo que no esté claro y lo une a la sesión que grabó tu Apple Watch.
struct PasteWorkoutView: View {
    var initialText: String = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var text = ""
    @State private var date = Date()
    @State private var parsed: AnyCodable?
    @State private var summary: [String] = []
    @State private var questions: [PhotoQuestion] = []
    @State private var answers: [String: String] = [:]
    @State private var candidates: [Candidate] = []
    @State private var link: String? = nil
    @State private var minutes = 60.0
    @State private var pushToStrava = false
    @State private var engine = ""
    @State private var busy = false
    @State private var result: IngestResult?
    @State private var error: String?

    struct Candidate: Decodable, Hashable, Identifiable { let id: String; let startedAt: String; let minutes: Int; let title: String?; let avgHr: Int?; let source: String }
    struct ParseRes: Decodable { let parsed: AnyCodable; let summary: [String]; let questions: [PhotoQuestion]; let engine: String; let candidates: [Candidate] }

    var body: some View {
        Form {
            Section {
                TextEditor(text: $text).frame(minHeight: 160).font(.system(.footnote, design: .monospaced))
                HStack {
                    PasteButton(payloadType: String.self) { s in if let first = s.first { Task { @MainActor in text = first } } }
                    Spacer()
                    DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
                }
                Button(busy ? "Interpretando…" : "Interpretar") { Task { await parse() } }.disabled(text.isEmpty || busy)
            } header: { Text("Texto del entreno") } footer: { Text("En Strava: abre la actividad → mantén pulsada la descripción → Copiar, y pégala aquí. Strava no permite que una app la lea por su API para procesarla.") }

            if !summary.isEmpty {
                Section { ForEach(summary, id: \.self) { Text($0).font(.subheadline) } } header: { Text("Lo que he entendido") } footer: { Text(engine == "motor" ? "Interpretado por el motor de CrossFit de Forja." : "Interpretado por el motor y revisado con IA.") }
                if !questions.isEmpty { Section("Confírmame") { ForEach(questions) { q in QuestionField(q: q, value: Binding(get: { answers[q.id] ?? "" }, set: { answers[q.id] = $0 })) } } }
                Section {
                    Picker("Sesión", selection: $link) {
                        Text("Crear una sesión nueva").tag(String?.none)
                        ForEach(candidates) { c in Text("\(ISO8601.parse(c.startedAt)?.formatted(date: .omitted, time: .shortened) ?? "") · \(c.minutes) min · \(c.title ?? "Entreno")\(c.avgHr.map { " · \($0) ppm" } ?? "")").tag(String?.some(c.id)) }
                    }
                    if link == nil { Stepper("Duración: \(Int(minutes)) min", value: $minutes, in: 15...180, step: 5) }
                    Toggle("Escribir esta descripción en Strava", isOn: $pushToStrava)
                } header: { Text("¿A qué entreno pertenece?") } footer: { Text(candidates.isEmpty ? "No veo ninguna sesión del Apple Watch ese día; se creará una nueva." : "Al vincularlo, tu FC y tus calorías del Watch se unen a los ejercicios, pesos y repeticiones del texto, sin duplicar.") }
                Section { Button(busy ? "Guardando…" : "Guardar entreno") { Task { await confirm() } }.disabled(busy || questions.contains { $0.id != "rpe" && (answers[$0.id] ?? "").isEmpty }) }
            }
            if let result { Section("Hecho") { ResultView(result: result) } }
            if let error { Section { Text(error).foregroundStyle(Theme.red) } }
        }
        .navigationTitle("Pegar entreno")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(result == nil ? "Cerrar" : "Listo") { dismiss() } } }
        .onAppear { if text.isEmpty { text = initialText } }
    }

    private func parse() async {
        busy = true; defer { busy = false }; error = nil
        struct B: Encodable { let action = "parse"; let text: String; let date: String }
        do {
            let r: ParseRes = try await SupabaseService.shared.call("parse-workout-text", B(text: text, date: DayKey.string(date)))
            parsed = r.parsed; summary = r.summary; questions = r.questions; candidates = r.candidates; engine = r.engine
            link = r.candidates.first(where: { $0.source == "healthkit" })?.id ?? r.candidates.first?.id
        } catch { self.error = error.localizedDescription }
    }

    private func confirm() async {
        guard let parsed else { return }
        busy = true; defer { busy = false }
        struct B: Encodable { let action = "confirm"; let parsed: AnyCodable; let answers: [String: String]; let startedAt: String?; let durationS: Double?; let linkSessionId: String?; let pushToStrava: Bool; let text: String }
        var start: String? = nil
        if link == nil { var c = DayKey.cal.dateComponents([.year, .month, .day], from: date); c.hour = 18; start = DayKey.cal.date(from: c).map(ISO8601.string) }
        do {
            result = try await SupabaseService.shared.call("parse-workout-text", B(parsed: parsed, answers: answers, startedAt: start, durationS: link == nil ? minutes * 60 : nil, linkSessionId: link, pushToStrava: pushToStrava, text: text))
            await app.refresh()
        } catch { self.error = error.localizedDescription }
    }
}
