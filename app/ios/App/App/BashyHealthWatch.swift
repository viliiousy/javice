import Foundation
import HealthKit
import UserNotifications

// 인바디 앱 → 건강 앱에 새 체성분이 들어오면, Bashy 가 꺼져 있어도 iOS 가 잠깐 깨워 준다(백그라운드 전달).
// 그때 새 측정 날짜를 확인해 "인바디 10월 21일 측정이 들어왔습니다" 알림을 띄운다.
// 기록 자체는 앱을 열 때 화면(JS)이 건강 앱에서 읽어 계정에 저장한다.
enum BashyHealthWatch {
    private static let onKey = "bashy.healthWatch"
    private static let lastKey = "bashy.healthWatch.last"
    private static let store = HKHealthStore()
    private static var started = false

    static var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: onKey) }
        set { UserDefaults.standard.set(newValue, forKey: onKey) }
    }

    // 앱이 켜질 때마다(백그라운드로 깨어날 때 포함) 다시 걸어 둬야 iOS 가 계속 알려 준다
    static func startIfEnabled() {
        guard enabled, !started, HKHealthStore.isHealthDataAvailable(),
              let t = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return }
        started = true
        let q = HKObserverQuery(sampleType: t, predicate: nil) { _, done, err in
            if err == nil { checkNew(t) }
            done()
        }
        store.execute(q)
        store.enableBackgroundDelivery(for: t, frequency: .immediate) { _, _ in }
    }

    static func stop() {
        enabled = false
        if let t = HKQuantityType.quantityType(forIdentifier: .bodyMass) { store.disableBackgroundDelivery(for: t) { _, _ in } }
    }

    private static func checkNew(_ t: HKQuantityType) {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let q = HKSampleQuery(sampleType: t, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            guard let s = (samples as? [HKQuantitySample])?.first else { return }
            let last = UserDefaults.standard.double(forKey: lastKey)
            let ts = s.startDate.timeIntervalSince1970
            if last == 0 { UserDefaults.standard.set(ts, forKey: lastKey); return }   // 처음 켤 때는 기준만 잡는다
            guard ts > last + 1 else { return }
            UserDefaults.standard.set(ts, forKey: lastKey)
            let kg = s.quantity.doubleValue(for: .gramUnit(with: .kilo))
            let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M월 d일"
            let c = UNMutableNotificationContent()
            c.title = "인바디 \(f.string(from: s.startDate)) 측정이 들어왔습니다"
            c.body = String(format: "체중 %.1fkg · Bashy 를 열면 인바디 기록에 바로 반영됩니다", kg)
            c.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "bashy.inbody.\(Int(ts))", content: c, trigger: nil))
        }
        store.execute(q)
    }
}
