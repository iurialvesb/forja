import SwiftUI
import Supabase

@MainActor @Observable
final class AppState {
    enum Stage { case loading, signedOut, onboarding, ready }
    var stage: Stage = .loading
    var toast: String?
    var profile: Profile?

    // Datos del dashboard / calendario (caché en memoria; se refrescan al volver a la app).
    var readiness: ReadinessRow?
    var week: [PlannedSession] = []
    var goals: [Goal] = []
    var phases: [PhaseRow] = []
    var recentSessions: [SessionRow] = []
    var changes: [PlanChange] = []
    var lastSync: Date?
    var syncing = false
    var lastError: String?

    private let api = SupabaseService.shared

    func start() async {
        for await (event, session) in api.client.auth.authStateChanges {
            switch event {
            case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                if session == nil { stage = .signedOut; continue }
                await loadProfile()
            case .signedOut, .userDeleted: stage = .signedOut; profile = nil
            default: break
            }
        }
    }

    func loadProfile() async {
        do {
            let p: Profile = try await api.client.from("profiles").select().eq("id", value: api.userId ?? "").single().execute().value
            profile = p
            stage = UserDefaults.standard.bool(forKey: "onboarding.done.\(p.id)") ? .ready : .onboarding
            if stage == .ready { await refresh(sync: true) }
        } catch {
            lastError = error.localizedDescription
            stage = .onboarding
        }
    }

    func finishOnboarding() async {
        guard let id = profile?.id ?? api.userId else { return }
        UserDefaults.standard.set(true, forKey: "onboarding.done.\(id)")
        try? await api.replan(trigger: "goal_change")
        stage = .ready
        await refresh(sync: true)
    }

    func refresh(sync: Bool = false) async {
        guard stage == .ready else { return }
        if sync, !syncing {
            syncing = true
            do {
                let r = try await SyncService.shared.syncAll()
                lastSync = Date()
                if let pr = r.prs.first { toast = "🏆 Nuevo récord: \(pr)" }
                else if let c = r.changes.first(where: { $0.action != "mark_done" }) { toast = "Plan ajustado: \(c.reason.prefix(80))…" }
            } catch { lastError = error.localizedDescription }
            syncing = false
        }
        let monday = DayKey.string(DayKey.monday(of: Date()))
        async let r = try? api.readinessToday()
        async let w = try? api.plannedSessions(from: monday, to: DayKey.add(13, to: monday))
        async let g = try? api.goals()
        async let ph = try? api.phases()
        async let s = try? api.sessions(days: 42)
        async let ch = try? api.recentChanges()
        readiness = await r ?? readiness
        week = await w ?? week
        goals = await g ?? goals
        phases = await ph ?? phases
        recentSessions = await s ?? recentSessions
        changes = await ch ?? changes
    }

    var today: [PlannedSession] { week.filter { $0.date == DayKey.today } }

    func handle(url: URL) {
        guard url.scheme == "forja", url.host == "strava" else { return }
        let ok = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "ok" })?.value == "1"
        toast = ok ? "Strava conectado" : "No se pudo conectar Strava"
    }

    func signOut() async { try? await api.client.auth.signOut() }
}
