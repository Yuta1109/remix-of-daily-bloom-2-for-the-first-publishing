import SwiftUI
import UIKit

enum PlanningPalette {
    static let paper = Color(red: 0.965, green: 0.941, blue: 0.902)
    static let card = Color(red: 0.992, green: 0.976, blue: 0.953)
    static let ink = Color(red: 0.227, green: 0.184, blue: 0.145)
    static let muted = Color(red: 0.478, green: 0.420, blue: 0.365)
    static let line = Color(red: 0.863, green: 0.816, blue: 0.745)
    static let plan = Color(red: 0.949, green: 0.780, blue: 0.745)
    static let future = Color(red: 0.780, green: 0.855, blue: 0.780)
    static let monthly = Color(red: 0.780, green: 0.835, blue: 0.910)
    static let weekly = Color(red: 0.910, green: 0.855, blue: 0.745)
    static let daily = Color(red: 0.910, green: 0.800, blue: 0.745)
    static let plus = Color(red: 0.870, green: 0.835, blue: 0.790)
    static let todo = Color(red: 0.980, green: 0.945, blue: 0.780)
    static let event = Color(red: 0.875, green: 0.855, blue: 0.945)
    static let rail = Color(red: 0.55, green: 0.42, blue: 0.32)
    /// Generic Planning accent. User-selected item colors stay on `PlanIconColor`.
    static let accent = Color(red: 0.916, green: 0.524, blue: 0.244)
    static let keep = Color(red: 0.36, green: 0.58, blue: 0.40)
    static let postpone = Color(red: 0.72, green: 0.52, blue: 0.20)
    static let stop = Color(red: 0.70, green: 0.32, blue: 0.28)
}

/// Stable Plan icon colours. Stored as an id, never as a SwiftUI Color.
enum PlanIconColor: String, CaseIterable, Identifiable {
    case rose, peach, yellow, mint, sky, lavender

    static let defaultID = PlanIconColor.rose.rawValue

    var id: String { rawValue }

    var color: Color {
        switch self {
        case .rose: Color(red: 0.910, green: 0.655, blue: 0.718)
        case .peach: Color(red: 0.941, green: 0.698, blue: 0.553)
        case .yellow: Color(red: 0.871, green: 0.773, blue: 0.435)
        case .mint: Color(red: 0.612, green: 0.804, blue: 0.690)
        case .sky: Color(red: 0.596, green: 0.769, blue: 0.886)
        case .lavender: Color(red: 0.714, green: 0.655, blue: 0.867)
        }
    }

    static func resolved(_ id: String) -> PlanIconColor {
        PlanIconColor(rawValue: id) ?? .rose
    }
}

extension View {
    func planningScroll() -> some View {
        scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
    }

    func planningKeyboardDismiss() -> some View {
        background(PlanningKeyboardDismissInstaller().allowsHitTesting(false))
    }

    /// Surface only. Extends under the tab bar and behind the keyboard.
    /// Do not apply this to scrolling or keyboard-avoiding content.
    func planningExtendingSurface(_ color: Color) -> some View {
        background {
            color
                .ignoresSafeArea(.container, edges: [.top, .bottom])
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
    }

    /// Custom header row (Planning title, period controls) in the system safe-area bar.
    /// iOS 26 uses `safeAreaBar` so the platform draws Liquid Glass and the scroll edge.
    /// Earlier systems use a material inset. The header view itself stays unpainted.
    func planningFixedHeader<Header: View>(@ViewBuilder header: () -> Header) -> some View {
        modifier(PlanningHeaderChrome(header: AnyView(header())))
    }

    /// Pushed Planning pages: system navigation bar, back, centered title, optional trailing control.
    func planningPageChrome(title: String, onBack: @escaping () -> Void) -> some View {
        modifier(PlanningPageChrome(title: title, onBack: onBack, trailing: nil))
    }

    func planningPageChrome<Trailing: View>(
        title: String,
        onBack: @escaping () -> Void,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        modifier(PlanningPageChrome(title: title, onBack: onBack, trailing: AnyView(trailing())))
    }
}

/// One chrome foundation for every Planning header. No opaque cream bar.
private struct PlanningHeaderChrome: ViewModifier {
    let header: AnyView

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.safeAreaBar(edge: .top, spacing: 0) {
                header
            }
        } else {
            content.safeAreaInset(edge: .top, spacing: 0) {
                header.background {
                    Rectangle().fill(.ultraThinMaterial).allowsHitTesting(false)
                }
            }
        }
    }
}

private struct PlanningPageChrome: ViewModifier {
    let title: String
    let onBack: () -> Void
    let trailing: AnyView?

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .navigationBarHidden(false)
            .toolbar {
                if #available(iOS 26.0, *) {
                    ToolbarItem(placement: .topBarLeading) {
                        NativeGlassIconButton(icon: .back, accessibilityLabel: "Back", action: onBack)
                    }
                    .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .topBarLeading) {
                        NativeGlassIconButton(icon: .back, accessibilityLabel: "Back", action: onBack)
                    }
                }
                if let trailing {
                    ToolbarItem(placement: .topBarTrailing) {
                        trailing
                    }
                }
            }
            .modifier(PlanningToolbarMaterial())
    }
}

/// iOS 26 keeps the system Liquid Glass toolbar. Earlier systems show material.
private struct PlanningToolbarMaterial: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .toolbarBackground(.automatic, for: .navigationBar)
        } else {
            content
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        }
    }
}

/// Orange capsule used by New / Edit Plan. iOS 26 uses prominent glass with an orange tint.
struct PlanningSavePill: View {
    let action: () -> Void
    @State private var transitionPending = false

    private func invoke() {
        guard !transitionPending else { return }
        transitionPending = true
        PlanningTransition.perform {
            transitionPending = false
            action()
        }
    }

    var body: some View {
        if #available(iOS 26.0, *) {
            Button(action: invoke) {
                Text(PlanningText.string(.save))
                    .font(.system(size: 15.5, weight: .semibold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 30)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.capsule)
            .tint(Color.orange)
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel(PlanningText.string(.save))
        } else {
            Button(action: invoke) {
                Text(PlanningText.string(.save))
                    .font(.system(size: 15.5, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 30)
                    .background(Capsule().fill(Color.orange))
            }
            .buttonStyle(.plain)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityLabel(PlanningText.string(.save))
        }
    }
}

/// Clear host behind Plan, Future, Monthly, Weekly, and Daily.
/// The column paints nothing; the shell paper shows through index gaps.
struct PlanningIndexHost<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.clear)
            .background(PlanningIndexSurface())
    }
}

/// Clears the opaque system backing of a paging TabView so the shell paper
/// shows beside the index, matching the Plan page. Does not draw a hit target.
struct PlanningIndexSurface: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            guard let host = uiView.superview else { return }
            clearPagingBackground(host)
        }
    }

    private func clearPagingBackground(_ view: UIView) {
        if let scroll = view as? UIScrollView {
            scroll.backgroundColor = .clear
            scroll.isOpaque = false
        }
        view.subviews.forEach(clearPagingBackground)
    }
}

struct PlanningKeyboardDismissInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = PlanningPassThroughView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

final class PlanningPassThroughView: UIView, UIGestureRecognizerDelegate {
    private static var installed = false

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard let window, !Self.installed else { return }
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        window.addGestureRecognizer(tap)
        Self.installed = true
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        nil
    }

    @objc private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var view = touch.view
        while let current = view {
            if current is UIControl || current is UITextView { return false }
            view = current.superview
        }
        return true
    }
}

/// Index tab: a rectangle with square left corners and rounded right corners.
/// It is deliberately not a trapezoid.
struct PlanningIndexTabShape: Shape {
    func path(in rect: CGRect) -> Path {
        let radius = PlanningTokens.Index.cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
            radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
            radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Open outline for the selected tab: top, rounded right side, bottom. No left edge,
/// so the tab flows into the page without a line at the seam.
struct PlanningIndexTabOutline: Shape {
    func path(in rect: CGRect) -> Path {
        let radius = PlanningTokens.Index.cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
            radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
            radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return path
    }
}

private struct PlanningSheetMeasureKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Measures how tall a sheet can be while its top stays inside the visible platter.
private struct PlanningSheetViewport: UIViewRepresentable {
    @Binding var maximumVisible: CGFloat
    @Binding var keyboardObstructing: Bool

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        context.coordinator.observe(view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.host = uiView
        context.coordinator.publish()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(maximumVisible: $maximumVisible, keyboardObstructing: $keyboardObstructing)
    }

    final class Coordinator {
        var maximumVisible: Binding<CGFloat>
        var keyboardObstructing: Binding<Bool>
        weak var host: UIView?
        var token: NSObjectProtocol?
        var keyboardFrame: CGRect?

        init(maximumVisible: Binding<CGFloat>, keyboardObstructing: Binding<Bool>) {
            self.maximumVisible = maximumVisible
            self.keyboardObstructing = keyboardObstructing
        }

        func observe(_ view: UIView) {
            host = view
            token = NotificationCenter.default.addObserver(
                forName: UIResponder.keyboardWillChangeFrameNotification,
                object: nil,
                queue: .main
            ) { [weak self] note in
                self?.keyboardFrame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
                self?.publish()
            }
        }

        func publish() {
            guard let window = host?.window else { return }
            let frame: CGRect
            if let keyboardFrame {
                frame = window.convert(keyboardFrame, from: nil)
            } else {
                frame = CGRect(x: 0, y: window.bounds.maxY, width: window.bounds.width, height: 0)
            }
            let topClearance = window.safeAreaInsets.top + PlanningTokens.Sheet.platterTopGap
            let limit = max(PlanningTokens.Sheet.headerHeight + 1, frame.minY - topClearance)
            let obstructing = frame.height > 1 && frame.minY < window.bounds.maxY - 1
            if abs(limit - maximumVisible.wrappedValue) > 0.5 { maximumVisible.wrappedValue = limit }
            if keyboardObstructing.wrappedValue != obstructing { keyboardObstructing.wrappedValue = obstructing }
        }

        deinit {
            if let token { NotificationCenter.default.removeObserver(token) }
        }
    }
}

/// Scrolls only the focused field into the already-shrunk body viewport.
private struct PlanningFocusedFieldScroller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        context.coordinator.observe()
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.host = uiView
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        weak var host: UIView?
        var token: NSObjectProtocol?

        func observe() {
            token = NotificationCenter.default.addObserver(
                forName: UIResponder.keyboardWillChangeFrameNotification,
                object: nil,
                queue: .main
            ) { [weak self] note in
                let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
                let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
                guard let window = self?.host?.window, let frame, frame.minY < window.bounds.maxY - 1 else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + duration) { self?.scrollIfNeeded() }
            }
        }

        func scrollIfNeeded() {
            guard let window = host?.window, let responder = window.planningFirstResponder() else { return }
            guard let scroll = responder.planningEnclosingScrollView() else { return }
            let rect = responder.convert(responder.bounds, to: scroll).insetBy(dx: 0, dy: -12)
            let visible = scroll.bounds.inset(by: scroll.adjustedContentInset)
            if visible.contains(rect) { return }
            scroll.scrollRectToVisible(rect, animated: true)
        }

        deinit {
            if let token { NotificationCenter.default.removeObserver(token) }
        }
    }
}

private extension UIView {
    func planningFirstResponder() -> UIView? {
        if isFirstResponder { return self }
        for child in subviews {
            if let found = child.planningFirstResponder() { return found }
        }
        return nil
    }

    func planningEnclosingScrollView() -> UIScrollView? {
        var current: UIView? = superview
        while let view = current {
            if let scroll = view as? UIScrollView { return scroll }
            current = view.superview
        }
        return nil
    }
}

struct PlanningTabBarHeightReader: UIViewRepresentable {
    @Binding var height: CGFloat

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            var current: UIView? = uiView
            while let view = current {
                if let bar = view as? UITabBar {
                    let visible = bar.bounds.height - bar.safeAreaInsets.bottom
                    let next = visible > 1 ? visible : bar.bounds.height
                    if abs(next - height) > 0.5 { height = next }
                    return
                }
                current = view.superview
            }
        }
    }
}

struct PlanningGlassAction: View {
    let title: String
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @State private var transitionPending = false
    private var accent: Color { Color(red: 0.916, green: 0.524, blue: 0.244) }

    private func invoke() {
        guard !transitionPending else { return }
        transitionPending = true
        PlanningTransition.perform {
            transitionPending = false
            action()
        }
    }

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                Button(action: invoke) {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: PlanningTokens.Editor.ctaHeight)
                }
                .buttonStyle(.glassProminent)
                .tint(accent)
            } else {
                Button(action: invoke) {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: PlanningTokens.Editor.ctaHeight)
                        .background(accent.opacity(0.92), in: RoundedRectangle(cornerRadius: PlanningTokens.Editor.ctaCorner, style: .continuous))
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: PlanningTokens.Editor.ctaCorner, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .opacity(isEnabled ? 1 : 0.4)
        .padding(.horizontal, PlanningTokens.Editor.ctaInset)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

/// Native discard alert. Cancel uses the alert's own label tint, so it stays black
/// in Planning light mode without changing the app accent. Discard stays destructive red.
enum PlanningDiscardConfirmation {
    static func present(confirm: @escaping () -> Void) {
        let alert = PlanningDiscardAlertController(
            title: PlanningText.string(.discardTitle),
            message: nil,
            preferredStyle: .alert
        )
        alert.overrideUserInterfaceStyle = .light
        alert.addAction(UIAlertAction(title: PlanningText.string(.cancel), style: .cancel))
        alert.addAction(UIAlertAction(title: PlanningText.string(.discard), style: .destructive) { _ in
            confirm()
        })
        guard let presenter = topViewController() else { return }
        presenter.present(alert, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }
}

private final class PlanningDiscardAlertController: UIAlertController {
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.tintColor = .label
    }
}

private struct PlanningSystemTopInsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct PlanningInitialScrollTopInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = PlanningTokens.Header.height
}

extension EnvironmentValues {
    /// Status-bar safe area plus the Planning root header. Initial pager scroll margin only.
    var planningInitialScrollTopInset: CGFloat {
        get { self[PlanningInitialScrollTopInsetKey.self] }
        set { self[PlanningInitialScrollTopInsetKey.self] = newValue }
    }
}

extension View {
    func planningMeasuredScrollTopInset() -> some View {
        modifier(PlanningMeasuredScrollTopInset())
    }

    /// Initial scroll position only. Content can still scroll under the header.
    func planningInitialScrollMargin() -> some View {
        modifier(PlanningInitialScrollMargin())
    }
}

private struct PlanningMeasuredScrollTopInset: ViewModifier {
    @State private var systemTop: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .background {
                GeometryReader { proxy in
                    Color.clear.preference(key: PlanningSystemTopInsetKey.self, value: proxy.safeAreaInsets.top)
                }
            }
            .onPreferenceChange(PlanningSystemTopInsetKey.self) { systemTop = $0 }
            .environment(\.planningInitialScrollTopInset, systemTop + PlanningTokens.Header.height)
    }
}

private struct PlanningInitialScrollMargin: ViewModifier {
    @Environment(\.planningInitialScrollTopInset) private var inset

    func body(content: Content) -> some View {
        content.contentMargins(.top, inset, for: .scrollContent)
    }
}

/// Transparent horizontal pager. Replaces nested paging TabView containers.
struct PlanningHorizontalPager<Page: Hashable, Content: View>: View {
    let pages: [Page]
    @Binding var selection: Page
    @ViewBuilder var content: (Page) -> Content

    private var position: Binding<Page?> {
        Binding(
            get: { selection },
            set: { if let page = $0 { selection = page } }
        )
    }

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(pages, id: \.self) { page in
                    content(page)
                        .id(page)
                        .containerRelativeFrame(.horizontal)
                        .containerRelativeFrame(.vertical)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: position)
        .scrollIndicators(.hidden)
        .background(Color.clear)
    }
}

/// One continuous sheet surface. The header is a real layout row.
/// Detent height freezes while the keyboard overlaps the sheet.
struct PlanningSystemSheetChrome<Content: View>: View {
    let onClose: () -> Void
    let onConfirm: () -> Void
    var confirmEnabled: Bool = true
    /// When a child sheet is up, the parent keeps this header's height and hides its buttons.
    var showsControls: Bool = true
    var centerTitle: String? = nil
    var onCenter: (() -> Void)? = nil
    /// Caps the body and scrolls it. Nil keeps the short transfer sheets intrinsic.
    var maximumBody: CGFloat? = nil
    /// Future event and month editors pass white. Default is the system sheet surface.
    var bodySurface: Color? = nil
    @ViewBuilder var content: () -> Content

    @State private var stableHeight: CGFloat = 280
    @State private var maximumVisibleSheetHeight: CGFloat = 4000
    @State private var keyboardObstructing = false

    private var surface: Color { bodySurface ?? Color(uiColor: .systemBackground) }
    /// Fitted content height, never taller than the region above the keyboard.
    private var presentedHeight: CGFloat {
        min(max(stableHeight, 1), maximumVisibleSheetHeight)
    }
    /// Header stays intact. Only the body viewport shrinks.
    private var bodyViewportHeight: CGFloat {
        max(presentedHeight - PlanningTokens.Sheet.headerHeight, 1)
    }

    var body: some View {
        VStack(spacing: 0) {
            controls
            ScrollView {
                sheetBody
            }
            .scrollIndicators(.hidden)
            .frame(height: bodyViewportHeight)
            .background(PlanningFocusedFieldScroller())
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .background(surface)
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .background(PlanningSheetViewport(maximumVisible: $maximumVisibleSheetHeight, keyboardObstructing: $keyboardObstructing))
        .onPreferenceChange(PlanningSheetMeasureKey.self) { value in
            guard !keyboardObstructing, value > 1 else { return }
            let total = value + PlanningTokens.Sheet.headerHeight
            let cap = maximumBody ?? total
            let next = min(total, cap)
            if abs(next - stableHeight) > 0.5 { stableHeight = next }
        }
        .presentationDetents([.height(max(presentedHeight, 1))])
        .presentationDragIndicator(.hidden)
        .presentationBackground(surface)
    }

    private var sheetBody: some View {
        content()
            .padding(.bottom, PlanningTokens.Sheet.bottomInset)
            .frame(maxWidth: .infinity, alignment: .top)
            .background {
                GeometryReader { proxy in
                    Color.clear.preference(key: PlanningSheetMeasureKey.self, value: proxy.size.height)
                }
            }
    }

    private var controls: some View {
        HStack {
            if showsControls {
                NativeGlassIconButton(icon: .close, accessibilityLabel: "Close", neutral: true, waitsForGlassFeedback: true, action: onClose)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
            Spacer(minLength: 0)
            if let centerTitle {
                if let onCenter {
                    Button(centerTitle, action: onCenter)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color(uiColor: .label))
                } else {
                    Text(centerTitle)
                        .font(.headline)
                        .foregroundStyle(Color(uiColor: .label))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if showsControls {
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Confirm", prominent: true, waitsForGlassFeedback: true, action: onConfirm)
                    .disabled(!confirmEnabled)
                    .opacity(confirmEnabled ? 1 : 0.4)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, PlanningTokens.Sheet.horizontalInset)
        .frame(height: PlanningTokens.Sheet.headerHeight)
        .background(Color.clear)
    }
}

struct PlanningHeadingIconSlot: View {
    var body: some View {
        Color.clear
            .frame(width: PlanningTokens.PlanMain.iconSlot, height: PlanningTokens.PlanMain.iconSlot)
            .accessibilityHidden(true)
    }
}

/// Shared intro rhythm for Plan, Future, and period pages that show an icon and title.
struct PlanningSectionIntro<Icon: View>: View {
    let title: String
    let message: String
    var topGap: CGFloat = PlanningTokens.PlanMain.titleTop
    @ViewBuilder var icon: () -> Icon

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: PlanningTokens.PlanMain.iconGap) {
                icon()
                Text(title)
                    .font(.system(size: PlanningTokens.PlanMain.titleSize, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .padding(.top, topGap)
            Text(message)
                .font(.system(size: PlanningTokens.PlanMain.paragraphSize))
                .lineSpacing(PlanningTokens.PlanMain.paragraphLineSpacing)
                .foregroundStyle(PlanningPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, PlanningTokens.PlanMain.titleToParagraph)
        }
    }
}

enum PlanningCalendarGrid {
    static let rowCount = 6
    static let columnCount = 7

    static func matrix(year: Int, month: Int) -> [[Int?]] {
        let calendar = PeriodCalendar.calendar
        let start = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
        let dayCount = calendar.range(of: .day, in: .month, for: start)?.count ?? 30
        let weekday = calendar.component(.weekday, from: start)
        let leading = (weekday - calendar.firstWeekday + 7) % 7
        var cells = Array(repeating: Optional<Int>.none, count: rowCount * columnCount)
        for day in 1...dayCount {
            let index = leading + day - 1
            if index < cells.count { cells[index] = day }
        }
        return stride(from: 0, to: cells.count, by: columnCount).map { Array(cells[$0..<$0 + columnCount]) }
    }
}

extension PeriodCalendar {
    static func periodHasEnded(_ bucket: PlanningBucket, key: String, now: Date = Date()) -> Bool {
        let startOfToday = calendar.startOfDay(for: now)
        switch bucket {
        case .daily:
            guard let day = date(from: key) else { return false }
            return calendar.startOfDay(for: day) < startOfToday
        case .weekly:
            guard let start = date(from: key) else { return false }
            let end = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: start)) ?? start
            return end <= startOfToday
        case .monthly:
            let parts = monthParts(key)
            let start = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? now
            let next = calendar.date(byAdding: .month, value: 1, to: start) ?? start
            return next <= startOfToday
        }
    }
}

struct PlanningSheetChrome<Content: View>: View {
    let onClose: () -> Void
    let onConfirm: () -> Void
    var fixedHeight: CGFloat = 320
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                NativeGlassIconButton(icon: .close, accessibilityLabel: "Close", neutral: true, action: onClose)
                Spacer()
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: onConfirm)
            }
            .padding(.horizontal, 16)
            .padding(.top, PlanningTokens.Sheet.headerTop)
            .padding(.bottom, PlanningTokens.Sheet.headerTop)
            .background {
                Rectangle().fill(.ultraThinMaterial).allowsHitTesting(false)
            }
            content()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(fixedHeight)])
        .presentationDragIndicator(.hidden)
        .planningKeyboardDismiss()
    }
}
