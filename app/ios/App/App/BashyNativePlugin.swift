import Foundation
import Capacitor
import LocalAuthentication
import WidgetKit
import AVFoundation
import HealthKit
import EventKit
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

// 화면(JS)과 아이폰 기능 사이의 다리.
//   - 시리·단축어에서 들어온 요청(할 일 추가, 오늘 할 일 보기)을 화면에 넘긴다.
//   - Face ID 잠금 켜고 끄기.
@objc(BashyNativePlugin)
public class BashyNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BashyNativePlugin"
    public let jsName = "BashyNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consumePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOrientation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveEnd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restSchedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restCancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "healthWatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calAdd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calDelete", returnType: CAPPluginReturnPromise),
    ]

    // ── 효과음 (쉬는 시간 째깍·끝 알림) ─────────────
    // 웹 소리(Web Audio)는 아이폰 무음 스위치를 켜 두면 안 들린다. 앱이 직접 재생하고,
    // 듣고 있던 음악은 끊지 않고 같이 들리게(mixWithOthers) 한다.
    private var players: [String: AVAudioPlayer] = [:]
    @objc func playSound(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "tick"
        guard ["tick", "rest_end"].contains(name) else { call.reject("unknown sound"); return }
        DispatchQueue.main.async {
            let ses = AVAudioSession.sharedInstance()
            try? ses.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try? ses.setActive(true)
            if self.players[name] == nil, let url = Bundle.main.url(forResource: name, withExtension: "wav", subdirectory: "public/sounds") {
                self.players[name] = try? AVAudioPlayer(contentsOf: url)
                self.players[name]?.prepareToPlay()
            }
            guard let p = self.players[name] else { call.reject("no sound file"); return }
            p.volume = Float(call.getDouble("volume") ?? 1.0)
            p.currentTime = 0
            p.play()
            call.resolve()
        }
    }

    // ── 애플 건강(읽기만) ─────────────
    // 인바디 앱 등이 건강 앱에 넣은 키·체중·체지방률·제지방량·BMI 를 읽어 인바디 기록으로 채운다.
    // 쓰기는 하지 않는다. 처음 부를 때 iOS 가 항목별 허락 창을 띄운다.
    private lazy var health = HKHealthStore()
    @objc func healthRead(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["ok": false, "error": "unavailable"]); return }
        let days = call.getDouble("days") ?? 365
        let kinds: [(String, HKQuantityTypeIdentifier, HKUnit, Double)] = [
            ("wt", .bodyMass, .gramUnit(with: .kilo), 1),
            ("bf", .bodyFatPercentage, .percent(), 100),
            ("lbm", .leanBodyMass, .gramUnit(with: .kilo), 1),
            ("bmi", .bodyMassIndex, .count(), 1),
            ("ht", .height, .meterUnit(with: .centi), 1),
        ]
        var types: Set<HKObjectType> = Set(kinds.compactMap { HKObjectType.quantityType(forIdentifier: $0.1) })
        // 성별·생년월일(처음 설정 도우미가 칼로리 계산에 쓴다)
        if let sx = HKObjectType.characteristicType(forIdentifier: .biologicalSex) { types.insert(sx) }
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) { types.insert(dob) }
        health.requestAuthorization(toShare: nil, read: types) { ok, err in
            guard ok else { call.resolve(["ok": false, "error": err?.localizedDescription ?? "denied"]); return }
            let since = Date().addingTimeInterval(-days * 86400)
            let group = DispatchGroup()
            var out: [String: Any] = [:]
            let lock = NSLock()
            for (key, id, unit, mul) in kinds {
                guard let t = HKQuantityType.quantityType(forIdentifier: id) else { continue }
                group.enter()
                // 키는 기간과 상관없이 가장 최근 한 건, 나머지는 기간 안의 전부
                let pred = key == "ht" ? nil : HKQuery.predicateForSamples(withStart: since, end: nil)
                let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: key != "ht")
                let q = HKSampleQuery(sampleType: t, predicate: pred, limit: key == "ht" ? 1 : 2000, sortDescriptors: [sort]) { _, samples, _ in
                    let rows: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map {
                        ["t": $0.startDate.timeIntervalSince1970 * 1000, "v": $0.quantity.doubleValue(for: unit) * mul, "src": $0.sourceRevision.source.name]
                    }
                    lock.lock(); out[key] = rows; lock.unlock()
                    group.leave()
                }
                self.health.execute(q)
            }
            group.notify(queue: .main) {
                var me: [String: Any] = [:]
                if let sx = try? self.health.biologicalSex().biologicalSex { me["sex"] = sx == .male ? "m" : sx == .female ? "f" : "" }
                if let dob = try? self.health.dateOfBirthComponents(), let y = dob.year {
                    me["birthYear"] = y
                    if let d = Calendar.current.date(from: dob) { me["age"] = Calendar.current.dateComponents([.year], from: d, to: Date()).year ?? 0 }
                }
                call.resolve(["ok": true, "data": out, "me": me])
            }
        }
    }

    // 건강 앱에 새 체성분이 들어오면 앱이 꺼져 있어도 알림 (BashyHealthWatch)
    @objc func healthWatch(_ call: CAPPluginCall) {
        if call.getBool("on") ?? true { BashyHealthWatch.enabled = true; BashyHealthWatch.startIfEnabled() }
        else { BashyHealthWatch.stop() }
        call.resolve(["ok": true])
    }

    // ── 아이폰 캘린더(EventKit) ─────────────
    // 아이폰 설정에 넣어 둔 계정(iCloud·네이버·아웃룩·구글 등)의 캘린더를 그대로 읽고, 고른 캘린더에 일정을 넣고 지운다.
    // 반복 일정은 events(matching:) 가 회차별로 펼쳐 준다 — 회차는 eventIdentifier + 시작 시각으로 구별한다.
    private lazy var ekStore = EKEventStore()
    private func calStatus() -> String {
        let st = EKEventStore.authorizationStatus(for: .event)
        switch st {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        default: break
        }
        if #available(iOS 17.0, *) {
            if st == .fullAccess { return "granted" }
            if st == .writeOnly { return "writeOnly" }
        }
        if st == .authorized { return "granted" }
        return "unknown"
    }
    private func calHex(_ cg: CGColor?) -> String {
        guard let cg = cg else { return "#8E8E93" }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(cgColor: cg).getRed(&r, green: &g, blue: &b, alpha: &a) else { return "#8E8E93" }
        let c = { (v: CGFloat) -> Int in Int((min(1, max(0, v)) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", c(r), c(g), c(b))
    }
    @objc func calAccess(_ call: CAPPluginCall) {
        let cur = calStatus()
        if cur == "granted" { call.resolve(["granted": true, "status": cur]); return }
        if cur == "denied" || cur == "restricted" { call.resolve(["granted": false, "status": cur]); return }
        let done: (Bool, Error?) -> Void = { ok, err in
            DispatchQueue.main.async {
                if ok { self.ekStore = EKEventStore() }   // 허락 전에 만든 저장소는 캘린더 목록이 비어 보일 수 있다
                call.resolve(["granted": ok && self.calStatus() == "granted", "status": self.calStatus(), "error": err?.localizedDescription ?? ""])
            }
        }
        if #available(iOS 17.0, *) { ekStore.requestFullAccessToEvents(completion: done) }
        else { ekStore.requestAccess(to: .event, completion: done) }
    }
    @objc func calList(_ call: CAPPluginCall) {
        guard calStatus() == "granted" else { call.resolve(["ok": false, "status": calStatus(), "calendars": [] as [Any]]); return }
        let def = ekStore.defaultCalendarForNewEvents?.calendarIdentifier ?? ""
        let cals: [[String: Any]] = ekStore.calendars(for: .event).map { (c: EKCalendar) -> [String: Any] in
            [
                "id": c.calendarIdentifier,
                "title": c.title,
                "color": calHex(c.cgColor),
                "allowsModify": c.allowsContentModifications,
                "source": c.source?.title ?? "",
                "isDefault": c.calendarIdentifier == def,
            ]
        }
        call.resolve(["ok": true, "status": "granted", "calendars": cals])
    }
    @objc func calEvents(_ call: CAPPluginCall) {
        guard calStatus() == "granted" else { call.resolve(["ok": false, "status": calStatus(), "events": [] as [Any]]); return }
        let nowMs = Date().timeIntervalSince1970 * 1000
        let from = Date(timeIntervalSince1970: (call.getDouble("from") ?? (nowMs - 30 * 86400000)) / 1000)
        let to = Date(timeIntervalSince1970: (call.getDouble("to") ?? (nowMs + 90 * 86400000)) / 1000)
        let ids = call.getArray("ids", String.self)
        let store = ekStore
        DispatchQueue.global(qos: .userInitiated).async {
            var cals = store.calendars(for: .event)
            if let ids = ids { let want = Set(ids); cals = cals.filter { want.contains($0.calendarIdentifier) } }
            guard !cals.isEmpty, to > from else { DispatchQueue.main.async { call.resolve(["ok": true, "events": [] as [Any]]) }; return }
            let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals)
            let rows: [[String: Any]] = store.events(matching: pred).prefix(3000).map { (e: EKEvent) -> [String: Any] in
                let s = e.startDate ?? Date(), en = e.endDate ?? s
                return [
                    "id": e.eventIdentifier ?? "",
                    "calendarId": e.calendar?.calendarIdentifier ?? "",
                    "calendarTitle": e.calendar?.title ?? "",
                    "color": self.calHex(e.calendar?.cgColor),
                    "title": e.title ?? "",
                    "start": s.timeIntervalSince1970 * 1000,
                    "end": en.timeIntervalSince1970 * 1000,
                    "allDay": e.isAllDay,
                    "location": e.location ?? "",
                    "notes": String((e.notes ?? "").prefix(2000)),
                    "recurring": e.hasRecurrenceRules,
                ]
            }
            DispatchQueue.main.async { call.resolve(["ok": true, "events": rows]) }
        }
    }
    @objc func calAdd(_ call: CAPPluginCall) {
        guard calStatus() == "granted" else { call.reject("캘린더 접근이 허락되지 않았습니다"); return }
        guard let title = call.getString("title"), !title.isEmpty, let sMs = call.getDouble("start"), let eMs = call.getDouble("end") else { call.reject("제목과 시간이 필요합니다"); return }
        let ev = EKEvent(eventStore: ekStore)
        ev.title = title
        ev.startDate = Date(timeIntervalSince1970: sMs / 1000)
        ev.endDate = Date(timeIntervalSince1970: max(sMs, eMs) / 1000)
        ev.isAllDay = call.getBool("allDay") ?? false
        if let l = call.getString("location"), !l.isEmpty { ev.location = l }
        if let n = call.getString("notes"), !n.isEmpty { ev.notes = n }
        let cal = call.getString("calendarId").flatMap { ekStore.calendar(withIdentifier: $0) } ?? ekStore.defaultCalendarForNewEvents
        guard let target = cal, target.allowsContentModifications else { call.reject("이 캘린더에는 일정을 넣을 수 없습니다"); return }
        ev.calendar = target
        do {
            try ekStore.save(ev, span: .thisEvent, commit: true)
            call.resolve(["ok": true, "id": ev.eventIdentifier ?? "", "calendarId": target.calendarIdentifier])
        } catch { call.reject(error.localizedDescription) }
    }
    @objc func calDelete(_ call: CAPPluginCall) {
        guard calStatus() == "granted" else { call.reject("캘린더 접근이 허락되지 않았습니다"); return }
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("일정 id 가 없습니다"); return }
        var target: EKEvent? = nil
        // 반복 일정은 같은 id 를 여러 회차가 같이 쓴다 — 시작 시각으로 그 회차를 찾는다
        if let sMs = call.getDouble("start"), let first = ekStore.event(withIdentifier: id), let cal = first.calendar {
            let s = Date(timeIntervalSince1970: sMs / 1000)
            let pred = ekStore.predicateForEvents(withStart: s.addingTimeInterval(-86400), end: s.addingTimeInterval(86400), calendars: [cal])
            target = ekStore.events(matching: pred).first(where: { (x: EKEvent) -> Bool in x.eventIdentifier == id && abs((x.startDate ?? .distantPast).timeIntervalSince(s)) < 1 })
        }
        if target == nil { target = ekStore.event(withIdentifier: id) }
        guard let ev = target else { call.reject("일정을 찾지 못했습니다"); return }
        guard ev.calendar?.allowsContentModifications ?? false else { call.reject("이 캘린더의 일정은 지울 수 없습니다"); return }
        do {
            try ekStore.remove(ev, span: (call.getBool("all") ?? false) ? .futureEvents : .thisEvent, commit: true)
            call.resolve(["ok": true])
        } catch { call.reject(error.localizedDescription) }
    }

    // ── 쉬는 시간 타이머(앱을 내려 둬도) ─────────────
    // 끝나는 시각에 맞춰 '3초 째깍 + 끝 알림음'(rest_count.wav)을 오디오 엔진에 예약해 둔다.
    // 엔진이 도는 동안(무음 출력 포함) 앱이 깨어 있어서 알림 없이 소리만 정확히 나고,
    // 끝나는 순간 잠금 화면·다이내믹 아일랜드를 흰 운동 시간으로 직접 바꾼다.
    private var restEngine: AVAudioEngine?
    private var restWork: DispatchWorkItem?
    @objc func restSchedule(_ call: CAPPluginCall) {
        let endMs = call.getDouble("endAt") ?? 0, sound = call.getBool("sound") ?? true
        DispatchQueue.main.async {
            self.stopRest()
            let delay = Date(timeIntervalSince1970: endMs / 1000).timeIntervalSinceNow
            guard delay > 0.3 else { call.resolve(["ok": false]); return }
            let ses = AVAudioSession.sharedInstance()
            try? ses.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try? ses.setActive(true)
            let eng = AVAudioEngine(), node = AVAudioPlayerNode()
            guard let url = Bundle.main.url(forResource: "rest_count", withExtension: "wav", subdirectory: "public/sounds"),
                  let file = try? AVAudioFile(forReading: url) else { call.resolve(["ok": false]); return }
            eng.attach(node)
            eng.connect(node, to: eng.mainMixerNode, format: file.processingFormat)
            do { try eng.start() } catch { call.resolve(["ok": false, "error": error.localizedDescription]); return }
            let rate = file.processingFormat.sampleRate, lead = 3.0
            if delay >= lead {
                let at = AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: delay - lead))
                node.scheduleFile(file, at: at, completionHandler: nil)
            } else {
                let skip = AVAudioFramePosition((lead - delay) * rate)
                node.scheduleSegment(file, startingFrame: skip, frameCount: AVAudioFrameCount(max(0, file.length - skip)), at: nil, completionHandler: nil)
            }
            node.volume = sound ? 1 : 0
            node.play()
            self.restEngine = eng
            let work = DispatchWorkItem { [weak self] in
                self?.liveRestEnded()
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) { if self?.restEngine === eng { self?.stopRest() } }
            }
            self.restWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
            call.resolve(["ok": true])
        }
    }
    @objc func restCancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.stopRest(); call.resolve() }
    }
    private func stopRest() {
        restWork?.cancel(); restWork = nil
        restEngine?.stop(); restEngine = nil
    }
    private func liveRestEnded() {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                for a in Activity<WorkoutAttributes>.activities {
                    var st = a.content.state; st.restEnd = nil
                    await a.update(.init(state: st, staleDate: nil))
                }
            }
        }
        #endif
    }

    // ── 운동 중 잠금 화면 표시(라이브 액티비티) ─────────────
    // 앱이 백그라운드여도 잠금 화면·다이내믹 아일랜드에 지금 운동과 쉬는 시간 카운트다운이 보인다.
    // 카운트다운은 시스템이 그려서 앱이 잠들어 있어도 1초씩 줄어든다.
    private func liveState(_ call: CAPPluginCall) -> Any? {
        if #available(iOS 16.2, *) {
            let rest = call.getDouble("restEnd").map { Date(timeIntervalSince1970: $0 / 1000) }
            return WorkoutAttributes.ContentState(title: call.getString("title") ?? "운동 중", sub: call.getString("sub") ?? "",
                                                  restEnd: (rest ?? .distantPast) > Date() ? rest : nil, step: call.getString("step") ?? "")
        }
        return nil
    }
    @objc func liveStart(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled, let st = liveState(call) as? WorkoutAttributes.ContentState else { call.resolve(["ok": false]); return }
            Task {
                for a in Activity<WorkoutAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
                let started = Date(timeIntervalSince1970: (call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000) / 1000)
                do {
                    _ = try Activity.request(attributes: WorkoutAttributes(startedAt: started), content: .init(state: st, staleDate: st.restEnd), pushType: nil)
                    call.resolve(["ok": true])
                } catch { call.resolve(["ok": false, "error": error.localizedDescription]) }
            }
        } else { call.resolve(["ok": false]) }
    }
    @objc func liveUpdate(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            guard let st = liveState(call) as? WorkoutAttributes.ContentState else { call.resolve(); return }
            Task { for a in Activity<WorkoutAttributes>.activities { await a.update(.init(state: st, staleDate: st.restEnd)) }; call.resolve(["ok": true]) }
        } else { call.resolve(["ok": false]) }
    }
    @objc func liveEnd(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            Task { for a in Activity<WorkoutAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }; call.resolve(["ok": true]) }
        } else { call.resolve(["ok": false]) }
    }

    // 알림 소리(쉬는 시간 끝)는 Library/Sounds 에 있어야 iOS 가 찾는다. 앱 화면 파일(public/sounds)에서 한 번 복사해 둔다.
    private func installSounds() {
        let fm = FileManager.default
        guard let lib = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        let dir = lib.appendingPathComponent("Sounds")
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        // rest_count: 3초 째깍 + 끝 알림음 — 앱이 잠들어 있어도 알림 하나로 카운트다운까지 들린다
        for name in ["rest_end", "rest_count"] {
            guard let src = Bundle.main.url(forResource: name, withExtension: "wav", subdirectory: "public/sounds") else { continue }
            let dst = dir.appendingPathComponent(name + ".wav")
            try? fm.removeItem(at: dst)
            try? fm.copyItem(at: src, to: dst)
        }
    }

    // 허브 모드: 가로(양쪽 다 허용) / 그 밖: 세로. 휴대폰을 옆으로 눕힌 방향 그대로 돌아가게 둘 다 연다.
    @objc func setOrientation(_ call: CAPPluginCall) {
        let land = call.getString("mode") == "landscape"
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? CAPBridgeViewController else { call.reject("no view"); return }
            vc.supportedOrientations = land
                ? [UIInterfaceOrientation.landscapeRight.rawValue, UIInterfaceOrientation.landscapeLeft.rawValue]
                : [UIInterfaceOrientation.portrait.rawValue]
            let mask: UIInterfaceOrientationMask = land ? .landscape : .portrait
            if #available(iOS 16.0, *) {
                vc.setNeedsUpdateOfSupportedInterfaceOrientations()
                if let scene = vc.view.window?.windowScene ?? (UIApplication.shared.connectedScenes.first as? UIWindowScene) {
                    scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
                }
            } else {
                UIDevice.current.setValue((land ? UIInterfaceOrientation.landscapeRight : .portrait).rawValue, forKey: "orientation")
                UINavigationController.attemptRotationToDeviceOrientation()
            }
            call.resolve(["mode": land ? "landscape" : "portrait"])
        }
    }

    // 홈 화면 위젯이 읽을 '오늘 요약'(JSON). 앱과 위젯이 같이 쓰는 App Group 저장소에 둔다.
    @objc func setWidget(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        UserDefaults(suiteName: "group.app.bashy")?.set(json, forKey: "today")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    override public func load() {
        installSounds()
        NotificationCenter.default.addObserver(self, selector: #selector(onIntent), name: BashyIntentStore.didChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onWorkoutAction(_:)), name: Notification.Name("BashyWorkoutAction"), object: nil)
    }

    // 잠금 화면·워치 단추 → 화면(JS)의 운동 모드로. 화면이 아직 준비 전이면 붙을 때까지 들고 있는다.
    @objc func onWorkoutAction(_ n: Notification) {
        let act = (n.userInfo?["act"] as? String) ?? ""
        DispatchQueue.main.async {
            if act == "skip" { self.stopRest(); self.liveRestEnded() }   // 화면이 늦게 깨어나도 소리·표시는 바로 멈춘다
            self.notifyListeners("workoutAction", data: ["act": act], retainUntilConsumed: true)
        }
    }

    @objc func onIntent() {
        notifyListeners("intent", data: [:])
    }

    // 시리·단축어가 남겨 둔 요청을 꺼낸다(꺼내면 지워진다).
    @objc func consumePending(_ call: CAPPluginCall) {
        let items = BashyIntentStore.drain()
        call.resolve(["items": items])
    }

    @objc func getAppLock(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let can = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
        call.resolve([
            "enabled": BashyLock.enabled,
            "available": can,
            "kind": ctx.biometryType == .faceID ? "faceid" : (ctx.biometryType == .touchID ? "touchid" : "passcode"),
        ])
    }

    // 켤 때는 본인 확인을 한 번 받는다 — 남이 몰래 켜서 주인을 잠가 버리지 않게.
    @objc func setAppLock(_ call: CAPPluginCall) {
        let on = call.getBool("enabled") ?? false
        if !on { BashyLock.enabled = false; call.resolve(["enabled": false]); return }
        let ctx = LAContext()
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Bashy 잠금을 켭니다") { ok, error in
            DispatchQueue.main.async {
                if ok { BashyLock.enabled = true; call.resolve(["enabled": true]) }
                else { call.reject(error?.localizedDescription ?? "본인 확인에 실패했습니다") }
            }
        }
    }
}


// 운동 라이브 액티비티 — 위젯 쪽(BashyWidget.swift)에도 똑같은 정의가 있어야 한다(이름·모양이 같아야 서로 알아본다)
#if canImport(ActivityKit)
@available(iOS 16.1, *)
struct WorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var sub: String
        var restEnd: Date?
        var step: String
    }
    var startedAt: Date
}
#endif

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
