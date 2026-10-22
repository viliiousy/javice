import WidgetKit
import ActivityKit
import SwiftUI
import AppIntents

// Bashy 홈 화면 위젯 — 앱이 넘겨 준 '오늘 요약'(BashyNativePlugin.setWidget)만 그린다.
// 저장소: App Group(group.app.bashy) UserDefaults 의 "today" (JSON 문자열)
// 디자인: 앱 2차 디자인과 같은 먹색 판 + 주황 점 하나. 숫자(습관) 하나만 크게.

let bashyGroup = "group.app.bashy"

struct Snap: Decodable {
    struct HabitItem: Decodable { let id: String; let n: String; let ok: Bool }
    struct TaskItem: Decodable { let id: String; let l: String?; let t: String; let d: String? }
    struct Habits: Decodable { let done: Int; let total: Int; let left: [String]?; let items: [HabitItem]? }
    struct Tasks: Decodable { let count: Int; let top: [String]?; let items: [TaskItem]? }
    struct Cal: Decodable { let y: Int; let m: Int; let marks: [Int]? }
    struct Ev: Decodable { let t: String; let w: String }
    struct AI: Decodable { let k: String; let n: String; let h5: Int?; let d7: Int?; let left: Int?; let r: String? }
    struct Body: Decodable {
        let eat: Int; let goal: Int; let burn: Int?
        let p: Int?; let c: Int?; let f: Int?; let pg: Int?; let cg: Int?; let fg: Int?
        let part: String?; let done: Int?; let total: Int?; let vol: Int?; let sets: Int?
    }
    struct Mkt: Decodable { let n: String; let p: String; let c: Double? }
    struct Wx: Decodable { let t: Int; let icon: String; let name: String; let hi: Int?; let lo: Int? }
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
    let cal: Cal?
    let evs: [Ev]?
    let ai: [AI]?
    let body: Body?
    let mkt: [Mkt]?
    let wx: Wx?

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
        BashyPlannerWidget()
        BashyAIWidget()
        BashyBodyWidget()
        BashyHabitsWidget()
        BashyMarketWidget()
        BashyLockWidget()
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



// ═══════════════════════════════════════════════════════════════
// 위젯 모음 (2026-10) — 같은 먹색 판 · 주황 하나 · 숫자는 둥근 서체.
// 한 위젯에 가장 큰 것은 하나(숫자 또는 달력)만, 나머지는 회색으로 조용히.
// ═══════════════════════════════════════════════════════════════

private let hair = Color.white.opacity(0.08)
private let upRed = Color(red: 0.94, green: 0.33, blue: 0.33)
private let downBlue = Color(red: 0.36, green: 0.56, blue: 1.0)

private func pctColor(_ v: Int?) -> Color {
    guard let v = v else { return sub }
    return v <= 10 ? upRed : (v <= 30 ? Color(red: 1, green: 0.76, blue: 0.29) : accent)
}
private func sfName(_ i: String) -> String {
    switch i {
    case "sun": return "sun.max"
    case "moon": return "moon"
    case "cloud-sun": return "cloud.sun"
    case "cloud-moon": return "cloud.moon"
    case "rain": return "cloud.rain"
    case "snow": return "cloud.snow"
    case "fog": return "cloud.fog"
    case "storm": return "cloud.bolt"
    default: return "cloud"
    }
}
private func comma(_ n: Int) -> String {
    let f = NumberFormatter(); f.numberStyle = .decimal; return f.string(from: NSNumber(value: n)) ?? "\(n)"
}
private func isoDate(_ s: String?) -> Date? {
    guard let s = s, !s.isEmpty else { return nil }
    let a = ISO8601DateFormatter(); a.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = a.date(from: s) { return d }
    let b = ISO8601DateFormatter(); b.formatOptions = [.withInternetDateTime]
    return b.date(from: s)
}

struct Ring: View {
    let frac: Double; let color: Color; let width: CGFloat
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.1), lineWidth: width)
            Circle().trim(from: 0, to: CGFloat(max(0.001, min(1, frac))))
                .stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

struct WxMini: View {
    let w: Snap.Wx?
    var body: some View {
        if let w = w {
            HStack(spacing: 3) {
                Image(systemName: sfName(w.icon)).font(.system(size: 11, weight: .medium)).foregroundColor(sub)
                Text("\(w.t)°").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(fg)
            }
        }
    }
}

struct WHead: View {
    let title: String
    var trailing: String? = nil
    var body: some View {
        HStack(spacing: 6) {
            Text(title).font(.system(size: 13)).foregroundColor(sub).lineLimit(1)
            Spacer(minLength: 4)
            if let t = trailing { Text(t).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(fg) }
            Circle().fill(accent).frame(width: 8, height: 8)
        }
    }
}

struct StaleNote: View {
    var body: some View {
        Text("앱을 한 번 열면 채워집니다").font(.system(size: 12)).foregroundColor(sub).lineLimit(2)
    }
}

// ── 달력 (월요일 시작) ───────────────────────
struct MonthGrid: View {
    let y: Int; let m: Int; let marks: Set<Int>; let size: CGFloat
    var body: some View {
        let cal = Calendar(identifier: .gregorian)
        let first = cal.date(from: DateComponents(year: y, month: m, day: 1)) ?? Date()
        let days = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let lead = (cal.component(.weekday, from: first) + 5) % 7
        let now = Date()
        let isThis = Calendar.current.component(.month, from: now) == m && Calendar.current.component(.year, from: now) == y
        let today = Calendar.current.component(.day, from: now)
        let cells: [Int] = Array(repeating: 0, count: lead) + Array(1...days)
        let rows = (cells.count + 6) / 7
        VStack(spacing: size * 0.12) {
            HStack(spacing: 0) {
                ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
                    Text(d).font(.system(size: size * 0.82, weight: .medium))
                        .foregroundColor(i == 6 ? upRed.opacity(0.8) : (i == 5 ? downBlue.opacity(0.8) : sub))
                        .frame(maxWidth: .infinity)
                }
            }
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { c in
                        let i = r * 7 + c
                        let d = i < cells.count ? cells[i] : 0
                        let on = isThis && d == today
                        ZStack {
                            if d > 0 {
                                if on { Circle().fill(accent).frame(width: size * 1.75, height: size * 1.75) }
                                Text("\(d)").font(.system(size: size, weight: on ? .bold : .regular, design: .rounded))
                                    .foregroundColor(on ? .black : (c == 6 ? upRed : (c == 5 ? downBlue : fg)))
                                if marks.contains(d) && !on {
                                    Circle().fill(accent).frame(width: 3, height: 3).offset(y: size * 0.78)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: size * 1.5)
                    }
                }
            }
        }
    }
}

struct TaskRow: View {
    let t: Snap.TaskItem; let font: CGFloat
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: TaskDoneIntent(id: t.id, list: t.l ?? "")) {
                Image(systemName: "circle").font(.system(size: font + 3, weight: .regular)).foregroundColor(sub)
            }.buttonStyle(.plain)
            Link(destination: URL(string: "bashy://open/calendar")!) {
                Text(t.t).font(.system(size: font)).foregroundColor(fg).lineLimit(1)
            }
            Spacer(minLength: 2)
            if let d = t.d, !d.isEmpty {
                Text(d).font(.system(size: font - 2, weight: .medium)).foregroundColor(d == "지남" ? accent : sub)
            }
        }
    }
}

struct AddTaskButton: View {
    var body: some View {
        Link(destination: URL(string: "bashy://task/new")!) {
            Image(systemName: "plus").font(.system(size: 13, weight: .bold)).foregroundColor(.black)
                .frame(width: 26, height: 26).background(Circle().fill(accent))
        }
    }
}

struct PlannerView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = e.snap
        let now = Date()
        let y = s?.cal?.y ?? Calendar.current.component(.year, from: now)
        let m = s?.cal?.m ?? Calendar.current.component(.month, from: now)
        let marks = Set(s?.cal?.marks ?? [])
        let fresh = s?.isToday == true
        let items = fresh ? (s?.tasks?.items ?? []) : []
        Group {
            if family == .systemLarge {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("\(m)월").font(.system(size: 17, weight: .semibold)).foregroundColor(fg)
                        Text(todayLabel(now)).font(.system(size: 13)).foregroundColor(sub)
                        Spacer(); WxMini(w: s?.wx)
                    }
                    MonthGrid(y: y, m: m, marks: marks, size: 12)
                    Rectangle().fill(hair).frame(height: 1)
                    ForEach(Array((s?.evs ?? []).prefix(2).enumerated()), id: \.offset) { _, ev in
                        HStack(spacing: 8) {
                            Text(ev.w).font(.system(size: 12, weight: .medium, design: .rounded)).foregroundColor(accent).frame(width: 74, alignment: .leading)
                            Text(ev.t).font(.system(size: 13)).foregroundColor(fg).lineLimit(1)
                        }
                    }
                    HStack {
                        Text("할 일").font(.system(size: 13)).foregroundColor(sub)
                        Text("\(items.count)").font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundColor(fg)
                        Spacer(); AddTaskButton()
                    }
                    if !fresh { StaleNote() }
                    else if items.isEmpty { Text("남은 할 일이 없습니다").font(.system(size: 13)).foregroundColor(sub) }
                    ForEach(items.prefix(4), id: \.id) { TaskRow(t: $0, font: 14) }
                    Spacer(minLength: 0)
                }
            } else {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("\(m)월").font(.system(size: 13, weight: .semibold)).foregroundColor(fg)
                            Spacer(); WxMini(w: s?.wx)
                        }
                        MonthGrid(y: y, m: m, marks: marks, size: 9)
                    }
                    .frame(width: 128)
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(spacing: 6) {
                            Text("할 일").font(.system(size: 13)).foregroundColor(sub)
                            Text("\(items.count)").font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundColor(fg)
                            Spacer(); AddTaskButton()
                        }
                        if !fresh { StaleNote() }
                        else if items.isEmpty { Text("남은 할 일이 없습니다").font(.system(size: 13)).foregroundColor(sub) }
                        ForEach(items.prefix(4), id: \.id) { TaskRow(t: $0, font: 13) }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetBg()
    }
}

struct BashyPlannerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyPlanner", provider: Provider()) { e in PlannerView(e: e) }
            .configurationDisplayName("일정 · 할 일")
            .description("이번 달 달력과 할 일. 동그라미를 누르면 완료, + 를 누르면 바로 새 할 일을 적습니다.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// ── AI 남은 사용량 ──────────────────────────
struct AIBar: View {
    let label: String; let v: Int?
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.system(size: 10)).foregroundColor(sub)
                Spacer()
                Text(v.map { "\($0)%" } ?? "–").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(fg)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.1))
                    Capsule().fill(pctColor(v)).frame(width: g.size.width * CGFloat(max(0, min(100, v ?? 0))) / 100)
                }
            }.frame(height: 4)
        }
    }
}

struct AIView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let ai = e.snap?.ai ?? []
        let reset = ai.first(where: { isoDate($0.r) != nil })
        VStack(alignment: .leading, spacing: 0) {
            WHead(title: "AI 남은 양")
            Spacer(minLength: 6)
            if ai.isEmpty {
                Text("설정 › AI › 사용량에서 연결하면 보입니다").font(.system(size: 12)).foregroundColor(sub).lineLimit(3)
            } else if family == .systemSmall {
                HStack(spacing: 4) {
                    ForEach(Array(ai.prefix(3).enumerated()), id: \.offset) { _, a in
                        VStack(spacing: 4) {
                            ZStack {
                                Ring(frac: Double(a.d7 ?? a.left ?? 0) / 100, color: pctColor(a.d7 ?? a.left), width: 4.5).frame(width: 40, height: 40)
                                if let h = a.h5 { Ring(frac: Double(h) / 100, color: pctColor(h), width: 4.5).frame(width: 25, height: 25) }
                            }
                            Text("\(a.h5 ?? a.left ?? 0)%").font(.system(size: 14, weight: .semibold, design: .rounded)).foregroundColor(fg).minimumScaleFactor(0.7)
                            Text(a.n).font(.system(size: 10)).foregroundColor(sub).lineLimit(1)
                        }.frame(maxWidth: .infinity)
                    }
                }
                Spacer(minLength: 4)
                if let r = reset, let d = isoDate(r.r) {
                    HStack(spacing: 3) {
                        Text("\(r.n) 5시간").font(.system(size: 11)).foregroundColor(sub)
                        Text(d, style: .time).font(.system(size: 11, weight: .semibold)).foregroundColor(accent)
                    }.lineLimit(1)
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(Array(ai.prefix(3).enumerated()), id: \.offset) { _, a in
                        HStack(spacing: 12) {
                            Text(a.n).font(.system(size: 13, weight: .semibold)).foregroundColor(fg).frame(width: 52, alignment: .leading)
                            if a.k == "higgsfield" { AIBar(label: "크레딧", v: a.left) }
                            else { AIBar(label: "5시간", v: a.h5); AIBar(label: "7일", v: a.d7) }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "bashy://ai"))
        .widgetBg()
    }
}

struct BashyAIWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyAI", provider: Provider()) { e in AIView(e: e) }
            .configurationDisplayName("AI 사용량")
            .description("Claude · ChatGPT · Higgsfield 남은 양. 바깥 고리 7일, 안쪽 고리 5시간.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 칼로리 · 운동 ───────────────────────────
struct MacroBar: View {
    let label: String; let v: Int; let goal: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2) {
                Text(label).font(.system(size: 10)).foregroundColor(sub)
                Spacer()
                Text("\(v)").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(fg)
                Text("/\(goal)g").font(.system(size: 10)).foregroundColor(sub)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.1))
                    Capsule().fill(fg.opacity(0.85)).frame(width: g.size.width * CGFloat(goal > 0 ? min(1, Double(v) / Double(goal)) : 0))
                }
            }.frame(height: 3)
        }
    }
}

struct BodyView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = e.snap
        let fresh = s?.isToday == true
        let b = fresh ? s?.body : nil
        let left = (b?.goal ?? 0) - (b?.eat ?? 0)
        let frac = (b?.goal ?? 0) > 0 ? Double(b!.eat) / Double(b!.goal) : 0
        Group {
            if family == .accessoryCircular {
                Gauge(value: min(1, frac)) { Text("kcal") } currentValueLabel: { Text(b != nil ? "\(max(0, left))" : "–").font(.system(size: 12, weight: .semibold, design: .rounded)).minimumScaleFactor(0.5) }
                    .gaugeStyle(.accessoryCircular)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WHead(title: "칼로리 · 운동")
                    if b == nil { Spacer(); StaleNote() }
                    else {
                        HStack(alignment: .center, spacing: 14) {
                            ZStack {
                                Ring(frac: frac, color: left < 0 ? upRed : accent, width: family == .systemSmall ? 7 : 8)
                                VStack(spacing: 0) {
                                    Text(comma(abs(left))).font(.system(size: family == .systemSmall ? 18 : 20, weight: .semibold, design: .rounded)).foregroundColor(fg).minimumScaleFactor(0.6).lineLimit(1)
                                    Text(left < 0 ? "초과" : "남음").font(.system(size: 10)).foregroundColor(sub)
                                }.padding(.horizontal, 8)
                            }
                            .frame(width: family == .systemSmall ? 76 : 92, height: family == .systemSmall ? 76 : 92)
                            if family == .systemMedium {
                                VStack(alignment: .leading, spacing: 7) {
                                    MacroBar(label: "단백질", v: b?.p ?? 0, goal: b?.pg ?? 0)
                                    MacroBar(label: "탄수화물", v: b?.c ?? 0, goal: b?.cg ?? 0)
                                    MacroBar(label: "지방", v: b?.f ?? 0, goal: b?.fg ?? 0)
                                }
                            }
                        }.padding(.top, 8)
                        Spacer(minLength: 4)
                        HStack(spacing: 6) {
                            Image(systemName: "dumbbell").font(.system(size: 11)).foregroundColor(sub)
                            Text((b?.part ?? "").isEmpty ? ((b?.total ?? 0) > 0 ? "운동" : "휴식일") : (b?.part ?? "")).font(.system(size: 12, weight: .semibold)).foregroundColor(fg).lineLimit(1)
                            if (b?.total ?? 0) > 0 { Text("\(b?.done ?? 0)/\(b?.total ?? 0)").font(.system(size: 12, design: .rounded)).foregroundColor(sub) }
                            Spacer(minLength: 0)
                            if family == .systemMedium, (b?.vol ?? 0) > 0 { Text("\(comma(b?.vol ?? 0))kg").font(.system(size: 12, design: .rounded)).foregroundColor(sub) }
                            if (b?.burn ?? 0) > 0 { Text("−\(comma(b?.burn ?? 0))").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(accent) }
                        }.lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetURL(URL(string: "bashy://open/diet"))
        .widgetBg()
    }
}

struct BashyBodyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyBody", provider: Provider()) { e in BodyView(e: e) }
            .configurationDisplayName("칼로리 · 운동")
            .description("남은 열량, 단·탄·지, 오늘 운동 부위와 진행.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

// ── 습관 · 체크리스트 ───────────────────────
struct HabitButton: View {
    let h: Snap.HabitItem; let day: String; let font: CGFloat
    var body: some View {
        Button(intent: HabitToggleIntent(id: h.id, day: day, ok: !h.ok)) {
            HStack(spacing: 6) {
                Image(systemName: h.ok ? "checkmark.circle.fill" : "circle").font(.system(size: font + 2)).foregroundColor(h.ok ? accent : sub)
                Text(h.n).font(.system(size: font)).foregroundColor(h.ok ? sub : fg).strikethrough(h.ok, color: sub).lineLimit(1)
                Spacer(minLength: 0)
            }
        }.buttonStyle(.plain)
    }
}

struct HabitsView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = e.snap
        let fresh = s?.isToday == true
        let items = fresh ? (s?.habits?.items ?? []) : []
        let day = s?.day ?? ""
        let ck = s?.check
        Group {
            if family == .accessoryCircular {
                Gauge(value: Double(s?.habits?.done ?? 0), in: 0...Double(max(1, s?.habits?.total ?? 1))) { Text("습관") } currentValueLabel: { Text(fresh ? "\(s?.habits?.done ?? 0)" : "–") }
                    .gaugeStyle(.accessoryCircularCapacity)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WHead(title: "습관", trailing: fresh ? s?.habitNum : nil)
                    if !fresh { Spacer(); StaleNote() }
                    else if family == .systemSmall {
                        Spacer(minLength: 6)
                        VStack(alignment: .leading, spacing: 7) {
                            ForEach(items.prefix(4), id: \.id) { HabitButton(h: $0, day: day, font: 13) }
                        }
                        Spacer(minLength: 0)
                    } else {
                        Spacer(minLength: 8)
                        let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
                        LazyVGrid(columns: cols, alignment: .leading, spacing: 8) {
                            ForEach(items.prefix(family == .systemLarge ? 14 : 6), id: \.id) { HabitButton(h: $0, day: day, font: 13) }
                        }
                        Spacer(minLength: 4)
                        if let c = ck, c.total > 0 {
                            HStack(spacing: 6) {
                                Text("체크리스트").font(.system(size: 12)).foregroundColor(sub)
                                Text("\(c.done)/\(c.total)").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(fg)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .widgetURL(URL(string: "bashy://open/habits"))
        .widgetBg()
    }
}

struct BashyHabitsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyHabits", provider: Provider()) { e in HabitsView(e: e) }
            .configurationDisplayName("습관 · 체크리스트")
            .description("오늘 습관을 위젯에서 바로 체크합니다.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular])
    }
}

// ── 시세 (비트코인 · 즐겨찾기) ───────────────
struct MktRow: View {
    let m: Snap.Mkt; let big: Bool
    var body: some View {
        let c = m.c ?? 0
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(m.n).font(.system(size: big ? 13 : 12)).foregroundColor(sub).lineLimit(1)
            Spacer(minLength: 4)
            Text(m.p).font(.system(size: big ? 15 : 13, weight: .semibold, design: .rounded)).foregroundColor(fg).lineLimit(1).minimumScaleFactor(0.7)
            Text(m.c == nil ? "–" : String(format: "%@%.2f%%", c > 0 ? "+" : "", c)).font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(c > 0 ? upRed : (c < 0 ? downBlue : sub)).frame(width: 60, alignment: .trailing)
        }
    }
}

struct MarketView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let mk = e.snap?.mkt ?? []
        VStack(alignment: .leading, spacing: 0) {
            WHead(title: "시세")
            if mk.isEmpty { Spacer(); Text("경제 카드에서 즐겨찾기를 담으면 보입니다").font(.system(size: 12)).foregroundColor(sub).lineLimit(3) }
            else if family == .systemSmall {
                let f = mk[0]
                Spacer(minLength: 4)
                Text(f.n).font(.system(size: 12)).foregroundColor(sub)
                Text(f.p).font(.system(size: 22, weight: .semibold, design: .rounded)).foregroundColor(fg).minimumScaleFactor(0.5).lineLimit(1)
                Text(f.c == nil ? "–" : String(format: "%@%.2f%%", (f.c ?? 0) > 0 ? "+" : "", f.c ?? 0)).font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor((f.c ?? 0) > 0 ? upRed : ((f.c ?? 0) < 0 ? downBlue : sub))
                Spacer(minLength: 4)
                ForEach(Array(mk.dropFirst().prefix(2).enumerated()), id: \.offset) { _, m in
                    HStack {
                        Text(m.n).font(.system(size: 11)).foregroundColor(sub).lineLimit(1)
                        Spacer(minLength: 2)
                        Text(m.c == nil ? "–" : String(format: "%@%.1f%%", (m.c ?? 0) > 0 ? "+" : "", m.c ?? 0)).font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundColor((m.c ?? 0) > 0 ? upRed : ((m.c ?? 0) < 0 ? downBlue : sub))
                    }
                }
            } else {
                Spacer(minLength: 8)
                VStack(spacing: 9) {
                    ForEach(Array(mk.prefix(4).enumerated()), id: \.offset) { i, m in MktRow(m: m, big: i == 0) }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "bashy://open/econ"))
        .widgetBg()
    }
}

struct BashyMarketWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyMarket", provider: Provider()) { e in MarketView(e: e) }
            .configurationDisplayName("시세")
            .description("비트코인과 경제 카드 즐겨찾기 종목. 앱을 연 때의 값입니다.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 잠금 화면 ───────────────────────────────
struct LockView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = e.snap
        let fresh = s?.isToday == true
        let tasks = fresh ? (s?.tasks?.count ?? 0) : 0
        Group {
            switch family {
            case .accessoryInline:
                if let w = s?.wx {
                    Label("\(w.t)° · 할 일 \(tasks)", systemImage: sfName(w.icon))
                } else {
                    Text("할 일 \(tasks) · 습관 \(s?.habitNum ?? "–")")
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    if let ev = s?.evs?.first {
                        Text(ev.w).font(.system(size: 12, weight: .semibold))
                        Text(ev.t).font(.system(size: 14)).lineLimit(1)
                    } else {
                        Text("다가오는 일정 없음").font(.system(size: 13))
                    }
                    Text("할 일 \(tasks) · 습관 \(fresh ? (s?.habitNum ?? "–") : "–")").font(.system(size: 12)).foregroundColor(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            default:
                Gauge(value: Double(s?.habits?.done ?? 0), in: 0...Double(max(1, s?.habits?.total ?? 1))) { Text("습관") } currentValueLabel: { Text(fresh ? "\(s?.habits?.done ?? 0)" : "–") }
                    .gaugeStyle(.accessoryCircularCapacity)
            }
        }
        .widgetURL(URL(string: "bashy://open/calendar"))
        .widgetBg()
    }
}

struct BashyLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BashyLock", provider: Provider()) { e in LockView(e: e) }
            .configurationDisplayName("Bashy 잠금 화면")
            .description("날씨·할 일 한 줄, 다음 일정, 습관 고리.")
            .supportedFamilies([.accessoryInline, .accessoryRectangular, .accessoryCircular])
    }
}

// ── 위젯에서 바로 누르는 동작 (iOS 17+) ─────────────
// 위젯은 로그인 정보가 없어 직접 저장하지 못한다. 할 일을 App Group 의 'pending' 에 적어 두고
// 화면에 보이는 요약만 바로 고쳐 그린다. 앱이 열리면(BashyIntentStore.drain) 실제로 저장한다.
enum WStore {
    static var d: UserDefaults? { UserDefaults(suiteName: bashyGroup) }
    static func pend(_ item: [String: String]) {
        var l = d?.array(forKey: "pending") as? [[String: String]] ?? []
        l.append(item)
        d?.set(Array(l.suffix(40)), forKey: "pending")
    }
    static func edit(_ f: (inout [String: Any]) -> Void) {
        guard let s = d?.string(forKey: "today"), let data = s.data(using: .utf8),
              var obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        f(&obj)
        if let out = try? JSONSerialization.data(withJSONObject: obj), let str = String(data: out, encoding: .utf8) { d?.set(str, forKey: "today") }
    }
}

struct TaskDoneIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 완료"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "할 일") var id: String
    @Parameter(title: "목록") var list: String
    init() { id = ""; list = "" }
    init(id: String, list: String) { self.id = id; self.list = list }
    func perform() async throws -> some IntentResult {
        WStore.pend(["action": "taskDone", "id": id, "list": list])
        WStore.edit { o in
            guard var t = o["tasks"] as? [String: Any] else { return }
            if var items = t["items"] as? [[String: Any]] {
                items.removeAll { ($0["id"] as? String) == id }
                t["items"] = items
            }
            if let c = t["count"] as? Int { t["count"] = max(0, c - 1) }
            o["tasks"] = t
        }
        return .result()
    }
}

struct HabitToggleIntent: AppIntent {
    static var title: LocalizedStringResource = "습관 체크"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "습관") var id: String
    @Parameter(title: "날짜") var day: String
    @Parameter(title: "완료") var ok: Bool
    init() { id = ""; day = ""; ok = true }
    init(id: String, day: String, ok: Bool) { self.id = id; self.day = day; self.ok = ok }
    func perform() async throws -> some IntentResult {
        WStore.pend(["action": "habitToggle", "id": id, "day": day, "ok": ok ? "1" : "0"])
        WStore.edit { o in
            guard var h = o["habits"] as? [String: Any], var items = h["items"] as? [[String: Any]] else { return }
            var changed = false
            for i in items.indices where (items[i]["id"] as? String) == id {
                if (items[i]["ok"] as? Bool) != ok { items[i]["ok"] = ok; changed = true }
            }
            h["items"] = items
            if changed { h["done"] = max(0, (h["done"] as? Int ?? 0) + (ok ? 1 : -1)) }
            o["habits"] = h
        }
        return .result()
    }
}
