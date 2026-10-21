import UIKit
import LocalAuthentication

// Face ID(또는 암호) 잠금. 켜 두면 앱이 앞으로 나올 때마다 화면을 가리고 본인 확인을 받는다.
// 가림막은 앱 위에 띄우는 별도 창이라, 확인 전에는 할 일·식단·인바디 같은 내용이 보이지 않는다.
enum BashyLock {
    private static let key = "bashy.appLock"
    static var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    private static var cover: UIWindow?
    private static var checking = false
    // 본인 확인 창을 취소하면 앱이 다시 '활성' 이 되면서 곧바로 또 묻는 일이 생길 수 있다.
    // 실패 직후 잠깐은 자동으로 다시 묻지 않고, 가림막을 누를 때(retry) 다시 묻는다.
    private static var lastFail: Date?

    // 앱이 뒤로 갈 때: 가림막부터 덮는다(앱 전환 화면 미리보기에도 내용이 안 보이게).
    static func coverIfNeeded(_ scene: UIWindowScene) {
        guard enabled, cover == nil else { return }
        let w = UIWindow(windowScene: scene)
        w.windowLevel = .alert + 1
        let vc = UIViewController()
        vc.view.backgroundColor = .systemBackground
        let label = UILabel()
        label.text = "Bashy"
        label.font = .systemFont(ofSize: 28, weight: .bold)
        label.textColor = .label
        label.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(label)
        NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
                                     label.centerYAnchor.constraint(equalTo: vc.view.centerYAnchor)])
        let tap = UITapGestureRecognizer(target: LockTap.shared, action: #selector(LockTap.retry))
        vc.view.addGestureRecognizer(tap)
        w.rootViewController = vc
        w.makeKeyAndVisible()
        cover = w
    }

    // 앱이 앞으로 왔을 때: 본인 확인 → 통과하면 가림막을 걷는다. 실패하면 가림막을 두고, 누르면 다시 시도.
    static func unlockIfNeeded(force: Bool = false) {
        guard enabled, cover != nil, !checking else { return }
        if !force, let f = lastFail, Date().timeIntervalSince(f) < 1.5 { return }
        checking = true
        let ctx = LAContext()
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Bashy 를 엽니다") { ok, _ in
            DispatchQueue.main.async {
                checking = false
                lastFail = ok ? nil : Date()
                if ok {
                    let scene = cover?.windowScene
                    cover?.isHidden = true; cover = nil
                    // 가림막을 걷은 뒤 앱 화면을 다시 주 창으로 — 화면 방향·키보드가 앱 화면을 따르게
                    scene?.windows.first(where: { $0.rootViewController is UIViewController && $0.windowLevel == .normal })?.makeKeyAndVisible()
                }
            }
        }
    }
}

final class LockTap: NSObject {
    static let shared = LockTap()
    @objc func retry() { BashyLock.unlockIfNeeded(force: true) }
}
