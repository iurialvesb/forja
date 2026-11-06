import SwiftUI

struct CoachView: View {
    @Environment(AppState.self) private var app
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var threadId: String?
    @State private var sending = false
    @State private var consent: Bool?

    private let suggestions = ["¿Qué entrenamiento me toca hoy?", "¿Puedo hacer series mañana después del WOD de hoy?", "¿Qué peso debería usar en back squat?",
                               "¿Estoy progresando en running?", "¿Estoy entrenando demasiado?", "Hoy no puedo entrenar, ¿qué hago?",
                               "¿Cómo afecta este WOD a mi media maratón?", "¿Qué debo mejorar para HYROX?"]

    var body: some View {
        VStack(spacing: 0) {
            if consent == false { consentCard } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if messages.isEmpty {
                                Text("Pregúntame lo que quieras sobre tu entrenamiento. Respondo con tus datos reales.").foregroundStyle(Theme.text2).padding(.top, 8)
                                FlowChips(items: suggestions) { send($0) }
                            }
                            ForEach(messages) { m in bubble(m).id(m.id) }
                            if sending { HStack { ProgressView(); Text("Analizando tus datos…").font(.footnote).foregroundStyle(Theme.text2) } }
                        }.padding(16)
                    }
                    .onChange(of: messages.count) { _, _ in if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
                }
                HStack(spacing: 8) {
                    TextField("Escribe a tu entrenador…", text: $input, axis: .vertical).lineLimit(1...4)
                        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                    Button { send(input) } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 34)) }
                        .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }.padding(.horizontal, 12).padding(.vertical, 8).background(Theme.bg)
            }
        }
        .screenBackground()
        .navigationTitle("Coach")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Nueva", systemImage: "square.and.pencil") { messages = []; threadId = nil } } }
        .task { consent = await SupabaseService.shared.hasAIConsent() }
    }

    private var consentCard: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles").font(.largeTitle).foregroundStyle(Theme.accent)
            Text("Activar el entrenador IA").font(.title3.weight(.bold))
            Text("Para responderte, el coach envía a Anthropic (Claude), un servicio de IA externo, los datos necesarios de tu perfil, entrenamientos, recuperación y objetivos. No se usan para entrenar modelos. Los datos importados de Strava nunca se envían. Puedes revocarlo cuando quieras en Perfil → Privacidad e IA.")
                .font(.subheadline).foregroundStyle(Theme.text2).multilineTextAlignment(.center)
            Button("Permitir y continuar") { Task { try? await SupabaseService.shared.setAIConsent(true); consent = true } }.buttonStyle(.borderedProminent)
        }.padding(24).frame(maxHeight: .infinity)
    }

    private func bubble(_ m: ChatMessage) -> some View {
        HStack {
            if m.role == "user" { Spacer(minLength: 40) }
            Text(LocalizedStringKey(m.text)).font(.subheadline).padding(12)
                .background(m.role == "user" ? Theme.accent.opacity(0.9) : Theme.card, in: RoundedRectangle(cornerRadius: 18))
                .foregroundStyle(m.role == "user" ? .black : .white).textSelection(.enabled)
            if m.role != "user" { Spacer(minLength: 20) }
        }
    }

    private func send(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return }
        input = ""; messages.append(ChatMessage(role: "user", text: t)); sending = true
        Task {
            struct Body: Encodable { let threadId: String?; let message: String }
            do {
                let r: CoachReply = try await SupabaseService.shared.call("coach", Body(threadId: threadId, message: t))
                threadId = r.threadId
                messages.append(ChatMessage(role: "assistant", text: r.reply))
                if r.tools.contains("ajustar_plan") { await app.refresh() }
            } catch { messages.append(ChatMessage(role: "assistant", text: "⚠️ \(error.localizedDescription)")) }
            sending = false
        }
    }
}

struct FlowChips: View {
    let items: [String]; let onTap: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { s in
                Button(s) { onTap(s) }.font(.footnote).padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Theme.card, in: Capsule()).overlay(Capsule().stroke(Theme.line)).buttonStyle(.plain)
            }
        }
    }
}
