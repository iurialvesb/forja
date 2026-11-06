import Foundation

// Modelos de la app. Las filas de base de datos se decodifican con .convertFromSnakeCase
// (configurado en SupabaseService). Fechas "YYYY-MM-DD" se guardan como String a propósito:
// son fechas de calendario, no instantes, y así evitamos errores de zona horaria.

// MARK: - Prescripción (JSON del motor, camelCase)

struct Pace: Codable, Hashable { let secPerKm: Int; let label: String }

struct PrescriptionStep: Codable, Hashable, Identifiable {
    var id: String { "\(kind)-\(label)-\(repeat_ ?? 0)-\(distanceM ?? 0)-\(durationS ?? 0)" }
    let kind: String
    let label: String
    var durationS: Double?
    var distanceM: Double?
    var pace: Pace?
    var paceRange: [Double]?
    var hrRange: [Double]?
    var repeat_: Int?
    var steps: [PrescriptionStep]?
    var exerciseId: String?
    var sets: Int?
    var reps: Int?
    var loadKg: Double?
    var loadIsEstimate: Bool?
    var rir: Int?
    var restS: Double?
    var cue: String?

    enum CodingKeys: String, CodingKey {
        case kind, label, durationS, distanceM, pace, paceRange, hrRange, repeat_ = "repeat", steps, exerciseId, sets, reps, loadKg, loadIsEstimate, rir, restS, cue
    }
}
// Los pasos los escribe el motor en camelCase; el decoder con .convertFromSnakeCase no altera claves sin "_".

struct PlannedSession: Codable, Identifiable, Hashable {
    let id: String
    let date: String
    var slot: String
    let type: String
    let discipline: String
    let title: String
    let objective: String?
    let intensity: String?
    let estMinutes: Int?
    let legStress: Int?
    let key: Bool
    let plannedKm: Double?
    let steps: [PrescriptionStep]
    let rationale: String?
    var status: String
    var locked: Bool?
    var startLocal: String?
    var fromCalendar: Bool?
}

struct PlanChange: Codable, Identifiable, Hashable {
    let id: String
    let date: String?
    let trigger: String
    let action: String
    let reason: String
    let createdAt: String
}

// MARK: - Sesiones realizadas

struct SessionRow: Codable, Identifiable, Hashable {
    let id: String
    let startedAt: String
    let durationS: Int
    let discipline: String
    let title: String?
    let rpe: Double?
    let avgHr: Int?
    let maxHr: Int?
    let distanceM: Double?
    let elevationGainM: Double?
    let internalLoad: Double?
    let legIndex: Double?
    let primarySource: String
    let isRace: Bool?
    var sessionBlocks: [BlockRow]?
    var sessionSets: [SetRow]?

    var start: Date { ISO8601.parse(startedAt) ?? .distantPast }
    var paceSecPerKm: Double? { guard let d = distanceM, d > 0 else { return nil }; return Double(durationS) / (d / 1000) }
}

struct BlockRow: Codable, Identifiable, Hashable {
    let id: String; let position: Int; let kind: String; let format: String?
    let rounds: Double?; let resultText: String?
}
struct SetRow: Codable, Identifiable, Hashable {
    let id: String; let blockId: String; let position: Int; let exerciseId: String?
    let reps: Int?; let loadKg: Double?; let distanceM: Double?; let isWarmup: Bool
}

/// Sesión en el formato del motor (lo que se envía a /ingest-session).
struct EngineSession: Codable {
    var id: String = UUID().uuidString
    var startedAt: String
    var durationS: Double
    var discipline: String
    var title: String?
    var rpe: Double?
    var avgHr: Double?
    var maxHr: Double?
    var hrZoneSeconds: [Double]?
    var distanceM: Double?
    var elevationGainM: Double?
    var elevationLossM: Double?
    var cadenceSpm: Double?
    var blocks: [EngineBlock]?
    var isRace: Bool?
    var isTimeTrial: Bool?
    var source: String
    var externalId: String?
    var notes: String?
    var activeKcal: Double?
    var splits: [EngineSplit]?
}
struct EngineBlock: Codable { var kind: String; var format: String?; var timeCapS: Double?; var rounds: Double?; var sets: [EngineSet]; var resultText: String?; var resultTimeS: Double?; var resultRounds: Int?; var resultReps: Int? }
struct EngineSet: Codable, Identifiable { var id = UUID(); var exerciseId: String; var reps: Int?; var loadKg: Double?; var distanceM: Double?; var durationS: Double?; var calories: Double?; var rpe: Double?; var rir: Int?; var isWarmup: Bool?
    enum CodingKeys: String, CodingKey { case exerciseId, reps, loadKg, distanceM, durationS, calories, rpe, rir, isWarmup } }
struct EngineSplit: Codable { var kmIndex: Int; var durationS: Double; var avgHr: Double?; var cadence: Double?; var elevationDeltaM: Double? }

struct IngestResult: Codable { let sessionId: String; let merged: Bool; let duplicateOf: String?; let prs: [String]; let changes: [EngineChange] }
struct EngineChange: Codable, Hashable { let plannedId: String; let date: String; let action: String; let reason: String }

// MARK: - Salud, recuperación

struct ReadinessRow: Codable, Hashable {
    let date: String; let score: Int; let level: String; let reasons: [String]
    let acwr: Double?; let ctl: Double?; let atl: Double?; let tsb: Double?; let legFatigue: Double?; let dataQuality: String?
}

struct CheckInRow: Codable {
    var userId: String?
    var date: String
    var fatigue: Int = 3, soreness: Int = 2, stress: Int = 2, motivation: Int = 4, sleepQuality: Int = 3
    var pains: [PainReport] = []
    var note: String?
}
struct PainReport: Codable, Hashable, Identifiable {
    var id = UUID()
    var area: String = ""
    var intensity: Int = 3
    var character: String = "difuso_muscular"
    var bilateral: Bool = false
    var affectsMovement: Bool = false
    var swelling: Bool = false
    var numbness: Bool = false
    var daysOngoing: Int = 1
    var worsening: Bool = false
    enum CodingKeys: String, CodingKey { case area, intensity, character, bilateral, affectsMovement, swelling, numbness, daysOngoing, worsening }
}

struct DailyHealthRow: Codable { var userId: String; var date: String; var hrvMs: Double?; var hrvMethod: String?; var rhr: Int?; var sleepH: Double?; var sleepEfficiency: Double?; var steps: Int?; var activeKcal: Double?; var exerciseMin: Int?; var vo2max: Double?; var source = "healthkit" }

// MARK: - Perfil y objetivos

struct Profile: Codable, Hashable {
    let id: String
    var displayName: String?
    var birthDate: String?
    var sex: String?
    var heightCm: Double?
    var experience: String?
    var hyroxDivision: String?
    var allowDoubles: Bool
    var crossfitPerWeek: Int
    var sleepNeedH: Double
}
struct Physiology: Codable, Hashable { var userId: String?; var effectiveFrom: String; var hrRest: Int?; var hrMax: Int?; var lthr: Int?; var vo2max: Double?; var method: String? }
struct Availability: Codable, Hashable, Identifiable { var id: Int { weekday }; var userId: String?; var weekday: Int; var am: Bool; var pm: Bool; var maxMinutes: Int; var boxClass: Bool }
struct Injury: Codable, Hashable, Identifiable { var id: String?; var userId: String?; var area: String; var description: String?; var startedOn: String?; var resolvedOn: String?; var avoidRegions: [String]? }
struct BodyMetric: Codable { var userId: String; var date: String; var weightKg: Double?; var bodyFatPct: Double?; var source = "manual" }

struct Goal: Codable, Identifiable, Hashable {
    var id: String?
    var userId: String?
    var name: String
    var type: String
    var date: String
    var priority: String
    var distanceM: Double?
    var targetTimeS: Int?
    var notes: String?
    var status: String = "active"
}

struct PhaseRow: Codable, Identifiable, Hashable { let id: String; let goalId: String?; let kind: String; let startDate: String; let endDate: String; let focus: String; let secondary: String? }

struct PersonalRecord: Codable, Identifiable, Hashable { let id: String; let metric: String; let value: Double; let unit: String; let kind: String; let achievedOn: String; let detail: String? }

// MARK: - Fotos

struct PhotoQuestion: Codable, Identifiable, Hashable { let id: String; let question: String; let options: [String]?; let kind: String }
struct ParseResponse: Codable { let parsed: AnyCodable; let questions: [PhotoQuestion] }

// MARK: - Coach

struct CoachReply: Codable { let threadId: String; let reply: String; let tools: [String] }
struct ChatMessage: Identifiable, Hashable { let id = UUID(); let role: String; let text: String }

// MARK: - Utilidades

enum ISO8601 {
    nonisolated(unsafe) static let full: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    nonisolated(unsafe) static let basic = ISO8601DateFormatter()
    static func parse(_ s: String) -> Date? { full.date(from: s) ?? basic.date(from: s) }
    static func string(_ d: Date) -> String { basic.string(from: d) }
}

enum DayKey {
    static let cal: Calendar = { var c = Calendar(identifier: .iso8601); c.timeZone = TimeZone(identifier: "Europe/Madrid")!; c.firstWeekday = 2; return c }()
    nonisolated(unsafe) static let fmt: DateFormatter = { let f = DateFormatter(); f.calendar = cal; f.timeZone = cal.timeZone; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()
    static func string(_ d: Date) -> String { fmt.string(from: d) }
    static func date(_ s: String) -> Date { fmt.date(from: s) ?? Date() }
    static var today: String { string(Date()) }
    static func monday(of d: Date) -> Date { cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: d))! }
    static func add(_ days: Int, to s: String) -> String { string(cal.date(byAdding: .day, value: days, to: date(s))!) }
}

func fmtPace(_ sec: Double) -> String { let s = Int(sec.rounded()); return String(format: "%d:%02d/km", s / 60, s % 60) }
func fmtDuration(_ sec: Double) -> String {
    let s = Int(sec.rounded()); let h = s / 3600, m = (s % 3600) / 60, r = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
}

/// JSON arbitrario (la lectura de la foto se edita y se reenvía tal cual).
struct AnyCodable: Codable, Hashable {
    let value: JSONValue
    init(_ v: JSONValue) { value = v }
    init(from decoder: Decoder) throws { value = try JSONValue(from: decoder) }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
indirect enum JSONValue: Codable, Hashable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }
    subscript(key: String) -> JSONValue? { if case .object(let o) = self { return o[key] }; return nil }
    var string: String? { if case .string(let s) = self { return s }; return nil }
    var array: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
}
