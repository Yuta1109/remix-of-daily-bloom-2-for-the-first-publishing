import SwiftUI

/// Shared native Liquid Glass controls.
///
/// Every screen asks for a role (`back`, `close`, `check`, `icon`, `button`,
/// `search`, `tabBar`, `surface`). Independent controls each draw their own
/// glass. `GlassEffectContainer` is only used inside a tab bar, where the
/// selection pill has to move with the finger. Pages do not declare their
/// own glass.
///
/// Popup surfaces are drawn behind the web view. Their text stays in the
/// page, in front of that plate. The surface is not a button, so a long
/// press does not scale the popup.
///
/// iOS 17.2–25 keep the existing CSS material. Callers must not construct
/// these views below iOS 26. System glass follows Reduce Motion and
/// Reduce Transparency; this layer does not add its own motion.

struct NativeGlassTab: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var symbol: String
    var selected: Bool
}

struct NativeGlassSpec: Codable, Equatable, Identifiable {
    var id: String
    var role: String
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var label: String
    var symbol: String
    var prominent: Bool
    var enabled: Bool
    var value: String
    var tabs: [NativeGlassTab]
    var suppressed: Bool = false
    var insetBottom: Double = 0
    var corner: Double = 22
    /// Drawn, but taps pass through to the web control underneath.
    var passThrough: Bool = false

    var frame: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }

    var accessibilityName: String {
        if !label.isEmpty { return label }
        switch role {
        case "back": return "Back"
        case "close": return "Close"
        case "check": return "Save"
        case "search": return "Search"
        default: return symbol
        }
    }
}

struct NativeGlassEnvelope: Codable, Equatable {
    var colorScheme: String
    var accent: String
    var controls: [NativeGlassSpec]
}

func colorFromAccent(_ raw: String) -> Color {
    let parts = raw.split { $0 == " " || $0 == "," }.map(String.init)
    guard parts.count >= 3,
          let hue = Double(parts[0]),
          let saturation = Double(parts[1].replacingOccurrences(of: "%", with: "")),
          let lightness = Double(parts[2].replacingOccurrences(of: "%", with: "")) else {
        return Color(red: 0.916, green: 0.524, blue: 0.244)
    }
    return colorFromHsl(h: hue, s: saturation / 100, l: lightness / 100)
}

private func colorFromHsl(h: Double, s: Double, l: Double) -> Color {
    let chroma = (1 - abs(2 * l - 1)) * s
    let sector = h.truncatingRemainder(dividingBy: 360) / 60
    let x = chroma * (1 - abs(sector.truncatingRemainder(dividingBy: 2) - 1))
    let match = l - chroma / 2
    let red: Double
    let green: Double
    let blue: Double
    switch sector {
    case 0..<1: (red, green, blue) = (chroma, x, 0)
    case 1..<2: (red, green, blue) = (x, chroma, 0)
    case 2..<3: (red, green, blue) = (0, chroma, x)
    case 3..<4: (red, green, blue) = (0, x, chroma)
    case 4..<5: (red, green, blue) = (x, 0, chroma)
    default: (red, green, blue) = (chroma, 0, x)
    }
    return Color(red: red + match, green: green + match, blue: blue + match)
}

@available(iOS 26.0, *)
final class NativeGlassSceneModel: ObservableObject {
    @Published var controls: [NativeGlassSpec] = []
    @Published var accentRaw: String = ""
    var onTap: (String) -> Void = { _ in }
    var onChange: (String, String) -> Void = { _, _ in }

    var accent: Color { colorFromAccent(accentRaw) }
}

/// Controls in front of the page. Each one is its own glass. A popup
/// surface is not drawn here — it lives behind the web view.
@available(iOS 26.0, *)
struct NativeGlassLayer: View {
    @ObservedObject var model: NativeGlassSceneModel
    @Namespace private var glassNamespace

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(model.controls) { spec in
                if spec.role != "surface" && !spec.suppressed {
                    control(spec)
                        .frame(width: max(spec.width, 1), height: max(spec.height, 1))
                        .glassEffectID(spec.id, in: glassNamespace)
                        .position(x: spec.x + spec.width / 2, y: spec.y + spec.height / 2)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .ignoresSafeArea()
    }

    @ViewBuilder
    private func control(_ spec: NativeGlassSpec) -> some View {
        let accent = model.accent
        switch spec.role {
        case "back":
            NativeLiquidGlassBackButton(label: spec.accessibilityName, enabled: spec.enabled) {
                model.onTap(spec.id)
            }
        case "close":
            NativeLiquidGlassCloseButton(label: spec.accessibilityName, enabled: spec.enabled) {
                model.onTap(spec.id)
            }
        case "check":
            NativeLiquidGlassCheckButton(label: spec.accessibilityName, enabled: spec.enabled, accent: accent) {
                model.onTap(spec.id)
            }
        case "icon":
            NativeLiquidGlassIconButton(
                symbol: spec.symbol.isEmpty ? "circle" : spec.symbol,
                label: spec.accessibilityName,
                prominent: spec.prominent,
                enabled: spec.enabled,
                accent: accent,
                tintRaw: spec.value
            ) {
                model.onTap(spec.id)
            }
        case "search":
            if spec.symbol == "navigate" {
                NativeLiquidGlassSearchOpenButton(label: spec.accessibilityName) {
                    model.onTap(spec.id)
                }
            } else {
                NativeLiquidGlassSearchField(text: spec.value, label: spec.accessibilityName) { value in
                    model.onChange(spec.id, value)
                }
            }
        case "tabBar":
            NativeLiquidGlassTabBar(
                tabs: spec.tabs,
                accent: accent,
                insetBottom: CGFloat(spec.insetBottom)
            ) { id in
                model.onTap(id)
            }
        case "switch":
            NativeLiquidGlassSwitch(on: spec.prominent, label: spec.accessibilityName, accent: accent) {
                model.onTap(spec.id)
            }
        case "surface":
            NativeLiquidGlassSurface(corner: spec.corner)
        default:
            NativeLiquidGlassButton(
                title: spec.label,
                symbol: spec.symbol,
                prominent: spec.prominent,
                enabled: spec.enabled,
                accent: accent
            ) {
                model.onTap(spec.id)
            }
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassButton: View {
    var title: String
    var symbol: String
    var prominent: Bool
    var enabled: Bool
    var accent: Color
    var action: () -> Void

    var body: some View {
        glassButton(prominent: prominent, accent: accent, circular: !symbol.isEmpty, enabled: enabled, label: title.isEmpty ? symbol : title, action: action) {
            if symbol.isEmpty {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .semibold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassBackButton: View {
    var label: String
    var enabled: Bool
    var action: () -> Void

    var body: some View {
        glassButton(prominent: false, accent: .primary, circular: true, enabled: enabled, label: label, action: action) {
            Image(systemName: "chevron.backward")
                .font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassCloseButton: View {
    var label: String
    var enabled: Bool
    var action: () -> Void

    var body: some View {
        glassButton(prominent: false, accent: .primary, circular: true, enabled: enabled, label: label, action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassCheckButton: View {
    var label: String
    var enabled: Bool
    var accent: Color
    var action: () -> Void

    var body: some View {
        glassButton(prominent: true, accent: accent, circular: true, enabled: enabled, label: label, action: action) {
            Image(systemName: "checkmark")
                .font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassIconButton: View {
    var symbol: String
    var label: String
    var prominent: Bool
    var enabled: Bool
    var accent: Color
    /// HSL channels (`h s% l%`) when this icon should use its own tint.
    var tintRaw: String = ""
    var action: () -> Void

    var body: some View {
        let tint = tintRaw.isEmpty ? accent : colorFromAccent(tintRaw)
        glassButton(prominent: prominent || !tintRaw.isEmpty, accent: tint, circular: true, enabled: enabled, label: label, action: action) {
            NativeGlassSymbol(symbol: symbol)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Icons that SF Symbols do not draw as the React control does.
@available(iOS 26.0, *)
struct NativeGlassSymbol: View {
    var symbol: String

    var body: some View {
        switch symbol {
        case "sticker":
            PeeledStampSymbol()
        case "ai.camera":
            ZStack {
                Image(systemName: "camera")
                    .font(.system(size: 17, weight: .semibold))
                Text("AI")
                    .font(.system(size: 7, weight: .bold))
                    .offset(y: -12)
            }
        default:
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
        }
    }
}

/// Circle with one edge peeled back. Not a gear and not a scalloped seal.
@available(iOS 26.0, *)
struct PeeledStampSymbol: View {
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let peel = side * 0.34
            ZStack {
                Circle()
                    .trim(from: 0, to: 0.86)
                    .stroke(style: StrokeStyle(lineWidth: 1.7, lineCap: .round))
                    .rotationEffect(.degrees(-70))
                    .padding(2)
                Path { path in
                    let right = side - 2
                    let bottom = side - 2
                    path.move(to: CGPoint(x: right - peel, y: bottom))
                    path.addQuadCurve(
                        to: CGPoint(x: right, y: bottom - peel),
                        control: CGPoint(x: right - peel * 0.15, y: bottom - peel * 0.15)
                    )
                    path.addLine(to: CGPoint(x: right - peel * 0.55, y: bottom - peel * 0.2))
                    path.closeSubpath()
                }
                .stroke(style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .padding(6)
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassSwitch: View {
    var on: Bool
    var label: String
    var accent: Color
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            GeometryReader { geo in
                let knob = max(geo.size.height - 6, 10)
                ZStack(alignment: on ? .trailing : .leading) {
                    Capsule()
                        .fill(on ? accent.opacity(0.85) : Color.white.opacity(0.28))
                    Circle()
                        .fill(Color.white)
                        .frame(width: knob, height: knob)
                        .padding(3)
                }
            }
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: Capsule())
        .accessibilityLabel(label)
        .modifier(GlassPressHold())
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassSearchField: View {
    var text: String
    var label: String
    var onChange: (String) -> Void
    @State private var draft: String

    init(text: String, label: String, onChange: @escaping (String) -> Void) {
        self.text = text
        self.label = label
        self.onChange = onChange
        _draft = State(initialValue: text)
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)
            TextField(label, text: $draft)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
            if !draft.isEmpty {
                Button {
                    draft = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear")
            }
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityLabel(label)
        .onChange(of: text) { _, newValue in
            if newValue != draft { draft = newValue }
        }
        .onChange(of: draft) { _, newValue in
            if newValue != text { onChange(newValue) }
        }
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassSearchOpenButton: View {
    var label: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(label)
                    .font(.system(size: 16))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityLabel(label)
    }
}

/// Popup plate. Not interactive, so a long press does not scale the popup.
/// Drawn behind the web view; the form text stays in front of it.
@available(iOS 26.0, *)
struct NativeLiquidGlassSurface: View {
    var corner: CGFloat

    var body: some View {
        Color.clear
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: max(corner, 16), style: .continuous))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Glass plate for every open popup, placed behind the web view.
@available(iOS 26.0, *)
struct NativeGlassSurfaceLayer: View {
    @ObservedObject var model: NativeGlassSceneModel

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(model.controls.filter { $0.role == "surface" && !$0.suppressed }) { spec in
                NativeLiquidGlassSurface(corner: CGFloat(spec.corner))
                    .frame(width: max(spec.width, 1), height: max(spec.height, 1))
                    .position(x: spec.x + spec.width / 2, y: spec.y + spec.height / 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .ignoresSafeArea()
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassTabBar: View {
    var tabs: [NativeGlassTab]
    var accent: Color
    var insetBottom: CGFloat
    var onSelect: (String) -> Void

    @State private var dragX: CGFloat?
    @Namespace private var tabGlass

    private var textual: Bool {
        tabs.allSatisfy { $0.symbol.isEmpty }
    }

    var body: some View {
        GlassEffectContainer(spacing: 12) {
            GeometryReader { geo in
                let count = max(tabs.count, 1)
                let width = max(geo.size.width, 1)
                let contentHeight = max(geo.size.height - insetBottom, 44)
                let segment = width / CGFloat(count)
                let selectedIndex = tabs.firstIndex(where: \.selected)
                let travel: CGFloat = {
                    if let dragX { return min(max(dragX, 0), width) }
                    if let selectedIndex { return (CGFloat(selectedIndex) + 0.5) * segment }
                    return -1
                }()
                let showPill = travel >= 0
                let pillWidth = max(segment - 8, 44)
                ZStack(alignment: .topLeading) {
                    Color.clear
                        .glassEffect(.regular, in: Capsule())
                    if showPill {
                        Color.clear
                            .glassEffect(.regular, in: Capsule())
                            .glassEffectID("tab-selection", in: tabGlass)
                            .frame(width: pillWidth, height: max(contentHeight - 10, 36))
                            .offset(x: min(max(travel - pillWidth / 2, 4), width - pillWidth - 4), y: 5)
                    }
                    HStack(spacing: 0) {
                        ForEach(Array(tabs.enumerated()), id: \.element.id) { index, tab in
                            segment(tab, icon: !textual, highlighted: highlighted(index: index, travel: travel, segment: segment))
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.top, 6)
                    .padding(.bottom, insetBottom + 6)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 10)
                        .onChanged { value in
                            dragX = min(max(value.location.x, 0), width)
                        }
                        .onEnded { value in
                            let x = min(max(value.location.x, 0), width - 0.01)
                            let index = min(count - 1, max(0, Int(x / segment)))
                            dragX = nil
                            if tabs.indices.contains(index) {
                                onSelect(tabs[index].id)
                            }
                        }
                )
            }
        }
    }

    private func highlighted(index: Int, travel: CGFloat, segment: CGFloat) -> Bool {
        let center = (CGFloat(index) + 0.5) * segment
        return abs(travel - center) <= segment / 2
    }

    private func segment(_ tab: NativeGlassTab, icon: Bool, highlighted: Bool) -> some View {
        Button {
            onSelect(tab.id)
        } label: {
            Group {
                if icon {
                    VStack(spacing: 3) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 20, weight: highlighted ? .semibold : .regular))
                        Text(tab.label)
                            .font(.system(size: 11, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                } else {
                    Text(tab.label)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 4)
                }
            }
            .foregroundStyle(highlighted ? (icon ? accent : Color.primary) : Color.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.label)
        .accessibilityAddTraits(highlighted ? .isSelected : AccessibilityTraits())
    }
}

@available(iOS 26.0, *)
@ViewBuilder
private func glassButton<Label: View>(
    prominent: Bool,
    accent: Color,
    circular: Bool,
    enabled: Bool,
    label: String,
    action: @escaping () -> Void,
    @ViewBuilder content: () -> Label
) -> some View {
    let shape: ButtonBorderShape = circular ? .circle : .capsule
    if prominent {
        Button(action: action, label: content)
            .buttonStyle(.glassProminent)
            .buttonBorderShape(shape)
            .tint(accent)
            .disabled(!enabled)
            .accessibilityLabel(label)
            .modifier(GlassPressHold())
    } else {
        Button(action: action, label: content)
            .buttonStyle(.glass)
            .buttonBorderShape(shape)
            .disabled(!enabled)
            .accessibilityLabel(label)
            .modifier(GlassPressHold())
    }
}

/// Keeps a pressed scale visible for a moment after the finger lifts, then
/// the shared tap path changes the page. Reduced Motion skips the hold.
@available(iOS 26.0, *)
private struct GlassPressHold: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var holding = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(holding ? 0.94 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.1), value: holding)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !reduceMotion { holding = true }
                    }
                    .onEnded { _ in
                        let delay = reduceMotion ? 0.0 : 0.12
                        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                            holding = false
                        }
                    }
            )
    }
}
