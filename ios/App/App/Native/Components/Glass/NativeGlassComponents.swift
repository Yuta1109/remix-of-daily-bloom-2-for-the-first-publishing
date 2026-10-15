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

struct PlanningMenuChoice: Identifiable {
    let id: String
    let title: String
    let symbol: String
    let action: () -> Void
}

/// System menu. iOS 26 draws the trigger with Liquid Glass; the system owns the presentation.
struct PlanningNativeAddMenu: View {
    /// Visible glass circle. `.controlSize(.large)` is omitted because it adds padding around this frame.
    static let diameter: CGFloat = 50
    var accessibilityLabel: String
    let actions: [PlanningMenuChoice]

    var body: some View {
        Menu {
            ForEach(actions) { item in
                Button(action: item.action) {
                    Label(item.title, systemImage: item.symbol)
                }
            }
        } label: {
            plusLabel
        }
        .modifier(PlanningNativeMenuStyle())
        .accessibilityLabel(accessibilityLabel)
    }

    private var plusLabel: some View {
        Image(systemName: "plus")
            .font(.system(size: 21, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: Self.diameter, height: Self.diameter)
            .background {
                if #available(iOS 26.0, *) {
                    Color.clear
                } else {
                    Circle().fill(PlanningPalette.accent)
                }
            }
    }
}

private struct PlanningNativeMenuStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .tint(PlanningPalette.accent)
        } else {
            content.buttonStyle(.plain)
        }
    }
}

/// Sheet header menu. Uses the same system circle as the prominent sheet button, not the 50 pt floating plus.
struct PlanningSheetAddMenu: View {
    var accessibilityLabel: String
    let actions: [PlanningMenuChoice]
    @Environment(\.appTheme) private var theme

    var body: some View {
        Menu {
            ForEach(actions) { item in
                Button(action: item.action) {
                    Label(item.title, systemImage: item.symbol)
                }
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.white)
        }
        .modifier(PlanningSheetMenuStyle(tint: theme.accent))
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct PlanningSheetMenuStyle: ViewModifier {
    var tint: Color

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .tint(tint)
        } else {
            content
                .buttonStyle(.plain)
                .frame(width: PlanningTokens.Header.buttonVisual, height: PlanningTokens.Header.buttonVisual)
                .background(Circle().fill(tint))
        }
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
