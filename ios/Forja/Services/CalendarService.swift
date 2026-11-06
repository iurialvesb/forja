import Foundation
import EventKit

/// Calendarios del iPhone (iCloud, Google, Exchange… y la suscripción de WodBuster si la añades en Ajustes → Calendario → Cuentas).
/// Lee las próximas 3 semanas y las envía a /calendar-sync, que detecta tus clases de CrossFit y tus huecos libres.
final class CalendarService: @unchecked Sendable {
    static let shared = CalendarService()
    let store = EKEventStore()

    var hasAccess: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    func requestAccess() async throws -> Bool { try await store.requestFullAccessToEvents() }

    func calendars() -> [EKCalendar] { store.calendars(for: .event).sorted { $0.title < $1.title } }

    struct Event: Codable { let uid: String; let title: String; let start: String; let end: String; let allDay: Bool; let location: String?; let calendar: String? }

    /// Eventos de los calendarios elegidos (si no hay selección, todos).
    func upcoming(calendarIds: [String], days: Int = 21) -> [Event] {
        guard hasAccess else { return [] }
        let cals = calendarIds.isEmpty ? nil : calendars().filter { calendarIds.contains($0.calendarIdentifier) }
        let pred = store.predicateForEvents(withStart: Date().addingTimeInterval(-86400), end: Date().addingTimeInterval(Double(days) * 86400), calendars: cals)
        return store.events(matching: pred).filter { $0.calendar.title != "Forja" }.map {
            Event(uid: $0.calendarItemExternalIdentifier ?? $0.eventIdentifier, title: $0.title ?? "", start: ISO8601.string($0.startDate), end: ISO8601.string($0.endDate),
                  allDay: $0.isAllDay, location: $0.location, calendar: $0.calendar.title)
        }
    }

    struct SyncResult: Decodable {
        struct Fixed: Decodable, Hashable { let date: String; let slot: String; let startLocal: String; let minutes: Int; let title: String }
        let events: Int; let crossfitClasses: [Fixed]; let replanned: Bool; let notes: [String]; let errors: [String]
    }

    func sync() async throws -> SyncResult {
        let ids = UserDefaults.standard.stringArray(forKey: "calendar.ids") ?? []
        struct Body: Encodable { let events: [Event]? }
        let r: SyncResult = try await SupabaseService.shared.call("calendar-sync", Body(events: hasAccess ? upcoming(calendarIds: ids) : nil))
        if UserDefaults.standard.bool(forKey: "calendar.export") { try? await exportPlan() }
        return r
    }

    /// Escribe las sesiones planificadas de las próximas 2 semanas en un calendario propio "Forja".
    func exportPlan() async throws {
        guard hasAccess else { return }
        let cal = calendars().first { $0.title == "Forja" } ?? {
            let c = EKCalendar(for: .event, eventStore: store); c.title = "Forja"
            c.source = store.defaultCalendarForNewEvents?.source ?? store.sources.first { $0.sourceType == .local }
            c.cgColor = CGColor(red: 1, green: 0.42, blue: 0.24, alpha: 1)
            try? store.saveCalendar(c, commit: true); return c
        }()
        let from = DayKey.today, to = DayKey.add(13, to: from)
        let sessions = try await SupabaseService.shared.plannedSessions(from: from, to: to)
        let old = store.events(matching: store.predicateForEvents(withStart: DayKey.date(from), end: DayKey.date(to).addingTimeInterval(86400), calendars: [cal]))
        for e in old { try? store.remove(e, span: .thisEvent, commit: false) }
        for s in sessions where s.status != "skipped" && s.fromCalendar != true {
            let e = EKEvent(eventStore: store); e.calendar = cal; e.title = s.title
            let parts = (s.startLocal ?? (s.slot == "am" ? "07:30" : "18:30")).split(separator: ":").compactMap { Int($0) }
            var comps = DayKey.cal.dateComponents([.year, .month, .day], from: DayKey.date(s.date)); comps.hour = parts.first; comps.minute = parts.last
            e.startDate = DayKey.cal.date(from: comps) ?? DayKey.date(s.date)
            e.endDate = e.startDate.addingTimeInterval(Double(s.estMinutes ?? 60) * 60)
            e.notes = [s.objective, s.rationale].compactMap { $0 }.joined(separator: "\n\n")
            try? store.save(e, span: .thisEvent, commit: false)
        }
        try store.commit()
    }
}
