import Foundation
import HealthKit

// 걸음 백그라운드 전달 — Bashy 를 열지 않아도 오늘 걸음이 계정(웹·허브)에 들어가게.
//
// 건강 앱에 걸음이 새로 쌓이면 iOS 가 Bashy 를 잠깐 깨운다(HealthKit 백그라운드 전달 · 걸음은 최대 한 시간에 한 번).
// 그때 최근 2일 걸음 합계를 읽어 bashy.app/api/hub (act: stepsPush) 로 올린다.
//   코드(<uid>.<stepsKey>)는 앱 화면(js/steps.js)이 로그인 상태에서 받아 넘겨준다 — 걸음 칸만 쓸 수 있는 전용 코드.
//   폰이 잠겨 있으면 건강 데이터가 암호화돼 읽히지 않는다 → 그때는 건너뛰고 다음 깨움(또는 잠금 해제 뒤)에 올린다.
enum BashyStepSync {
    private static let codeKey = "bashy.stepSync.code"
    private static let lastKey = "bashy.stepSync.last"     // 마지막으로 올린 값(같으면 다시 안 보냄)
    private static let store = HKHealthStore()
    private static var started = false
    private static var query: HKObserverQuery?

    static var code: String? {
        get { UserDefaults.standard.string(forKey: codeKey) }
        set { UserDefaults.standard.set(newValue, forKey: codeKey) }
    }

    static func startIfEnabled() {
        guard code != nil, !started, HKHealthStore.isHealthDataAvailable(),
              let t = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }
        started = true
        let q = HKObserverQuery(sampleType: t, predicate: nil) { _, done, err in
            guard err == nil, code != nil else { done(); return }
            push(t) { done() }
        }
        query = q
        store.execute(q)
        store.enableBackgroundDelivery(for: t, frequency: .hourly) { _, _ in }
    }

    static func stop() {
        code = nil
        if let q = query { store.stop(q); query = nil }
        started = false
        if let t = HKQuantityType.quantityType(forIdentifier: .stepCount) { store.disableBackgroundDelivery(for: t) { _, _ in } }
    }

    private static func push(_ t: HKQuantityType, _ done: @escaping () -> Void) {
        guard let code = code else { done(); return }
        let cal = Calendar.current
        let end = Date(), today = cal.startOfDay(for: end)
        guard let start = cal.date(byAdding: .day, value: -1, to: today) else { done(); return }
        var step = DateComponents(); step.day = 1
        let q = HKStatisticsCollectionQuery(quantityType: t, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end),
                                            options: .cumulativeSum, anchorDate: today, intervalComponents: step)
        q.initialResultsHandler = { _, res, e in
            guard e == nil, let res = res else { done(); return }   // 잠긴 폰 등 — 다음에
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            var days: [String: Int] = [:]
            res.enumerateStatistics(from: start, to: end) { s, _ in
                days[f.string(from: s.startDate)] = Int((s.sumQuantity()?.doubleValue(for: .count()) ?? 0).rounded())
            }
            let sig = days.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
            if sig == UserDefaults.standard.string(forKey: lastKey) || days.values.allSatisfy({ $0 == 0 }) { done(); return }
            guard let url = URL(string: "https://bashy.app/api/hub"),
                  let body = try? JSONSerialization.data(withJSONObject: ["act": "stepsPush", "code": code, "plat": "ios", "days": days]) else { done(); return }
            var r = URLRequest(url: url); r.httpMethod = "POST"; r.timeoutInterval = 20
            r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.httpBody = body
            URLSession.shared.dataTask(with: r) { _, resp, _ in
                let st = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if st == 200 { UserDefaults.standard.set(sig, forKey: lastKey) }
                if st == 401 { stop() }   // 코드가 바뀜(재발급·로그아웃) — 앱을 열면 새 코드로 다시 켜진다
                done()
            }.resume()
        }
        store.execute(q)
    }
}
