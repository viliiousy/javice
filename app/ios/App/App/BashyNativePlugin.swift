import Foundation
import Capacitor
import LocalAuthentication

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
    ]

    override public func load() {
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
