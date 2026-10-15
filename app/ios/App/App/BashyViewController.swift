import UIKit
import Capacitor

// Capacitor 화면에 우리 앱 전용 플러그인(BashyNative)을 붙인다.
class BashyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BashyNativePlugin())
    }
}
