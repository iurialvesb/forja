import Foundation
import UserNotifications

/// Avisos locales: lo que falta o sobra antes de la siguiente comida y el suplemento del día.
enum NotificationService {
    static func requestPermission() async { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }

    static func schedule(from week: NutritionWeek) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: (0..<20).map { "nut-\($0)" } + ["supp"])
        guard UserDefaults.standard.object(forKey: "nutrition.notify") as? Bool ?? true else { return }
        let today = week.days.first { $0.date == DayKey.today }
        let now = Date()
        for (i, a) in (today?.alerts ?? []).prefix(5).enumerated() {
            let (h, m) = Slots.hour(a.slot ?? "merienda")
            var comps = DayKey.cal.dateComponents([.year, .month, .day], from: now); comps.hour = h; comps.minute = m
            guard var fire = DayKey.cal.date(from: comps) else { continue }
            fire = fire.addingTimeInterval(-45 * 60)
            if fire < now { fire = now.addingTimeInterval(60) }
            add(id: "nut-\(i)", title: "Ajuste de macros", body: a.message, at: fire)
        }
        let take = week.supplements.recs.filter(\.take)
        if !take.isEmpty {
            var comps = DayKey.cal.dateComponents([.year, .month, .day], from: now); comps.hour = 8; comps.minute = 30
            if let fire = DayKey.cal.date(from: comps), fire > now {
                add(id: "supp", title: "Suplementos de hoy", body: take.map { "\($0.name)\($0.when.map { " – \($0)" } ?? "")" }.joined(separator: " · "), at: fire)
            }
        }
    }

    private static func add(id: String, title: String, body: String, at date: Date) {
        let c = UNMutableNotificationContent(); c.title = title; c.body = body; c.sound = .default
        let t = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: t))
    }
}
