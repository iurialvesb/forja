import SwiftUI
import PhotosUI
import UIKit

/// Foto de la pizarra o captura → lectura con IA → preguntas sobre lo que no se entiende → registro.
struct PhotoImportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var image: UIImage?
    @State private var importId: String?
    @State private var parsed: AnyCodable?
    @State private var questions: [PhotoQuestion] = []
    @State private var answers: [String: String] = [:]
    @State private var startedAt = Date()
    @State private var minutes = 60.0
    @State private var phase: Phase = .pick
    @State private var result: IngestResult?
    @State private var error: String?
    @State private var needsConsent = false

    enum Phase { case pick, reading, review, saving, done }

    var body: some View {
        Form {
            if let image { Section { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 260).clipShape(RoundedRectangle(cornerRadius: 12)) } }
            switch phase {
            case .pick:
                Section {
                    Button("Hacer foto", systemImage: "camera") { showCamera = true }
                    PhotosPicker("Elegir de la fototeca", selection: $pickerItem, matching: .images)
                } footer: { Text("Pizarra del box, captura de Strava o Apple Fitness, o de tu app de gimnasio. La imagen se envía a un servicio de IA para leerla.") }
            case .reading:
                Section { HStack { ProgressView(); Text("Leyendo el entrenamiento…") } }
            case .review, .saving:
                Section("Lo que he leído") { ParsedSummary(parsed: parsed?.value) }
                if !questions.isEmpty {
                    Section { ForEach(questions) { q in QuestionField(q: q, value: binding(q.id)) } } header: { Text("Necesito que me confirmes") } footer: { Text("Prefiero preguntarte antes que inventar datos.") }
                }
                Section("Cuándo") {
                    DatePicker("Inicio", selection: $startedAt)
                    Stepper("Duración: \(Int(minutes)) min", value: $minutes, in: 10...240, step: 5)
                }
                Section { Button(phase == .saving ? "Guardando…" : "Registrar entrenamiento") { Task { await confirm() } }.disabled(phase == .saving || !allAnswered) }
            case .done:
                if let result { Section("Hecho") { ResultView(result: result) } }
            }
            if let error { Section { Text(error).foregroundStyle(Theme.red) } }
        }
        .navigationTitle("Entreno desde foto")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(phase == .done ? "Listo" : "Cerrar") { dismiss() } } }
        .sheet(isPresented: $showCamera) { CameraPicker { img in Task { await start(with: img) } }.ignoresSafeArea() }
        .onChange(of: pickerItem) { _, item in
            Task { if let data = try? await item?.loadTransferable(type: Data.self), let img = UIImage(data: data) { await start(with: img) } }
        }
        .alert("Permiso para usar IA", isPresented: $needsConsent) {
            Button("Permitir") { Task { try? await SupabaseService.shared.setAIConsent(true); if let image { await start(with: image) } } }
            Button("Ahora no", role: .cancel) {}
        } message: { Text("Para leer la foto la enviaré a Anthropic (Claude), un servicio de IA externo, junto con tu historial de entrenamiento cuando uses el coach. No se usa para entrenar modelos. Puedes revocarlo en Perfil → Privacidad e IA.") }
    }

    private var allAnswered: Bool { questions.filter { $0.id != "rpe" }.allSatisfy { !(answers[$0.id] ?? "").isEmpty } }
    private func binding(_ id: String) -> Binding<String> { Binding(get: { answers[id] ?? "" }, set: { answers[id] = $0 }) }

    private func start(with img: UIImage) async {
        image = img; error = nil
        guard await SupabaseService.shared.hasAIConsent() else { needsConsent = true; return }
        phase = .reading
        do {
            let api = SupabaseService.shared
            guard let data = img.resized(maxSide: 2048).jpegData(compressionQuality: 0.85), let uid = api.userId else { throw AppError.notSignedIn }
            let path = try await api.uploadPhoto(data)
            struct Row: Encodable { let userId: String; let storagePath: String }
            struct Created: Decodable { let id: String }
            let created: Created = try await api.client.from("photo_imports").insert(Row(userId: uid, storagePath: path)).select("id").single().execute().value
            importId = created.id
            struct Body: Encodable { let action = "parse"; let importId: String }
            let r: ParseResponse = try await api.call("parse-photo", Body(importId: created.id))
            parsed = r.parsed; questions = r.questions
            if let tc = r.parsed.value["sections"]?.array?.compactMap({ $0["timeCapMin"] }).first, case .number(let n) = tc { minutes = max(30, n + 30) }
            phase = .review
        } catch { self.error = error.localizedDescription; phase = .pick }
    }

    private func confirm() async {
        guard let importId else { return }
        phase = .saving
        struct Body: Encodable { let action = "confirm"; let importId: String; let answers: [String: String]; let startedAt: String; let durationS: Double }
        do {
            result = try await SupabaseService.shared.call("parse-photo", Body(importId: importId, answers: answers, startedAt: ISO8601.string(startedAt), durationS: minutes * 60))
            phase = .done
            await app.refresh()
        } catch { self.error = error.localizedDescription; phase = .review }
    }
}

struct ParsedSummary: View {
    let parsed: JSONValue?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let t = parsed?["title"]?.string { Text(t).font(.headline) }
            ForEach(Array((parsed?["sections"]?.array ?? []).enumerated()), id: \.offset) { _, sec in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(blockName(sec["kind"]?.string ?? "")).font(.subheadline.weight(.bold))
                        if let f = sec["format"]?.string { Tag(text: f.replacingOccurrences(of: "_", with: " "), color: Theme.accent) }
                        if case .number(let cap)? = sec["timeCapMin"] { Text("\(Int(cap))′").font(.caption).foregroundStyle(Theme.text2) }
                    }
                    ForEach(Array((sec["items"]?.array ?? []).enumerated()), id: \.offset) { _, it in
                        Text("• \(it["raw"]?.string ?? it["exercise"]?.string ?? "")").font(.footnote)
                    }
                }
            }
        }
    }
}

struct QuestionField: View {
    let q: PhotoQuestion
    @Binding var value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(q.question).font(.subheadline)
            if let opts = q.options, !opts.isEmpty {
                Picker("", selection: $value) { Text("—").tag(""); ForEach(opts, id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented)
                if value == "Otro" || (!opts.contains(value) && !value.isEmpty) { TextField("Valor", text: $value).keyboardType(q.kind == "number" ? .decimalPad : .default) }
            } else {
                TextField(q.kind == "number" ? "Número" : "Respuesta", text: $value).keyboardType(q.kind == "number" ? .decimalPad : .default)
            }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ p: CameraPicker) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

extension UIImage {
    func resized(maxSide: CGFloat) -> UIImage {
        let scale = min(1, maxSide / max(size.width, size.height))
        guard scale < 1 else { return self }
        let s = CGSize(width: size.width * scale, height: size.height * scale)
        return UIGraphicsImageRenderer(size: s).image { _ in draw(in: CGRect(origin: .zero, size: s)) }
    }
}
