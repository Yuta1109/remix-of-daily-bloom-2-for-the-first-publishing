import SwiftUI

/// Shared native Liquid Glass controls.
///
/// Every screen asks for a role (`back`, `close`, `check`, `icon`, `button`,
/// `search`, `tabBar`, `surface`). There is one layer and one
/// `GlassEffectContainer`, so nearby controls share a material and can morph
/// later via `glassEffectID`. Pages do not declare their own glass.
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

/// One glass layer for the whole window. Control ids stay stable so a later
/// screen can morph an existing back, close, check, or tab instead of
/// inventing a new material.
@available(iOS 26.0, *)
struct NativeGlassLayer: View {
    @ObservedObject var model: NativeGlassSceneModel
    @Namespace private var glassNamespace

    var body: some View {
        GlassEffectContainer(spacing: 16) {
            ZStack(alignment: .topLeading) {
                ForEach(model.controls) { spec in
                    control(spec)
                        .frame(width: max(spec.width, 1), height: max(spec.height, 1))
                        .glassEffectID(spec.id, in: glassNamespace)
                        .position(x: spec.x + spec.width / 2, y: spec.y + spec.height / 2)
                        .allowsHitTesting(spec.role != "surface")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
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
                accent: accent
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
            NativeLiquidGlassTabBar(tabs: spec.tabs, accent: accent) { id in
                model.onTap(id)
            }
        case "surface":
            NativeLiquidGlassSurface()
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
                    .padding(.horizontal, 4)
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
    var action: () -> Void

    var body: some View {
        glassButton(prominent: prominent, accent: accent, circular: true, enabled: enabled, label: label, action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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

/// Non-interactive plate. It does not take taps, so a form under it stays usable
/// only when the plate is chrome with no text of its own. Sheet bodies stay in
/// the web view for that reason.
@available(iOS 26.0, *)
struct NativeLiquidGlassSurface: View {
    var body: some View {
        Color.clear
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

@available(iOS 26.0, *)
struct NativeLiquidGlassTabBar: View {
    var tabs: [NativeGlassTab]
    var accent: Color
    var onSelect: (String) -> Void

    private var textual: Bool {
        tabs.allSatisfy { $0.symbol.isEmpty }
    }

    var body: some View {
        Group {
            if textual {
                textBar
            } else {
                iconBar
            }
        }
        .glassEffect(.regular.interactive(), in: Capsule())
    }

    private var textBar: some View {
        HStack(spacing: 4) {
            ForEach(tabs) { tab in
                segment(tab, icon: false)
            }
        }
        .padding(4)
    }

    private var iconBar: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                segment(tab, icon: true)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    private func segment(_ tab: NativeGlassTab, icon: Bool) -> some View {
        Button {
            onSelect(tab.id)
        } label: {
            Group {
                if icon {
                    VStack(spacing: 2) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 18, weight: tab.selected ? .semibold : .regular))
                        Text(tab.label)
                            .font(.system(size: 10, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                } else {
                    Text(tab.label)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.horizontal, 4)
                }
            }
            .foregroundStyle(tab.selected ? (icon ? accent : Color.primary) : Color.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                if tab.selected {
                    Color.clear
                        .glassEffect(.regular.interactive(), in: Capsule())
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.label)
        .accessibilityAddTraits(tab.selected ? .isSelected : AccessibilityTraits())
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
    } else {
        Button(action: action, label: content)
            .buttonStyle(.glass)
            .buttonBorderShape(shape)
            .disabled(!enabled)
            .accessibilityLabel(label)
    }
}
