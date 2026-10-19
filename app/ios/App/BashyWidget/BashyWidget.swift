import WidgetKit
import SwiftUI

// Bashy 홈 화면 위젯 — 앱이 넘겨 준 '오늘 요약'(BashyNativePlugin.setWidget)만 그린다.
// 저장소: App Group(group.app.bashy) UserDefaults 의 "today" (JSON 문자열)
// 디자인: 앱 2차 디자인과 같은 먹색 판 + 주황 점 하나. 숫자(습관) 하나만 크게.

let bashyGroup = "group.app.bashy"

struct Snap: Decodable {
    struct Habits: Decodable { let done: Int; let total: Int; let left: [String]? }
    struct Tasks: Decodable { let count: Int; let top: [String]? }
    struct Check: Decodable { let done: Int; let total: Int }
    struct Kcal: Decodable { let eat: Int; let goal: Int }
    struct Next: Decodable { let title: String; let when: String }
    let date: String?
    let day: String?
    let habits: Habits?
    let tasks: Tasks?
    let check: Check?
    let kcal: Kcal?
    let kg: Double?
    let next: Next?

    static func load() -> Snap? {
        guard let s = UserDefaults(suiteName: bashyGroup)?.string(forKey: "today"),
              let d = s.data(using: .utf8),
              let v = try? JSONDecoder().decode(Snap.self, from: d) else { return nil }
        return v
    }
    var isToday: Bool {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        return day == f.string(from: Date())
    }
    var habitNum: String { habits.map { "\($0.done)/\($0.total)" } ?? "–" }
    var nextLine: String? { next.map { ($0.when.isEmpty ? "" : $0.when + "  ") + $0.title } }
    var foot: String {
        var p: [String] = []
        if let t = tasks { p.append("할일 \(t.count)") }
        if let c = check, c.total > 0 { p.append("체크 \(c.done)/\(c.total)") }
        if let k = kcal {
            let nf = NumberFormatter(); nf.numberStyle = .decimal
            if k.goal > 0 { p.append("남은 \(nf.string(from: NSNumber(value: max(0, k.goal - k.eat))) ?? "")kcal") }
            else if k.eat > 0 { p.append("\(nf.string(from: NSNumber(value: k.eat)) ?? "")kcal") }
        }
        if let w = kg { p.append(String(format: "%.1fkg", w)) }
        return p.joined(separator: "   ")
    }
}

struct Entry: TimelineEntry { let date: Date; let snap: Snap? }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snap: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), snap: Snap.load())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // 앱이 기록을 바꿀 때마다 새로 그리게 한다(reloadAllTimelines). 자정이 지나면 '앱을 열어 새로 고침' 으로 바뀌도록 한 번 더.
        let cal = Calendar.current
        let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: Date())!)
        completion(Timeline(entries: [Entry(date: Date(), snap: Snap.load()), Entry(date: midnight.addingTimeInterval(5), snap: Snap.load())], policy: .never))
    }
}

private let bg = Color(red: 0x10/255, green: 0x11/255, blue: 0x13/255)
private let fg = Color(red: 0xEC/255, green: 0xED/255, blue: 0xEE/255)
private let sub = Color(red: 0x8B/255, green: 0x8F/255, blue: 0x97/255)
private let accent = Color(red: 1, green: 0x6A/255, blue: 0x2B/255)

private func todayLabel(_ d: Date) -> String {
    let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "M월 d일 EEEE"; return f.string(from: d)
}

struct Header: View {
    let text: String
    var body: some View {
        HStack {
            Text(text).font(.system(size: 13)).foregroundColor(sub).lineLimit(1)
            Spacer(minLength: 4)
            Circle().fill(accent).frame(width: 8, height: 8)
        }
    }
}

struct TodayView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = e.snap
        let fresh = s?.isToday == true && Calendar.current.isDateInToday(e.date)
        VStack(alignment: .leading, spacing: 0) {
            Header(text: fresh ? (s?.date ?? todayLabel(e.date)) : todayLabel(e.date))
            if !fresh {
                Spacer()
                Text("–").font(.system(size: 40, weight: .semibold, design: .rounded)).foregroundColor(fg)
                Text("앱을 한 번 열면 오늘 요약이 채워집니다").font(.system(size: 12)).foregroundColor(sub).lineLimit(2)
            } else if family == .systemSmall {
                Spacer()
                Text(s!.habitNum).font(.system(size: 44, weight: .semibold, design: .rounded)).foregroundColor(fg).minimumScaleFactor(0.6).lineLimit(1)
                Text(habitSub(s!)).font(.system(size: 13)).foregroundColor(fg).lineLimit(1).padding(.top, 2)
                if let n = s!.nextLine { Text(n).font(.system(size: 12)).foregroundColor(accent).lineLimit(1).padding(.top, 4) }
            } else {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s!.habitNum).font(.system(size: 40, weight: .semibold, design: .rounded)).foregroundColor(fg).minimumScaleFactor(0.6).lineLimit(1)
                        Text("습관").font(.system(size: 12)).foregroundColor(sub)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        let top = s!.tasks?.top ?? []
                        if top.isEmpty { Text("남은 할 일이 없습니다").font(.system(size: 14)).foregroundColor(sub) }
                        ForEach(Array(top.prefix(3).enumerated()), id: \.offset) { _, t in
                            Text("·  " + t).font(.system(size: 14)).foregroundColor(fg).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }.padding(.top, 8)
                Spacer(minLength: 4)
                if let n = s!.nextLine { Text(n).font(.system(size: 13)).foregroundColor(accent).lineLimit(1) }
                Text(s!.foot).font(.system(size: 12)).foregroundColor(sub).lineLimit(1).padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetBg()
    }
    func habitSub(_ s: Snap) -> String {
        if let l = s.habits?.left?.first { return "다음 · " + l }
        if let h = s.habits, h.total > 0 { return "오늘 습관 끝" }
        return "습관"
    }
}

extension View {
    @ViewBuilder func widgetBg() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) { bg }
        } else {
            self.padding(16).background(bg)
        }
    }
}

@main
struct BashyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyToday", provider: Provider()) { e in TodayView(e: e) }
            .configurationDisplayName("Bashy 오늘")
            .description("습관·할 일·다음 일정을 한눈에")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
