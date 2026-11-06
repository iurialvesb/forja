import SwiftUI
import AuthenticationServices
import CryptoKit
import Supabase

struct SignInView: View {
    @Environment(AppState.self) private var app
    @State private var nonce = ""
    @State private var error: String?
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "flame.fill").font(.system(size: 64)).foregroundStyle(Theme.accent)
            Text("Forja").font(.largeTitle.weight(.heavy))
            Text("Tu entrenador personal de running, CrossFit, fuerza e HYROX.").font(.headline).foregroundStyle(Theme.text2).multilineTextAlignment(.center)
            Spacer()
            SignInWithAppleButton(.signIn) { req in
                nonce = Self.randomNonce()
                req.requestedScopes = [.fullName, .email]
                req.nonce = Self.sha256(nonce)
            } onCompletion: { result in
                Task {
                    do {
                        guard case .success(let auth) = result, let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                              let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else { throw AppError.notSignedIn }
                        try await SupabaseService.shared.client.auth.signInWithIdToken(credentials: OpenIDConnectCredentials(provider: .apple, idToken: token, nonce: nonce))
                        if let given = cred.fullName?.givenName {
                            struct U: Encodable { let displayName: String }
                            try? await SupabaseService.shared.client.from("profiles").update(U(displayName: given)).eq("id", value: SupabaseService.shared.userId ?? "").execute()
                        }
                    } catch { self.error = error.localizedDescription }
                }
            }
            .signInWithAppleButtonStyle(.white).frame(height: 52)
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.red) }
            Text("Tus datos se guardan cifrados en tu cuenta y solo tú puedes acceder a ellos.").font(.caption).foregroundStyle(Theme.text2).multilineTextAlignment(.center)
        }.padding(24).screenBackground()
    }

    static func randomNonce(length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String((0..<length).map { _ in chars[Int.random(in: 0..<chars.count)] })
    }
    static func sha256(_ s: String) -> String { SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined() }
}

/// Primer arranque: permisos, datos básicos, disponibilidad y objetivos.
struct OnboardingView: View {
    @Environment(AppState.self) private var app
    @State private var step = 0
    @State private var healthGranted = false
    @State private var aiConsent = true
    @State private var rest = ""; @State private var max = ""
    @State private var goals: [Goal] = [
        Goal(name: "Media Maratón de Castellón", type: "half_marathon", date: "2027-01-31", priority: "A", distanceM: 21097.5),
        Goal(name: "HYROX", type: "hyrox", date: "2027-04-16", priority: "A"),
    ]
    @State private var keepGoal = [true, true]
    @State private var busy = false

    var body: some View {
        NavigationStack { content }
    }

    private var content: some View {
        VStack {
            TabView(selection: $step) {
                page(0, icon: "heart.text.square.fill", title: "Conecta Apple Health", text: "Leo tus entrenamientos del Apple Watch, frecuencia cardíaca, HRV, sueño y FC en reposo para saber cómo estás y adaptar el plan. Los datos no salen de tu cuenta.") {
                    Button(healthGranted ? "Permisos concedidos ✓" : "Conceder acceso") { Task { do { try await HealthKitService.shared.requestAuthorization(); healthGranted = true } catch { app.toast = error.localizedDescription } } }
                        .buttonStyle(.borderedProminent).disabled(healthGranted)
                }
                page(1, icon: "sparkles", title: "Entrenador IA", text: "El coach y la lectura de fotos usan Claude (Anthropic), un servicio de IA externo, con los datos de entrenamiento necesarios. No se usan para entrenar modelos. Puedes desactivarlo cuando quieras; el plan y los cálculos funcionan sin IA.") {
                    Toggle("Permitir el uso de IA", isOn: $aiConsent).padding(.horizontal)
                }
                page(2, icon: "waveform.path.ecg", title: "Tu frecuencia cardíaca", text: "Con tus valores reales calculo tus zonas. Si no los sabes, déjalo en blanco: los estimaré cuando tenga datos del Watch y te pediré un test.") {
                    VStack { TextField("FC en reposo", text: $rest).keyboardType(.numberPad); TextField("FC máxima medida", text: $max).keyboardType(.numberPad) }
                        .textFieldStyle(.roundedBorder).padding(.horizontal)
                }
                page(3, icon: "calendar", title: "Disponibilidad", text: "Indica qué días y franjas puedes entrenar y cuándo tienes clase en el box. Podrás cambiarlo en Perfil.") {
                    NavigationLink("Configurar disponibilidad") { AvailabilityView() }.buttonStyle(.bordered)
                }
                page(4, icon: "flag.checkered", title: "Tus objetivos", text: "Construiré la planificación por fases hacia cada competición.") {
                    VStack(alignment: .leading) {
                        ForEach(goals.indices, id: \.self) { i in Toggle("\(goals[i].name) · \(DayKey.date(goals[i].date).formatted(.dateTime.day().month().year()))", isOn: $keepGoal[i]) }
                        Text("Puedes añadir o cambiar objetivos en Perfil → Objetivos.").font(.caption).foregroundStyle(Theme.text2)
                    }.padding(.horizontal)
                }
            }.tabViewStyle(.page(indexDisplayMode: .always))
            Button(step < 4 ? "Siguiente" : (busy ? "Creando tu plan…" : "Crear mi plan")) { if step < 4 { withAnimation { step += 1 } } else { Task { await finish() } } }
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(busy).padding()
        }
        .screenBackground()
    }

    private func page<C: View>(_ tag: Int, icon: String, title: String, text: String, @ViewBuilder content: () -> C) -> some View {
        VStack(spacing: 18) {
            Image(systemName: icon).font(.system(size: 54)).foregroundStyle(Theme.accent)
            Text(title).font(.title2.weight(.bold))
            Text(text).font(.subheadline).foregroundStyle(Theme.text2).multilineTextAlignment(.center).padding(.horizontal, 24)
            content()
        }.tag(tag)
    }

    private func finish() async {
        busy = true; defer { busy = false }
        let api = SupabaseService.shared
        guard let uid = api.userId else { return }
        try? await api.setAIConsent(aiConsent)
        if Int(rest) != nil || Int(max) != nil {
            try? await api.client.from("physiology").upsert(Physiology(userId: uid, effectiveFrom: DayKey.today, hrRest: Int(rest), hrMax: Int(max), method: "manual"), onConflict: "user_id,effective_from").execute()
        }
        // Disponibilidad por defecto si el usuario no la configuró.
        let avail: [Availability] = (try? await api.client.from("availability").select().execute().value) ?? []
        if avail.isEmpty {
            // Por defecto: tardes de lunes a viernes (box lunes, miércoles y viernes) y mañanas de fin de semana.
            let defaults = (1...7).map { d in Availability(userId: uid, weekday: d, am: d >= 6, pm: d <= 5, maxMinutes: d >= 6 ? 120 : 75, boxClass: [1, 3, 5].contains(d)) }
            try? await api.client.from("availability").upsert(defaults, onConflict: "user_id,weekday").execute()
        }
        for (i, g) in goals.enumerated() where keepGoal[i] {
            var row = g; row.userId = uid
            try? await api.client.from("goals").insert(row).execute()
        }
        await app.finishOnboarding()
    }
}
