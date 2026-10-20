import Foundation
import Capacitor
import LocalAuthentication
import WidgetKit
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
    ]

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
                    _ = try Activity.request(attributes: WorkoutAttributes(startedAt: started), content: .init(state: st, staleDate: nil), pushType: nil)
                    call.resolve(["ok": true])
                } catch { call.resolve(["ok": false, "error": error.localizedDescription]) }
            }
        } else { call.resolve(["ok": false]) }
    }
    @objc func liveUpdate(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            guard let st = liveState(call) as? WorkoutAttributes.ContentState else { call.resolve(); return }
            Task { for a in Activity<WorkoutAttributes>.activities { await a.update(.init(state: st, staleDate: nil)) }; call.resolve(["ok": true]) }
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
        guard let lib = fm.urls(for: .libraryDirectory, in: .userDomainMask).first,
              let src = Bundle.main.url(forResource: "rest_end", withExtension: "wav", subdirectory: "public/sounds") else { return }
        let dir = lib.appendingPathComponent("Sounds"), dst = dir.appendingPathComponent("rest_end.wav")
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        if !fm.fileExists(atPath: dst.path) { try? fm.copyItem(at: src, to: dst) }
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
