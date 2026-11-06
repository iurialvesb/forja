import SwiftUI
import Supabase

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        SyncService.registerBackgroundTask()
        // Los observadores de HealthKit deben registrarse en cada arranque para recibir entregas en segundo plano.
        HealthKitService.shared.startBackgroundObservers {
            _ = try? await SyncService.shared.syncAll()
        }
        return true
    }
}

@main
struct ForjaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @State private var app = AppState()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .task { await app.start() }
                .onOpenURL { url in app.handle(url: url) }
                .onChange(of: phase) { _, p in
                    if p == .active { Task { await app.refresh(sync: true) } }
                    if p == .background { SyncService.scheduleBackgroundSync() }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var app
    var body: some View {
        Group {
            switch app.stage {
            case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.bg)
            case .signedOut: SignInView()
            case .onboarding: OnboardingView()
            case .ready: MainTabView()
            }
        }
        .overlay(alignment: .top) {
            if let msg = app.toast {
                Text(msg).font(.subheadline.weight(.medium)).padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule()).padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task { try? await Task.sleep(for: .seconds(4)); app.toast = nil }
            }
        }
        .animation(.spring, value: app.toast)
    }
}

struct MainTabView: View {
    var body: some View {
        // 5 pestañas (el iPhone muestra 5 sin pasar a "Más"). Progreso vive en Entrenos; Perfil, en el icono de Inicio.
        TabView {
            Tab("Inicio", systemImage: "house.fill") { NavigationStack { DashboardView() } }
            Tab("Calendario", systemImage: "calendar") { NavigationStack { CalendarView() } }
            Tab("Entrenos", systemImage: "figure.run") { NavigationStack { TrainingHubView() } }
            Tab("Nutrición", systemImage: "fork.knife") { NavigationStack { NutritionView() } }
            Tab("Coach", systemImage: "bubble.left.and.text.bubble.right.fill") { NavigationStack { CoachView() } }
        }
    }
}

struct TrainingHubView: View {
    @State private var tab = 0
    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) { Text("Historial").tag(0); Text("Progreso").tag(1) }.pickerStyle(.segmented).padding(.horizontal, 16).padding(.vertical, 8)
            if tab == 0 { WorkoutsView() } else { ProgressHubView() }
        }.screenBackground()
    }
}
