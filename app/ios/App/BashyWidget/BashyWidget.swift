import WidgetKit
import ActivityKit
import SwiftUI
import AppIntents

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
        let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(86400))
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

struct BashyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyToday", provider: Provider()) { e in TodayView(e: e) }
            .configurationDisplayName("Bashy 오늘")
            .description("습관·할 일·다음 일정을 한눈에")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 운동 라이브 액티비티 (잠금 화면 · 다이내믹 아일랜드) ─────────────
// 앱(BashyNativePlugin.swift)의 정의와 똑같아야 한다.
struct WorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var sub: String
        var restEnd: Date?
        var step: String
    }
    var startedAt: Date
}


// 쉬는 시간이 끝났는지: 끝나는 시각을 staleDate 로 넘겨 두면 그 순간 시스템이 화면을 다시 그린다(isStale=true)
// → 앱이 잠들어 있어도 주황 카운트다운이 0 에서 흰색 운동 시간으로 바뀐다
@available(iOS 16.2, *)
private func restEndOf(_ ctx: ActivityViewContext<WorkoutAttributes>) -> Date? {
    guard !ctx.isStale, let end = ctx.state.restEnd, end > Date() else { return nil }
    return end
}

// 운동 단추 줄 (iOS 17+): 쉬는 중이면 +30초·건너뛰기, 아니면 세트 완료
struct WorkoutButtons: View {
    let ctx: ActivityViewContext<WorkoutAttributes>
    var compact = false
    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 8) {
                if restEndOf(ctx) != nil {
                    Button(intent: WorkoutActionIntent(act: "sub10")) { Text("−10초").frame(maxWidth: .infinity) }
                        .tint(Color.white.opacity(0.18))
                    Button(intent: WorkoutActionIntent(act: "add10")) { Text("+10초").frame(maxWidth: .infinity) }
                        .tint(Color.white.opacity(0.18))
                    Button(intent: WorkoutActionIntent(act: "skip")) { Text("건너뛰기").frame(maxWidth: .infinity) }
                        .tint(accent)
                } else {
                    Button(intent: WorkoutActionIntent(act: "done")) { Text(ctx.state.step.contains("세트") ? "세트 완료" : "다음 운동").frame(maxWidth: .infinity) }
                        .tint(accent)
                }
            }
            .font(.system(size: compact ? 13 : 14, weight: .semibold))
            .buttonStyle(.borderedProminent)
            .foregroundColor(.white)
        }
    }
}

// 애플 워치 스마트 스택(.small): 지금 운동 + 시간 + 단추
@available(iOS 18.0, *)
struct WorkoutWatchView: View {
    let ctx: ActivityViewContext<WorkoutAttributes>
    var body: some View {
        let resting = restEndOf(ctx)
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text(resting != nil ? "쉬는 시간" : ctx.state.title)
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(resting != nil ? accent : .white).lineLimit(1)
                if let end = resting {
                    Text(timerInterval: Date()...end, countsDown: true)
                        .font(.system(size: 34, weight: .bold).monospacedDigit()).foregroundColor(accent).minimumScaleFactor(0.7).lineLimit(1)
                } else {
                    Text(ctx.attributes.startedAt, style: .timer)
                        .font(.system(size: 30, weight: .bold).monospacedDigit()).foregroundColor(.white).minimumScaleFactor(0.7).lineLimit(1)
                }
                Text(resting != nil ? ctx.state.title : ctx.state.step).font(.system(size: 11)).foregroundColor(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if #available(iOS 17.0, *) {
                Button(intent: WorkoutActionIntent(act: resting != nil ? "skip" : "done")) {
                    Image(systemName: resting != nil ? "forward.end.fill" : "checkmark").font(.system(size: 18, weight: .bold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(accent)
            }
        }
    }
}

struct WorkoutLiveView: View {
    let ctx: ActivityViewContext<WorkoutAttributes>
    var body: some View {
        if #available(iOS 18.0, *) { FamilySwitch(ctx: ctx) } else { WorkoutLockView(ctx: ctx) }
    }
}

@available(iOS 18.0, *)
struct FamilySwitch: View {
    let ctx: ActivityViewContext<WorkoutAttributes>
    @Environment(\.activityFamily) var family
    var body: some View {
        if family == .small { WorkoutWatchView(ctx: ctx).padding(.horizontal, 6) } else { WorkoutLockView(ctx: ctx) }
    }
}

struct WorkoutLockView: View {
    let ctx: ActivityViewContext<WorkoutAttributes>
    var body: some View {
        let s = ctx.state
        VStack(spacing: 12) {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(s.step.isEmpty ? "운동 중" : s.step).font(.system(size: 12, weight: .semibold)).foregroundColor(accent)
                Text(s.title).font(.system(size: 20, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                Text(s.sub).font(.system(size: 13)).foregroundColor(Color.white.opacity(0.6)).lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                if let end = restEndOf(ctx) {
                    Text("쉬는 시간").font(.system(size: 11, weight: .medium)).foregroundColor(Color.white.opacity(0.6))
                    Text(timerInterval: Date()...end, countsDown: true).font(.system(size: 30, weight: .semibold).monospacedDigit())
                        .foregroundColor(accent).multilineTextAlignment(.trailing).frame(width: 96, alignment: .trailing)
                } else {
                    Text("운동 시간").font(.system(size: 11, weight: .medium)).foregroundColor(Color.white.opacity(0.6))
                    Text(ctx.attributes.startedAt, style: .timer).font(.system(size: 26, weight: .semibold).monospacedDigit())
                        .foregroundColor(.white).multilineTextAlignment(.trailing).frame(width: 110, alignment: .trailing)
                }
            }
        }
        WorkoutButtons(ctx: ctx)
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.063, green: 0.067, blue: 0.075))
        .activitySystemActionForegroundColor(.white)
    }
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutAttributes.self) { ctx in
            WorkoutLiveView(ctx: ctx)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(ctx.state.step.isEmpty ? "운동 중" : ctx.state.step).font(.system(size: 12, weight: .semibold)).foregroundColor(accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let end = restEndOf(ctx) {
                        Text(timerInterval: Date()...end, countsDown: true).font(.system(size: 18, weight: .semibold).monospacedDigit()).foregroundColor(accent).frame(width: 64, alignment: .trailing)
                    } else {
                        Text(ctx.attributes.startedAt, style: .timer).font(.system(size: 16, weight: .semibold).monospacedDigit()).frame(width: 72, alignment: .trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.state.title).font(.system(size: 17, weight: .semibold)).lineLimit(1)
                        Text(ctx.state.sub).font(.system(size: 12)).foregroundColor(.secondary).lineLimit(1)
                        WorkoutButtons(ctx: ctx, compact: true).padding(.top, 6)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill").foregroundColor(accent)
            } compactTrailing: {
                if let end = restEndOf(ctx) {
                    Text(timerInterval: Date()...end, countsDown: true).monospacedDigit().foregroundColor(accent).frame(width: 44)
                } else {
                    Text(ctx.attributes.startedAt, style: .timer).monospacedDigit().frame(width: 48)
                }
            } minimal: {
                Image(systemName: "dumbbell.fill").foregroundColor(accent)
            }
        }
    }
}

@main
struct BashyWidgets: WidgetBundle {
    var body: some Widget {
        BashyWidget()
        WorkoutLiveActivityWatch()
    }
}

// iOS 18: 애플 워치 스마트 스택에도 맞춤 화면(.small)을 띄운다
@available(iOS 18.0, *)
struct WorkoutLiveActivityWatch: Widget {
    var body: some WidgetConfiguration {
        WorkoutLiveActivity().body.supplementalActivityFamilies([.small])
    }
}

// 잠금 화면·다이내믹 아일랜드·애플 워치(스마트 스택)의 운동 단추 — 세트 완료 / 쉬는 시간 +30초 / 건너뛰기.
// 앱 쪽과 위젯 쪽에 같은 이름으로 둔다(눌리면 앱 프로세스에서 perform 이 돈다).
@available(iOS 17.0, *)
struct WorkoutActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "운동 동작"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "동작") var act: String
    init() { act = "done" }
    init(act: String) { self.act = act }
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: Notification.Name("BashyWorkoutAction"), object: nil, userInfo: ["act": act])
        return .result()
    }
}

