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
        mount.detach()
    }

    func ensureMount() -> NativeGlassMount {
        if let existing = glassMount as? NativeGlassMount {
            return existing
        }
        let mount = NativeGlassMount(
            onTap: { [weak self] id in
                let delay = UIAccessibility.isReduceMotionEnabled ? 0.0 : 0.12
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    self?.notifyListeners("tap", data: ["id": id])
                }
            },
            onChange: { [weak self] id, value in
                self?.notifyListeners("change", data: ["id": id, "value": value])
            }
        )
        glassMount = mount
        return mount
    }
}

/// Full-screen siblings of the web view.
/// Controls sit above the page. Popup glass sits behind it, with a dimming
/// shield between them that blocks touches outside the popup.
@available(iOS 26.0, *)
final class NativeGlassOverlayView: UIView {
    var hitFrames: [CGRect] = []
    /// While a popup is open, controls cannot paint outside its rect.
    var clipRect: CGRect? {
        didSet { setNeedsLayout() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let clipRect else {
            layer.mask = nil
            return
        }
        let mask = CAShapeLayer()
        mask.frame = bounds
        mask.path = UIBezierPath(roundedRect: clipRect, cornerRadius: 22).cgPath
        layer.mask = mask
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        if let clipRect, !clipRect.contains(point) { return false }
        return hitFrames.contains { $0.contains(point) }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // Only control frames are inside this view. Returning the SwiftUI host
        // keeps the drag on the native tab bar instead of the web view behind it.
        guard self.point(inside: point, with: event) else { return nil }
        return super.hitTest(point, with: event)
    }
}

/// Dims the page and swallows touches while a popup is open.
/// Holes match the popup frames so the form itself stays sharp and tappable.
@available(iOS 26.0, *)
final class NativeGlassShieldView: UIView {
    var holes: [CGRect] = [] {
        didSet { setNeedsLayout() }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor.black.withAlphaComponent(0.28)
        isOpaque = false
        isHidden = true
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let path = UIBezierPath(rect: bounds)
        for hole in holes {
            path.append(UIBezierPath(roundedRect: hole, cornerRadius: 22))
        }
        path.usesEvenOddFillRule = true
        let mask = CAShapeLayer()
        mask.frame = bounds
        mask.path = path.cgPath
        mask.fillRule = .evenOdd
        layer.mask = holes.isEmpty ? nil : mask
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        if isHidden || !isUserInteractionEnabled { return false }
        if holes.contains(where: { $0.insetBy(dx: -8, dy: -8).contains(point) }) { return false }
        return bounds.contains(point)
    }
}

@available(iOS 26.0, *)
final class NativeGlassMount {
    let overlay = NativeGlassOverlayView()
    let shield = NativeGlassShieldView()
    let model = NativeGlassSceneModel()
    private var controller: UIHostingController<NativeGlassLayer>?
    private var surfaceController: UIHostingController<NativeGlassSurfaceLayer>?
    private var constraints: [NSLayoutConstraint] = []
    private var shieldConstraints: [NSLayoutConstraint] = []
    private var surfaceConstraints: [NSLayoutConstraint] = []
    private var hostConstraints: [NSLayoutConstraint] = []
    private var surfaceHostConstraints: [NSLayoutConstraint] = []
    private let surfaceOverlay = UIView()
    private weak var webView: WKWebView?
    private var savedWebOpaque: Bool?
    private var savedWebBackground: UIColor?
    private var savedScrollOpaque: Bool?
    private var savedScrollBackground: UIColor?

    init(onTap: @escaping (String) -> Void, onChange: @escaping (String, String) -> Void) {
        model.onTap = onTap
        model.onChange = onChange
        surfaceOverlay.backgroundColor = .clear
        surfaceOverlay.isOpaque = false
        surfaceOverlay.isUserInteractionEnabled = false
    }

    func attach(to webView: WKWebView) {
        guard let parent = webView.superview else { return }
        self.webView = webView
        if savedWebOpaque == nil {
            savedWebOpaque = webView.isOpaque
            savedWebBackground = webView.backgroundColor
            savedScrollOpaque = webView.scrollView.isOpaque
            savedScrollBackground = webView.scrollView.backgroundColor
        }
        if surfaceOverlay.superview !== parent {
            surfaceOverlay.removeFromSuperview()
            parent.insertSubview(surfaceOverlay, belowSubview: webView)
        }
        if shield.superview !== parent {
            shield.removeFromSuperview()
            parent.insertSubview(shield, aboveSubview: webView)
        }
        if overlay.superview !== parent {
            overlay.removeFromSuperview()
            parent.insertSubview(overlay, aboveSubview: shield)
        }
        pin(surfaceOverlay, to: webView, constraints: &surfaceConstraints)
        pin(shield, to: webView, constraints: &shieldConstraints)
        pin(overlay, to: webView, constraints: &constraints)
        ensureController()
        ensureSurfaceController()
    }

    func detach() {
        model.controls = []
        overlay.hitFrames = []
        overlay.clipRect = nil
        shield.holes = []
        shield.isHidden = true
        shield.isUserInteractionEnabled = false
        setWebViewClear(false)
        overlay.removeFromSuperview()
        shield.removeFromSuperview()
        surfaceOverlay.removeFromSuperview()
    }

    func update(_ envelope: NativeGlassEnvelope) {
        let style: UIUserInterfaceStyle = envelope.colorScheme == "dark" ? .dark : .light
        overlay.overrideUserInterfaceStyle = style
        shield.overrideUserInterfaceStyle = style
        surfaceOverlay.overrideUserInterfaceStyle = style
        controller?.overrideUserInterfaceStyle = style
        surfaceController?.overrideUserInterfaceStyle = style
        if model.accentRaw != envelope.accent {
            model.accentRaw = envelope.accent
        }
        if model.controls != envelope.controls {
            model.controls = envelope.controls
        }
        let surfaces = envelope.controls.filter { $0.role == "surface" && !$0.suppressed }
        overlay.hitFrames = envelope.controls.filter { $0.role != "surface" && !$0.suppressed && !$0.passThrough }.map(\.frame)
        overlay.clipRect = surfaces.reduce(nil as CGRect?) { union, spec in
            union?.union(spec.frame) ?? spec.frame
        }
        shield.holes = surfaces.map(\.frame)
        shield.isHidden = surfaces.isEmpty
        shield.isUserInteractionEnabled = !surfaces.isEmpty
        surfaceOverlay.isHidden = surfaces.isEmpty
        setWebViewClear(surfaces.isEmpty == false)
    }

    private func pin(_ view: UIView, to webView: WKWebView, constraints store: inout [NSLayoutConstraint]) {
        view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.deactivate(store)
        store = [
            view.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            view.topAnchor.constraint(equalTo: webView.topAnchor),
            view.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
        ]
        NSLayoutConstraint.activate(store)
    }

    private func setWebViewClear(_ clear: Bool) {
        guard let webView else { return }
        if clear {
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.isOpaque = false
            webView.scrollView.backgroundColor = .clear
        } else if let savedWebOpaque {
            webView.isOpaque = savedWebOpaque
            webView.backgroundColor = savedWebBackground
            webView.scrollView.isOpaque = savedScrollOpaque ?? true
            webView.scrollView.backgroundColor = savedScrollBackground
        }
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

    private func ensureSurfaceController() {
        if surfaceController != nil { return }
        let host = UIHostingController(rootView: NativeGlassSurfaceLayer(model: model))
        host.view.backgroundColor = .clear
        host.view.isOpaque = false
        host.view.isUserInteractionEnabled = false
        host.view.insetsLayoutMarginsFromSafeArea = false
        host.safeAreaRegions = []
        host.view.translatesAutoresizingMaskIntoConstraints = false
        surfaceOverlay.addSubview(host.view)
        surfaceHostConstraints = [
            host.view.leadingAnchor.constraint(equalTo: surfaceOverlay.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: surfaceOverlay.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: surfaceOverlay.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: surfaceOverlay.bottomAnchor),
        ]
        NSLayoutConstraint.activate(surfaceHostConstraints)
        surfaceController = host
    }
}
