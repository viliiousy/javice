import Foundation
import AppIntents

// 시리·단축어 → 앱. 요청을 잠깐 저장해 두고 앱을 연다. 화면(JS)이 열리면 꺼내서 처리한다.
// (할 일을 실제로 넣는 일은 로그인 정보가 있는 화면이 한다 — 여기서는 구글 토큰을 다루지 않는다.)
enum BashyIntentStore {
    static let key = "bashy.pendingIntents"
    static let didChange = Notification.Name("BashyIntentStoreDidChange")

    static func push(_ item: [String: String]) {
        var list = UserDefaults.standard.array(forKey: key) as? [[String: String]] ?? []
        list.append(item)
        UserDefaults.standard.set(Array(list.suffix(20)), forKey: key)
        NotificationCenter.default.post(name: didChange, object: nil)
    }

    static func drain() -> [[String: String]] {
        var list = UserDefaults.standard.array(forKey: key) as? [[String: String]] ?? []
        UserDefaults.standard.removeObject(forKey: key)
        // 홈 화면 위젯에서 누른 것(할 일 완료 · 습관 체크)은 App Group 에 쌓여 있다
        if let g = UserDefaults(suiteName: "group.app.bashy") {
            list += g.array(forKey: "pending") as? [[String: String]] ?? []
            g.removeObject(forKey: "pending")
        }
        return list
    }
}

@available(iOS 16.0, *)
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 추가"
    static var description = IntentDescription("Bashy 할 일(구글 할 일)에 새 항목을 넣습니다.")
    static var openAppWhenRun = true

    @Parameter(title: "할 일", requestValueDialog: "어떤 할 일을 추가할까요?")
    var title: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        BashyIntentStore.push(["action": "addTask", "title": title])
        return .result(dialog: "'\(title)'을(를) 추가합니다.")
    }
}

@available(iOS 16.0, *)
struct ShowTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "오늘 할 일 보기"
    static var description = IntentDescription("Bashy 를 열어 오늘의 할 일을 보여 줍니다.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        BashyIntentStore.push(["action": "today"])
        return .result()
    }
}

@available(iOS 16.0, *)
struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "몸무게 기록"
    static var description = IntentDescription("오늘 몸무게를 Bashy 에 기록합니다.")
    static var openAppWhenRun = true

    @Parameter(title: "몸무게(kg)", requestValueDialog: "몸무게가 몇 kg 인가요?")
    var kg: Double

    func perform() async throws -> some IntentResult & ProvidesDialog {
        BashyIntentStore.push(["action": "weight", "kg": String(kg)])
        return .result(dialog: "\(String(format: "%.1f", kg))kg 을 기록합니다.")
    }
}

@available(iOS 16.0, *)
struct BashyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddTaskIntent(), phrases: [
            "\(.applicationName)에 할 일 추가",
            "\(.applicationName) 할 일 추가해 줘",
        ], shortTitle: "할 일 추가", systemImageName: "checklist")
        AppShortcut(intent: ShowTodayIntent(), phrases: [
            "\(.applicationName) 오늘 할 일",
            "\(.applicationName)에서 오늘 할 일 보여 줘",
        ], shortTitle: "오늘 할 일", systemImageName: "calendar")
        AppShortcut(intent: LogWeightIntent(), phrases: [
            "\(.applicationName)에 몸무게 기록",
        ], shortTitle: "몸무게 기록", systemImageName: "scalemass")
    }
}
