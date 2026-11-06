import Foundation
import HealthKit

/// Lectura de Apple Health / Apple Watch mediante HealthKit.
/// Limitaciones reales: los datos solo existen en el dispositivo (no hay API web), HealthKit no funciona
/// en el simulador para datos reales, el usuario puede denegar tipos sin que la app lo sepa (lectura),
/// y Apple no expone su puntuación de "recuperación": la calculamos nosotros con HRV, FC en reposo y sueño.
final class HealthKitService: @unchecked Sendable {
    static let shared = HealthKitService()
    let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate), HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.appleExerciseTime),
            HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceSwimming),
            HKQuantityType(.runningStrideLength), HKQuantityType(.runningSpeed), HKQuantityType(.runningPower),
            HKQuantityType(.vo2Max), HKQuantityType(.bodyMass), HKQuantityType(.bodyFatPercentage), HKQuantityType(.leanBodyMass),
            HKCategoryType(.sleepAnalysis), HKSeriesType.workoutRoute(),
        ]
        s.insert(HKQuantityType(.workoutEffortScore))   // iOS 18: esfuerzo 1-10 registrado en el Watch
        return s
    }
    private var shareTypes: Set<HKSampleType> { [HKObjectType.workoutType()] }

    func requestAuthorization() async throws {
        guard isAvailable else { throw AppError.healthUnavailable }
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    // MARK: Entrega en segundo plano (nuevo entrenamiento en el Watch → la app se despierta y sincroniza)

    func startBackgroundObservers(onNewData: @escaping @Sendable () async -> Void) {
        guard isAvailable else { return }
        for type in [HKObjectType.workoutType(), HKQuantityType(.heartRateVariabilitySDNN), HKCategoryType(.sleepAnalysis)] as [HKSampleType] {
            let q = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }
                Task { await onNewData(); completion() }
            }
            store.execute(q)
            store.enableBackgroundDelivery(for: type, frequency: type == HKObjectType.workoutType() ? .immediate : .hourly) { _, _ in }
        }
    }

    // MARK: Entrenamientos (consulta incremental con ancla persistida)

    private let anchorKey = "hk.workouts.anchor"
    private var anchor: HKQueryAnchor? {
        get { UserDefaults.standard.data(forKey: anchorKey).flatMap { try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0) } }
        set { UserDefaults.standard.set(newValue.flatMap { try? NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true) }, forKey: anchorKey) }
    }

    /// Entrenamientos nuevos o modificados desde la última sincronización (o desde `since` la primera vez).
    func newWorkouts(since: Date) async throws -> (workouts: [HKWorkout], deleted: [UUID], commit: () -> Void) {
        let predicate = anchor == nil ? HKQuery.predicateForSamples(withStart: since, end: nil) : nil
        return try await withCheckedThrowingContinuation { cont in
            let q = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] _, added, deleted, newAnchor, error in
                if let error { cont.resume(throwing: error); return }
                let w = (added ?? []).compactMap { $0 as? HKWorkout }
                cont.resume(returning: (w, (deleted ?? []).map(\.uuid), { self?.anchor = newAnchor }))
            }
            store.execute(q)
        }
    }

    func resetAnchor() { anchor = nil }

    /// Convierte un HKWorkout en una sesión del motor: FC, zonas, distancia, desnivel, cadencia y parciales por km.
    func engineSession(from w: HKWorkout, zones: [(Double, Double)]?) async -> EngineSession {
        let discipline = Self.discipline(w.workoutActivityType)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let hrStats = w.statistics(for: HKQuantityType(.heartRate))
        let distance = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter())
            ?? w.statistics(for: HKQuantityType(.distanceCycling))?.sumQuantity()?.doubleValue(for: .meter())
            ?? w.statistics(for: HKQuantityType(.distanceSwimming))?.sumQuantity()?.doubleValue(for: .meter())
        let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
        let elevUp = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
        let elevDown = (w.metadata?[HKMetadataKeyElevationDescended] as? HKQuantity)?.doubleValue(for: .meter())
        var s = EngineSession(startedAt: ISO8601.string(w.startDate), durationS: w.duration, discipline: discipline,
                              title: Self.title(w.workoutActivityType), avgHr: hrStats?.averageQuantity()?.doubleValue(for: bpm),
                              maxHr: hrStats?.maximumQuantity()?.doubleValue(for: bpm), distanceM: distance, elevationGainM: elevUp,
                              elevationLossM: elevDown, source: "healthkit", externalId: w.uuid.uuidString, activeKcal: kcal)
        if let effort = await effortScore(for: w) { s.rpe = effort }
        let hr = (try? await samples(HKQuantityType(.heartRate), start: w.startDate, end: w.endDate)) ?? []
        if let zones, !hr.isEmpty { s.hrZoneSeconds = Self.zoneSeconds(hr: hr.map { ($0.startDate, $0.quantity.doubleValue(for: bpm)) }, end: w.endDate, zones: zones) }
        if discipline == "running" {
            let steps = w.statistics(for: HKQuantityType(.stepCount))?.sumQuantity()?.doubleValue(for: .count())
            if let steps, w.duration > 0 { s.cadenceSpm = steps / (w.duration / 60) }
            let dist = (try? await samples(HKQuantityType(.distanceWalkingRunning), start: w.startDate, end: w.endDate)) ?? []
            s.splits = Self.kmSplits(dist.map { ($0.startDate, $0.endDate, $0.quantity.doubleValue(for: .meter())) }, start: w.startDate,
                                     hr: hr.map { ($0.startDate, $0.quantity.doubleValue(for: bpm)) })
        }
        return s
    }

    private func effortScore(for w: HKWorkout) async -> Double? {
        let pred = HKQuery.predicateForSamples(withStart: w.startDate, end: w.endDate.addingTimeInterval(3600))
        let rows = (try? await samples(HKQuantityType(.workoutEffortScore), predicate: pred)) ?? []
        return rows.last.map { $0.quantity.doubleValue(for: .appleEffortScore()) }
    }

    func samples(_ type: HKQuantityType, start: Date, end: Date) async throws -> [HKQuantitySample] {
        try await samples(type, predicate: HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate))
    }

    func samples(_ type: HKQuantityType, predicate: NSPredicate) async throws -> [HKQuantitySample] {
        try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, r, e in
                if let e { cont.resume(throwing: e) } else { cont.resume(returning: (r as? [HKQuantitySample]) ?? []) }
            }
            store.execute(q)
        }
    }

    static func zoneSeconds(hr: [(Date, Double)], end: Date, zones: [(Double, Double)]) -> [Double] {
        var out = Array(repeating: 0.0, count: 5)
        for (i, (t, v)) in hr.enumerated() {
            let next = i + 1 < hr.count ? hr[i + 1].0 : end
            let dt = min(max(0, next.timeIntervalSince(t)), 30)   // huecos > 30 s no se imputan
            let z = zones.lastIndex(where: { v >= $0.0 }) ?? 0
            out[min(4, z)] += dt
        }
        return out
    }

    static func kmSplits(_ d: [(Date, Date, Double)], start: Date, hr: [(Date, Double)]) -> [EngineSplit] {
        var out: [EngineSplit] = []; var acc = 0.0; var lastT = start; var km = 1
        for (s, e, m) in d {
            guard m > 0 else { continue }
            let before = acc; acc += m
            while acc >= Double(km) * 1000 {
                let frac = (Double(km) * 1000 - before) / m
                let t = s.addingTimeInterval(e.timeIntervalSince(s) * frac)
                let hrs = hr.filter { $0.0 >= lastT && $0.0 < t }.map(\.1)
                out.append(EngineSplit(kmIndex: km, durationS: t.timeIntervalSince(lastT), avgHr: hrs.isEmpty ? nil : hrs.reduce(0, +) / Double(hrs.count)))
                lastT = t; km += 1
            }
        }
        return out
    }

    // MARK: Salud diaria (HRV, FC reposo, sueño, pasos, kcal, VO2max)

    func dailyHealth(days: Int, userId: String) async -> [DailyHealthRow] {
        let cal = DayKey.cal
        let today = cal.startOfDay(for: Date())
        var rows: [DailyHealthRow] = []
        let bpm = HKUnit.count().unitDivided(by: .minute())
        for i in 0..<days {
            guard let day = cal.date(byAdding: .day, value: -i, to: today), let next = cal.date(byAdding: .day, value: 1, to: day) else { continue }
            var r = DailyHealthRow(userId: userId, date: DayKey.string(day), hrvMethod: "sdnn")
            if let hrv = try? await samples(HKQuantityType(.heartRateVariabilitySDNN), start: day, end: next), !hrv.isEmpty {
                r.hrvMs = hrv.map { $0.quantity.doubleValue(for: .secondUnit(with: .milli)) }.reduce(0, +) / Double(hrv.count)
            }
            if let rhr = try? await samples(HKQuantityType(.restingHeartRate), start: day, end: next).last {
                r.rhr = Int(rhr.quantity.doubleValue(for: bpm).rounded())
            }
            r.sleepH = await sleepHours(nightEndingOn: day)
            r.steps = (await sum(HKQuantityType(.stepCount), unit: .count(), start: day, end: next)).map { Int($0) }
            r.activeKcal = await sum(HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), start: day, end: next)
            r.exerciseMin = (await sum(HKQuantityType(.appleExerciseTime), unit: .minute(), start: day, end: next)).map { Int($0) }
            if let v = try? await samples(HKQuantityType(.vo2Max), start: day, end: next).last {
                r.vo2max = v.quantity.doubleValue(for: HKUnit(from: "ml/kg*min"))
            }
            if r.hrvMs != nil || r.rhr != nil || r.sleepH != nil || r.steps != nil { rows.append(r) }
        }
        return rows
    }

    private func sum(_ type: HKQuantityType, unit: HKUnit, start: Date, end: Date) async -> Double? {
        await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end), options: .cumulativeSum) { _, s, _ in
                cont.resume(returning: s?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    /// Horas dormidas en la noche que termina el día `day` (ventana 18:00 del día anterior → 14:00).
    private func sleepHours(nightEndingOn day: Date) async -> Double? {
        let start = day.addingTimeInterval(-6 * 3600), end = day.addingTimeInterval(14 * 3600)
        let asleep: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                                HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue]
        let samples: [HKCategorySample] = await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: HKCategoryType(.sleepAnalysis), predicate: HKQuery.predicateForSamples(withStart: start, end: end),
                                  limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, r, _ in cont.resume(returning: (r as? [HKCategorySample]) ?? []) }
            store.execute(q)
        }
        // Si hay varias fuentes (Watch + otra app), usamos la que más datos aporte para no sumar dos veces.
        let bySource = Dictionary(grouping: samples.filter { asleep.contains($0.value) }, by: { $0.sourceRevision.source.bundleIdentifier })
        guard let best = bySource.values.max(by: { a, b in a.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } < b.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } }) else { return nil }
        let secs = best.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
        return secs > 0 ? secs / 3600 : nil
    }

    func latestBody() async -> (weight: Double?, fat: Double?) {
        let w = try? await samples(HKQuantityType(.bodyMass), predicate: HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-90 * 86400), end: nil)).last
        let f = try? await samples(HKQuantityType(.bodyFatPercentage), predicate: HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-90 * 86400), end: nil)).last
        return (w?.quantity.doubleValue(for: .gramUnit(with: .kilo)), f.map { $0.quantity.doubleValue(for: .percent()) * 100 })
    }

    // MARK: Mapeo de tipos

    static func discipline(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "running"
        case .crossTraining, .highIntensityIntervalTraining, .mixedCardio: return "crossfit"
        case .functionalStrengthTraining, .traditionalStrengthTraining: return "strength"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .hiking: return "hiking"
        case .walking: return "walking"
        case .downhillSkiing, .snowSports, .crossCountrySkiing: return "skiing"
        case .paddleSports: return "other"
        case .tennis: return "tennis"
        case .racquetball, .squash, .pickleball: return "padel"
        case .yoga: return "yoga"
        case .flexibility, .cooldown, .preparationAndRecovery: return "mobility"
        case .dance, .socialDance, .cardioDance: return "dance"
        case .gymnastics: return "gymnastics"
        case .rowing: return "other"
        default: return "other"
        }
    }

    static func title(_ t: HKWorkoutActivityType) -> String {
        switch discipline(t) {
        case "running": return "Carrera"
        case "crossfit": return "Entrenamiento funcional"
        case "strength": return "Fuerza"
        case "cycling": return "Ciclismo"
        case "swimming": return "Natación"
        case "hiking": return "Senderismo"
        case "walking": return "Caminata"
        case "mobility": return "Movilidad"
        default: return "Entrenamiento"
        }
    }

    /// Guarda en Apple Health un entrenamiento registrado manualmente o desde foto (opcional).
    func saveWorkout(_ s: EngineSession) async throws {
        guard let start = ISO8601.parse(s.startedAt) else { return }
        let type: HKWorkoutActivityType = s.discipline == "running" ? .running : s.discipline == "strength" ? .traditionalStrengthTraining : .crossTraining
        let config = HKWorkoutConfiguration(); config.activityType = type
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        try await builder.beginCollection(at: start)
        try await builder.addMetadata([HKMetadataKeyExternalUUID: s.id])
        try await builder.endCollection(at: start.addingTimeInterval(s.durationS))
        _ = try await builder.finishWorkout()
    }
}
