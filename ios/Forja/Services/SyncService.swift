import Foundation
import HealthKit
import BackgroundTasks

/// Sincroniza Apple Health → backend. Los entrenamientos pasan por /ingest-session (deduplicación,
/// récords y adaptación del plan). La salud diaria se sube a daily_health y luego se recalcula el estado.
actor SyncService {
    static let shared = SyncService()
    static let bgTaskId = "com.forja.app.sync"
    private var running = false
    private let hk = HealthKitService.shared
    private let api = SupabaseService.shared

    struct Report: Sendable { var workouts = 0; var merged = 0; var days = 0; var prs: [String] = []; var changes: [EngineChange] = [] }

    func syncAll(initialDays: Int = 120) async throws -> Report {
        guard !running, let uid = api.userId, hk.isAvailable else { return Report() }
        running = true; defer { running = false }
        var report = Report()

        // 1) Zonas desde tu fisiología registrada (Karvonen con FC reposo/máx reales; si no hay, sin zonas).
        let phys: [Physiology] = (try? await api.client.from("physiology").select().order("effective_from", ascending: false).limit(1).execute().value) ?? []
        var zones: [(Double, Double)]? = nil
        if let p = phys.first, let rest = p.hrRest, let max = p.hrMax {
            let r = Double(max - rest); let z = { (f: Double) in Double(rest) + r * f }
            zones = [(0, z(0.6)), (z(0.6), z(0.7)), (z(0.7), z(0.8)), (z(0.8), z(0.9)), (z(0.9), Double(max))]
        }

        // 2) Entrenamientos nuevos.
        let since = Calendar.current.date(byAdding: .day, value: -initialDays, to: Date())!
        let (workouts, _, commit) = try await hk.newWorkouts(since: since)
        let ownBundle = Bundle.main.bundleIdentifier
        var batch: [EngineSession] = []
        for w in workouts where w.sourceRevision.source.bundleIdentifier != ownBundle && w.duration >= 300 {
            batch.append(await hk.engineSession(from: w, zones: zones))
        }
        // Los antiguos primero; los recientes al final para que la adaptación use el historial completo.
        batch.sort { $0.startedAt < $1.startedAt }
        for chunk in stride(from: 0, to: batch.count, by: 50).map({ Array(batch[$0..<min($0 + 50, batch.count)]) }) {
            let res = try await api.ingestBatch(chunk)
            report.workouts += res.count
            report.merged += res.filter(\.merged).count
            report.prs += res.flatMap(\.prs)
            report.changes += res.flatMap(\.changes)
        }
        commit()

        // 3) Salud diaria (HRV, FC reposo, sueño…): últimos 3 días en cada sync, 90 la primera vez.
        let firstHealth = !UserDefaults.standard.bool(forKey: "hk.health.initial")
        let rows = await hk.dailyHealth(days: firstHealth ? 90 : 3, userId: uid)
        if !rows.isEmpty {
            try await api.client.from("daily_health").upsert(rows, onConflict: "user_id,date").execute()
            report.days = rows.count
            UserDefaults.standard.set(true, forKey: "hk.health.initial")
        }
        let body = await hk.latestBody()
        if body.weight != nil {
            try? await api.client.from("body_metrics").upsert(BodyMetric(userId: uid, date: DayKey.today, weightKg: body.weight, bodyFatPct: body.fat, source: "healthkit"), onConflict: "user_id,date,source").execute()
        }
        // 4) Calendario (clases reservadas de WodBuster y agenda): puede reorganizar la semana.
        if CalendarService.shared.hasAccess || UserDefaults.standard.bool(forKey: "calendar.configured") { _ = try? await CalendarService.shared.sync() }
        // 5) Estado del día y ajustes.
        try await api.replan(trigger: "checkin")
        return report
    }

    // MARK: Tareas en segundo plano

    nonisolated static func registerBackgroundTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: bgTaskId, using: nil) { task in
            scheduleBackgroundSync()
            let t = Task { _ = try? await SyncService.shared.syncAll(); task.setTaskCompleted(success: true) }
            task.expirationHandler = { t.cancel() }
        }
    }

    nonisolated static func scheduleBackgroundSync() {
        let req = BGAppRefreshTaskRequest(identifier: bgTaskId)
        req.earliestBeginDate = Date().addingTimeInterval(2 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }
}
