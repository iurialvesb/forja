import XCTest
@testable import Forja

final class ForjaTests: XCTestCase {
    func testZoneSecondsAssignsByThreshold() {
        let t0 = Date()
        let hr = (0..<60).map { (t0.addingTimeInterval(Double($0) * 10), $0 < 30 ? 130.0 : 175.0) }
        let z = HealthKitService.zoneSeconds(hr: hr, end: t0.addingTimeInterval(600), zones: [(0, 136), (136, 150), (150, 164), (164, 178), (178, 192)])
        XCTAssertEqual(z[0], 300, accuracy: 1)
        XCTAssertEqual(z[3], 300, accuracy: 1)
    }

    func testKmSplits() {
        let t0 = Date()
        // 10 muestras de 250 m cada 75 s → 2,5 km a 5:00/km
        let d = (0..<10).map { (t0.addingTimeInterval(Double($0) * 75), t0.addingTimeInterval(Double($0 + 1) * 75), 250.0) }
        let s = HealthKitService.kmSplits(d, start: t0, hr: [])
        XCTAssertEqual(s.count, 2)
        XCTAssertEqual(s[0].durationS, 300, accuracy: 0.5)
    }

    func testDayKeysUseMadridAndMondayWeeks() {
        let monday = DayKey.monday(of: DayKey.date("2026-11-08"))   // domingo
        XCTAssertEqual(DayKey.string(monday), "2026-11-02")
        XCTAssertEqual(DayKey.add(1, to: "2026-12-31"), "2027-01-01")
    }

    func testPrescriptionStepDecodesEngineJSON() throws {
        let json = #"[{"kind":"repeat","label":"5 repeticiones","repeat":5,"steps":[{"kind":"work","label":"1000 m","distanceM":1000,"pace":{"secPerKm":238,"label":"Ritmo I"}}]}]"#
        let dec = JSONDecoder(); dec.keyDecodingStrategy = .convertFromSnakeCase
        let steps = try dec.decode([PrescriptionStep].self, from: Data(json.utf8))
        XCTAssertEqual(steps.first?.repeat_, 5)
        XCTAssertEqual(steps.first?.steps?.first?.pace?.secPerKm, 238)
    }
}
