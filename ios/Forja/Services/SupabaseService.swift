import Foundation
import Supabase

/// Acceso al backend. RLS garantiza que cada usuario solo lee y escribe sus filas.
final class SupabaseService: @unchecked Sendable {
    static let shared = SupabaseService()
    let client: SupabaseClient

    private init() {
        guard let urlString = Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String,
              let url = URL(string: urlString), url.host != nil,
              let key = Bundle.main.object(forInfoDictionaryKey: "SupabaseAnonKey") as? String, !key.isEmpty else {
            fatalError("Configura SUPABASE_URL y SUPABASE_ANON_KEY en ios/Config/Secrets.xcconfig")
        }
        let enc = JSONEncoder(); enc.keyEncodingStrategy = .convertToSnakeCase
        let dec = JSONDecoder(); dec.keyDecodingStrategy = .convertFromSnakeCase
        client = SupabaseClient(supabaseURL: url, supabaseKey: key,
                                options: SupabaseClientOptions(db: .init(encoder: enc, decoder: dec)))
    }

    var userId: String? { client.auth.currentUser?.id.uuidString.lowercased() }

    // MARK: Edge Functions (JSON camelCase del motor)

    func call<Req: Encodable, Res: Decodable>(_ name: String, _ body: Req, as: Res.Type = Res.self) async throws -> Res {
        do {
            return try await client.functions.invoke(name, options: FunctionInvokeOptions(body: body)) { data, _ in
                try JSONDecoder().decode(Res.self, from: data)
            }
        } catch FunctionsError.httpError(let code, let data) {
            // Las funciones devuelven { "error": "mensaje en español" }
            struct E: Decodable { let error: String? }
            throw AppError.server((try? JSONDecoder().decode(E.self, from: data))?.error ?? "Error del servidor (\(code))")
        }
    }

    func replan(trigger: String, plannedId: String? = nil) async throws {
        struct Body: Encodable { let trigger: String; let plannedId: String? }
        struct Ignore: Decodable {}
        _ = try await call("replan", Body(trigger: trigger, plannedId: plannedId), as: Ignore.self)
    }

    func ingest(_ s: EngineSession) async throws -> IngestResult {
        struct Body: Encodable { let session: EngineSession }
        return try await call("ingest-session", Body(session: s))
    }

    func ingestBatch(_ s: [EngineSession]) async throws -> [IngestResult] {
        struct Body: Encodable { let sessions: [EngineSession] }
        struct Res: Decodable { let results: [IngestResult] }
        return try await call("ingest-session", Body(sessions: s), as: Res.self).results
    }

    // MARK: Consultas habituales

    func plannedSessions(from: String, to: String) async throws -> [PlannedSession] {
        try await client.from("planned_sessions").select().gte("date", value: from).lte("date", value: to)
            .order("date").order("slot").execute().value
    }

    func sessions(days: Int) async throws -> [SessionRow] {
        let since = ISO8601.string(Date().addingTimeInterval(-Double(days) * 86400))
        return try await client.from("sessions").select("*, session_blocks(*), session_sets(*)")
            .is("deleted_at", value: nil).gte("started_at", value: since).order("started_at", ascending: false).execute().value
    }

    func readinessToday() async throws -> ReadinessRow? {
        let rows: [ReadinessRow] = try await client.from("readiness_daily").select().eq("date", value: DayKey.today).limit(1).execute().value
        return rows.first
    }

    func recentChanges(limit: Int = 10) async throws -> [PlanChange] {
        try await client.from("plan_changes").select().order("created_at", ascending: false).limit(limit).execute().value
    }

    func goals() async throws -> [Goal] {
        try await client.from("goals").select().eq("status", value: "active").order("date").execute().value
    }

    func phases() async throws -> [PhaseRow] {
        try await client.from("phases").select().order("start_date").execute().value
    }

    func records() async throws -> [PersonalRecord] {
        try await client.from("personal_records").select().order("achieved_on").execute().value
    }

    func uploadPhoto(_ data: Data, ext: String = "jpg") async throws -> String {
        guard let uid = userId else { throw AppError.notSignedIn }
        let path = "\(uid)/\(UUID().uuidString.lowercased()).\(ext)"
        _ = try await client.storage.from("workout-photos").upload(path, data: data, options: FileOptions(contentType: ext == "png" ? "image/png" : "image/jpeg"))
        return path
    }

    func hasAIConsent() async -> Bool {
        struct C: Decodable { let kind: String }
        let rows: [C] = (try? await client.from("consents").select("kind").eq("kind", value: "ai_processing").is("revoked_at", value: nil).execute().value) ?? []
        return !rows.isEmpty
    }

    func setAIConsent(_ granted: Bool) async throws {
        guard let uid = userId else { throw AppError.notSignedIn }
        struct Row: Encodable {
            let userId: String; let kind: String; let version: String; let grantedAt: String
            enum CodingKeys: String, CodingKey { case userId, kind, version, grantedAt, revokedAt }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(userId, forKey: .userId); try c.encode(kind, forKey: .kind); try c.encode(version, forKey: .version)
                try c.encode(grantedAt, forKey: .grantedAt); try c.encodeNil(forKey: .revokedAt)   // reactivar si estaba revocado
            }
        }
        if granted {
            try await client.from("consents").upsert(Row(userId: uid, kind: "ai_processing", version: "2026-11", grantedAt: ISO8601.string(Date())), onConflict: "user_id,kind,version").execute()
        } else {
            struct Rev: Encodable { let revokedAt: String }
            try await client.from("consents").update(Rev(revokedAt: ISO8601.string(Date()))).eq("kind", value: "ai_processing").execute()
        }
    }
}

enum AppError: LocalizedError {
    case server(String), notSignedIn, healthUnavailable
    var errorDescription: String? {
        switch self {
        case .server(let m): return m
        case .notSignedIn: return "Inicia sesión para continuar."
        case .healthUnavailable: return "Apple Health no está disponible en este dispositivo."
        }
    }
}
