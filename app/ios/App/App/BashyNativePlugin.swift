import Foundation
import Capacitor
import LocalAuthentication
import WidgetKit

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
    ]

    // 홈 화면 위젯이 읽을 '오늘 요약'(JSON). 앱과 위젯이 같이 쓰는 App Group 저장소에 둔다.
    @objc func setWidget(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? "{}"
        UserDefaults(suiteName: "group.app.bashy")?.set(json, forKey: "today")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

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

// ── 애플 홈(HomeKit) ─────────────────────────────────
// 애플 홈은 웹·서버 API 가 없어서 아이폰·아이패드 앱 안에서만 읽고 켤 수 있다. 허브 화면(hub.html)이
// 이 플러그인으로 집·방·기기·장면을 받아 SmartThings·Home Assistant 와 같은 타일로 그린다.
//   list()            → { homes, rooms, items, scenes }   (처음 부를 때 '홈 데이터 접근' 허락 창이 뜬다)
//   set({id,key,value}) → id = 서비스 UUID, key = on|brightness|target|pos|lock|active
//   scene({id})        → 장면 실행
//   'change' 이벤트     → 기기 값이 바뀌면 { id, key, value }
import HomeKit

@objc(BashyHomePlugin)
public class BashyHomePlugin: CAPPlugin, CAPBridgedPlugin, HMHomeManagerDelegate, HMAccessoryDelegate {
    public let identifier = "BashyHomePlugin"
    public let jsName = "BashyHome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scene", returnType: CAPPluginReturnPromise),
    ]
    private var manager: HMHomeManager?
    private var ready = false
    private var waiting: [CAPPluginCall] = []

    private func ensure(_ call: CAPPluginCall) {
        if ready { call.resolve(snapshot()); return }
        waiting.append(call)
        if manager == nil { DispatchQueue.main.async { let m = HMHomeManager(); m.delegate = self; self.manager = m } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self = self, !self.ready else { return }
            let w = self.waiting; self.waiting = []
            w.forEach { $0.reject("애플 홈 응답이 없습니다 — 설정 › 개인정보 보호 › 홈 에서 Bashy 를 허용해 주세요") }
        }
    }

    public func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        ready = true
        for h in manager.homes { for a in h.accessories { a.delegate = self; watch(a) } }
        let snap = snapshot(); let w = waiting; waiting = []
        w.forEach { $0.resolve(snap) }
        notifyListeners("homes", data: [:])
    }

    private func watch(_ a: HMAccessory) {
        for s in a.services { for c in s.characteristics where c.properties.contains(HMCharacteristicPropertySupportsEventNotification) {
            c.enableNotification(true) { _ in }
        } }
    }

    public func accessory(_ accessory: HMAccessory, service: HMService, didUpdateValueFor characteristic: HMCharacteristic) {
        guard let key = Self.keyOf(characteristic.characteristicType) else { return }
        notifyListeners("change", data: ["id": service.uniqueIdentifier.uuidString, "key": key, "value": characteristic.value ?? NSNull()])
    }
    public func accessoryDidUpdateReachability(_ accessory: HMAccessory) { notifyListeners("homes", data: [:]) }

    static func keyOf(_ t: String) -> String? {
        switch t {
        case HMCharacteristicTypePowerState: return "on"
        case HMCharacteristicTypeActive: return "active"
        case HMCharacteristicTypeBrightness: return "brightness"
        case HMCharacteristicTypeCurrentTemperature: return "cur"
        case HMCharacteristicTypeTargetTemperature, HMCharacteristicTypeCoolingThreshold: return "target"
        case HMCharacteristicTypeCurrentRelativeHumidity: return "humidity"
        case HMCharacteristicTypeCurrentPosition: return "pos"
        case HMCharacteristicTypeCurrentLockMechanismState: return "lock"
        case HMCharacteristicTypeContactState: return "contact"
        case HMCharacteristicTypeMotionDetected: return "motion"
        case HMCharacteristicTypeCurrentHeatingCooling, HMCharacteristicTypeCurrentHeaterCoolerState: return "mode"
        default: return nil
        }
    }
    static func kindOf(_ t: String) -> String? {
        switch t {
        case HMServiceTypeLightbulb: return "light"
        case HMServiceTypeSwitch, HMServiceTypeOutlet: return "switch"
        case HMServiceTypeFan: return "fan"
        case HMServiceTypeThermostat, HMServiceTypeHeaterCooler: return "climate"
        case HMServiceTypeAirPurifier, HMServiceTypeHumidifierDehumidifier: return "fan"
        case HMServiceTypeWindowCovering: return "cover"
        case HMServiceTypeLockMechanism: return "lock"
        case HMServiceTypeTemperatureSensor: return "temp"
        case HMServiceTypeHumiditySensor: return "humidity"
        case HMServiceTypeContactSensor: return "contact"
        case HMServiceTypeMotionSensor: return "motion"
        default: return nil
        }
    }

    private func snapshot() -> [String: Any] {
        guard let m = manager else { return ["homes": [], "rooms": [:], "items": [], "scenes": []] }
        var homes: [[String: Any]] = [], rooms: [String: String] = [:], items: [[String: Any]] = [], scenes: [[String: Any]] = []
        for h in m.homes {
            homes.append(["id": h.uniqueIdentifier.uuidString, "name": h.name, "primary": h.isPrimary])
            for r in h.rooms { rooms[r.uniqueIdentifier.uuidString] = r.name }
            for a in h.accessories {
                for s in a.services {
                    guard let kind = Self.kindOf(s.serviceType) else { continue }
                    var v: [String: Any] = [:]
                    for c in s.characteristics { if let k = Self.keyOf(c.characteristicType), let val = c.value { v[k] = val } }
                    let nm = (s.name.isEmpty || a.services.filter({ Self.kindOf($0.serviceType) != nil }).count == 1) ? a.name : s.name
                    items.append(["id": s.uniqueIdentifier.uuidString, "name": nm, "room": a.room?.uniqueIdentifier.uuidString ?? "",
                                  "kind": kind, "reachable": a.isReachable, "v": v, "home": h.name])
                }
                // 화면에 보이는 값이 오래됐을 수 있어 한 번씩 새로 읽는다(바뀌면 'change' 로 온다)
                for s in a.services { for c in s.characteristics where Self.keyOf(c.characteristicType) != nil && c.properties.contains(HMCharacteristicPropertyReadable) {
                    c.readValue { _ in }
                } }
            }
            for a in h.actionSets where a.actionSetType == HMActionSetTypeUserDefined || a.actionSetType == HMActionSetTypeHomeArrival || a.actionSetType == HMActionSetTypeHomeDeparture || a.actionSetType == HMActionSetTypeWakeUp || a.actionSetType == HMActionSetTypeSleep {
                scenes.append(["id": a.uniqueIdentifier.uuidString, "name": a.name])
            }
        }
        return ["homes": homes, "rooms": rooms, "items": items, "scenes": scenes]
    }

    @objc func list(_ call: CAPPluginCall) { DispatchQueue.main.async { self.ensure(call) } }

    private func findService(_ id: String) -> HMService? {
        for h in manager?.homes ?? [] { for a in h.accessories { for s in a.services where s.uniqueIdentifier.uuidString == id { return s } } }
        return nil
    }

    @objc func set(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? "", key = call.getString("key") ?? ""
        DispatchQueue.main.async {
            guard let s = self.findService(id) else { call.reject("기기를 찾지 못했습니다"); return }
            let want: [String]
            switch key {
            case "on": want = [HMCharacteristicTypePowerState, HMCharacteristicTypeActive]
            case "active": want = [HMCharacteristicTypeActive, HMCharacteristicTypePowerState]
            case "brightness": want = [HMCharacteristicTypeBrightness]
            case "target": want = [HMCharacteristicTypeTargetTemperature, HMCharacteristicTypeCoolingThreshold]
            case "pos": want = [HMCharacteristicTypeTargetPosition]
            case "lock": want = [HMCharacteristicTypeTargetLockMechanismState]
            default: want = []
            }
            guard let c = want.compactMap({ t in s.characteristics.first { $0.characteristicType == t } }).first else { call.reject("이 기기에서 지원하지 않는 조작입니다"); return }
            var value: Any = call.getValue("value") ?? NSNull()
            if c.characteristicType == HMCharacteristicTypePowerState { value = (value as? Bool) ?? ((value as? NSNumber)?.boolValue ?? false) }
            else if c.characteristicType == HMCharacteristicTypeActive { let on = (value as? Bool) ?? ((value as? NSNumber)?.boolValue ?? false); value = on ? 1 : 0 }
            c.writeValue(value) { err in
                if let err = err { call.reject(err.localizedDescription) } else { call.resolve(["ok": true]) }
            }
        }
    }

    @objc func scene(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            for h in self.manager?.homes ?? [] {
                if let a = h.actionSets.first(where: { $0.uniqueIdentifier.uuidString == id }) {
                    h.executeActionSet(a) { err in if let err = err { call.reject(err.localizedDescription) } else { call.resolve(["ok": true]) } }
                    return
                }
            }
            call.reject("장면을 찾지 못했습니다")
        }
    }
}
