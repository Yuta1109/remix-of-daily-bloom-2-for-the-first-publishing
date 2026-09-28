import Foundation
import Capacitor
import SwiftUI
import UIKit
import WebKit

/// Draws shared Liquid Glass controls above the Capacitor WKWebView.
///
/// The web page still owns layout, copy, and actions. React measures each
/// opted-in control and sends its frame. This overlay places a system glass
/// view on that frame and, on tap, asks JavaScript to run the existing handler.
/// Points outside those frames fall through to the page.
///
/// JS name: `NativeGlass`.
@objc(NativeGlassPlugin)
public class NativeGlassPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeGlassPlugin"
    public let jsName = "NativeGlass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    /// iOS 26 mount. Kept as AnyObject so this class can load on iOS 17.2.
    private var glassMount: AnyObject?

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve(["applied": false, "count": 0])
            return
        }
        guard let payload = call.getString("payload"), let data = payload.data(using: .utf8) else {
            call.reject("Missing payload")
            return
        }
        let envelope: NativeGlassEnvelope
        do {
            envelope = try JSONDecoder().decode(NativeGlassEnvelope.self, from: data)
        } catch {
            call.reject("Invalid payload")
            return
        }
        DispatchQueue.main.async {
            guard #available(iOS 26.0, *) else {
                call.resolve(["applied": false, "count": 0])
                return
            }
            self.applyGlassOnMain(call, envelope: envelope)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 26.0, *) else {
                call.resolve()
                return
            }
            self.removeGlassOnMain()
            call.resolve()
        }
    }
}

@available(iOS 26.0, *)
extension NativeGlassPlugin {
    func applyGlassOnMain(_ call: CAPPluginCall, envelope: NativeGlassEnvelope) {
        guard let webView = bridge?.webView, webView.superview != nil else {
            call.resolve(["applied": false, "count": 0])
            return
        }
        let mount = ensureMount()
        mount.attach(to: webView)
        mount.update(envelope)
        if envelope.controls.isEmpty {
            mount.overlay.removeFromSuperview()
        }
        call.resolve(["applied": true, "count": envelope.controls.count])
    }

    func removeGlassOnMain() {
        guard let mount = glassMount as? NativeGlassMount else { return }
        mount.model.controls = []
        mount.overlay.hitFrames = []
        mount.overlay.removeFromSuperview()
    }

    func ensureMount() -> NativeGlassMount {
        if let existing = glassMount as? NativeGlassMount {
            return existing
        }
        let mount = NativeGlassMount(
            onTap: { [weak self] id in
                self?.notifyListeners("tap", data: ["id": id])
            },
            onChange: { [weak self] id, value in
                self?.notifyListeners("change", data: ["id": id, "value": value])
            }
        )
        glassMount = mount
        return mount
    }
}

/// Full-screen sibling of the web view. One SwiftUI layer draws every control
/// inside a shared glass container. Only control frames receive touches.
/// A `surface` plate is visual only, so a drag on empty chrome still reaches the page.
@available(iOS 26.0, *)
final class NativeGlassOverlayView: UIView {
    var hitFrames: [CGRect] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        hitFrames.contains { $0.contains(point) }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard self.point(inside: point, with: event) else { return nil }
        let hit = super.hitTest(point, with: event)
        if hit == nil || hit === self { return nil }
        // The hosting view fills the screen. A miss inside a frame still has to
        // reach the page; only a real control keeps the touch.
        if subviews.contains(where: { $0 === hit }) { return nil }
        return hit
    }
}

@available(iOS 26.0, *)
final class NativeGlassMount {
    let overlay = NativeGlassOverlayView()
    let model = NativeGlassSceneModel()
    private var controller: UIHostingController<NativeGlassLayer>?
    private var constraints: [NSLayoutConstraint] = []
    private var hostConstraints: [NSLayoutConstraint] = []

    init(onTap: @escaping (String) -> Void, onChange: @escaping (String, String) -> Void) {
        model.onTap = onTap
        model.onChange = onChange
    }

    func attach(to webView: WKWebView) {
        guard let parent = webView.superview else { return }
        if overlay.superview !== parent {
            overlay.removeFromSuperview()
            parent.insertSubview(overlay, aboveSubview: webView)
        }
        overlay.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.deactivate(constraints)
        constraints = [
            overlay.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: webView.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
        ]
        NSLayoutConstraint.activate(constraints)
        ensureController()
    }

    func update(_ envelope: NativeGlassEnvelope) {
        let style: UIUserInterfaceStyle = envelope.colorScheme == "dark" ? .dark : .light
        overlay.overrideUserInterfaceStyle = style
        controller?.overrideUserInterfaceStyle = style
        if model.accentRaw != envelope.accent {
            model.accentRaw = envelope.accent
        }
        if model.controls != envelope.controls {
            model.controls = envelope.controls
        }
        overlay.hitFrames = envelope.controls.filter { $0.role != "surface" }.map(\.frame)
    }

    private func ensureController() {
        if controller != nil { return }
        let host = UIHostingController(rootView: NativeGlassLayer(model: model))
        host.view.backgroundColor = .clear
        host.view.isOpaque = false
        host.view.insetsLayoutMarginsFromSafeArea = false
        host.safeAreaRegions = []
        host.view.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(host.view)
        hostConstraints = [
            host.view.leadingAnchor.constraint(equalTo: overlay.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: overlay.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: overlay.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: overlay.bottomAnchor),
        ]
        NSLayoutConstraint.activate(hostConstraints)
        controller = host
    }
}
