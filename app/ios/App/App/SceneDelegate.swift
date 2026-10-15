import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BashyViewController()
        BashyLock.coverIfNeeded(windowScene)
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // Face ID 잠금 — 뒤로 갈 때 가리고, 앞으로 올 때 확인한다.
    func sceneWillResignActive(_ scene: UIScene) {
        if let ws = scene as? UIWindowScene { BashyLock.coverIfNeeded(ws) }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        BashyLock.unlockIfNeeded()
    }
}
