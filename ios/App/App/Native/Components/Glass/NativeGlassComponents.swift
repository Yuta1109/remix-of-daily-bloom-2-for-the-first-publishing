import SwiftUI
import UIKit

enum PlanningHaptics {
    /// One light tick for a successful, user-initiated checkbox change.
    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

enum NativeGlassFeedback {
    /// Visual delay only. It does not decide whether a tap counts, and it does not lock other controls.
    static let duration: TimeInterval = 0.22

    static func perform(_ action: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: action)
    }
}

/// Leaves the current screen or sheet. The keyboard resigns before the glass delay, then navigation runs once.
enum PlanningTransition {
    static func perform(_ action: @escaping () -> Void) {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        NativeGlassFeedback.perform(action)
    }
}

enum NativeGlassIcon: String {
    case back = "chevron.backward"
    case close = "xmark"
    case check = "checkmark"
    case user = "person.crop.circle"
    case help = "questionmark"
    case search = "magnifyingglass"
    case postpone = "tray"
    case plus = "plus"
    case clock = "clock"
}

struct NativeGlassIconButton: View {
    let icon: NativeGlassIcon
    let accessibilityLabel: LocalizedStringKey
    var prominent = false
    /// Sheet × uses a neutral symbol. Planning header symbols stay accent.
    var neutral = false
    var waitsForGlassFeedback = false
    var action: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var transitionPending = false

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                if prominent {
                    Button(action: invoke) {
                        Image(systemName: icon.rawValue)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Color.white)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .tint(theme.accent)
                } else {
                    Button(action: invoke) {
                        Image(systemName: icon.rawValue)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(neutral ? Color(uiColor: .label) : PlanningPalette.accent)
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                }
            } else {
                // fallback platter
                Button(action: invoke) {
                    symbol.modifier(PlanningIconGlass(prominent: prominent, tint: theme.accent))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityLabel(accessibilityLabel)
    }

    private func invoke() {
        guard !transitionPending else { return }
        if waitsForGlassFeedback || icon == .back {
            transitionPending = true
            PlanningTransition.perform {
                transitionPending = false
                action()
            }
        } else {
            action()
        }
    }

    private var symbol: some View {
        Image(systemName: icon.rawValue)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(prominent ? Color.white : (neutral ? Color(uiColor: .label) : PlanningPalette.accent))
            .frame(width: PlanningTokens.Header.buttonVisual, height: PlanningTokens.Header.buttonVisual)
    }
}

/// Glass stays on the one 44 pt circle. The outer button does not receive a glass style.
private struct PlanningIconGlass: ViewModifier {
    var prominent: Bool
    var tint: Color

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if prominent {
                content
                    .background(Circle().fill(tint))
                    .glassEffect(.regular, in: Circle())
            } else {
                content.glassEffect(.regular, in: Circle())
            }
        } else {
            content
                .background(Circle().fill(prominent ? AnyShapeStyle(tint) : AnyShapeStyle(.thinMaterial)))
                .overlay(Circle().stroke(.white.opacity(0.24), lineWidth: 0.5))
        }
    }
}

struct NativeGlassTextButton: View {
    let title: LocalizedStringKey
    var accentTint = false
    var action: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        if #available(iOS 26.0, *) {
            if accentTint {
                Button(title, action: action)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.capsule)
                    .tint(theme.accent)
            } else {
                Button(title, action: action)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.glass)
                    .buttonBorderShape(.capsule)
            }
        } else {
            Button(title, action: action)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(accentTint ? Color.white : theme.foreground)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Capsule().fill(accentTint ? AnyShapeStyle(theme.accent) : AnyShapeStyle(.thinMaterial)))
                .overlay(Capsule().stroke(.white.opacity(0.24), lineWidth: 0.5))
                .buttonStyle(.plain)
        }
    }
}

struct PlanningMorphAction: Identifiable {
    let id: String
    let title: String
    let symbol: String
    let action: () -> Void
}

/// One glass surface that replaces its circular source. iOS 26 morphs that surface with
/// `glassEffectTransition(.matchedGeometry)`. Earlier systems swap in a material menu.
struct PlanningGlassMorphMenu: View {
    @Binding var isPresented: Bool
    var identity: String
    var sourceDiameter: CGFloat = 52
    var expandsUpward = true
    var accessibilityLabel: String
    let actions: [PlanningMorphAction]
    @Namespace private var morph
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        morphBody
            .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.86), value: isPresented)
    }

    @ViewBuilder
    private var morphBody: some View {
        if #available(iOS 26.0, *) {
            PlanningGlassMorphSurface(
                isPresented: $isPresented,
                identity: identity,
                sourceDiameter: sourceDiameter,
                expandsUpward: expandsUpward,
                accessibilityLabel: accessibilityLabel,
                actions: actions,
                morph: morph
            )
        } else {
            fallback
        }
    }

    private var fallback: some View {
        ZStack(alignment: expandsUpward ? .bottomTrailing : .topTrailing) {
            if isPresented {
                PlanningMorphMenuRows(actions: actions) { isPresented = false }
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.45), lineWidth: 0.6))
            } else {
                PlanningMorphSourceButton(diameter: sourceDiameter, accessibilityLabel: accessibilityLabel) { isPresented = true }
                    .background(Circle().fill(PlanningPalette.accent))
            }
        }
    }
}

@available(iOS 26.0, *)
private struct PlanningGlassMorphSurface: View {
    @Binding var isPresented: Bool
    var identity: String
    var sourceDiameter: CGFloat
    var expandsUpward: Bool
    var accessibilityLabel: String
    let actions: [PlanningMorphAction]
    var morph: Namespace.ID

    var body: some View {
        GlassEffectContainer(spacing: 0) {
            ZStack(alignment: expandsUpward ? .bottomTrailing : .topTrailing) {
                if isPresented {
                    PlanningMorphMenuRows(actions: actions) { isPresented = false }
                        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .glassEffectID(identity, in: morph)
                        .glassEffectTransition(.matchedGeometry)
                } else {
                    PlanningMorphSourceButton(diameter: sourceDiameter, accessibilityLabel: accessibilityLabel) { isPresented = true }
                        .background(Circle().fill(PlanningPalette.accent))
                        .glassEffect(.regular.interactive(), in: Circle())
                        .glassEffectID(identity, in: morph)
                        .glassEffectTransition(.matchedGeometry)
                }
            }
        }
    }
}

private struct PlanningMorphSourceButton: View {
    let diameter: CGFloat
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: diameter > 48 ? 24 : 20, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: diameter, height: diameter)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct PlanningMorphMenuRows: View {
    let actions: [PlanningMorphAction]
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(actions) { item in
                Button {
                    close()
                    item.action()
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: item.symbol)
                            .font(.system(size: 20))
                            .frame(width: 23, height: 23)
                        Text(item.title)
                            .font(.system(size: 17))
                            .foregroundStyle(PlanningPalette.ink)
                    }
                    .padding(.horizontal, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.title)
            }
        }
        .padding(.vertical, 6)
        .frame(width: 262)
    }
}

struct NativePeriodSelector: View {
    let title: String
    var action: () -> Void

    var body: some View {
        NativeGlassTextButton(title: LocalizedStringKey(title), action: action)
            .accessibilityLabel(Text(title))
    }
}
