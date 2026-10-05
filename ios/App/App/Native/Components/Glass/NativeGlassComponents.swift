import SwiftUI

enum NativeGlassFeedback {
    /// Matches the system glass press. Buttons that dismiss or navigate wait for this once.
    static let duration: TimeInterval = 0.22
    private static var isScheduled = false

    static func perform(_ action: @escaping () -> Void) {
        guard !isScheduled else { return }
        isScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            isScheduled = false
            action()
        }
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

    var body: some View {
        Button(action: invoke) {
            visual
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityLabel(accessibilityLabel)
    }

    private func invoke() {
        if waitsForGlassFeedback || icon == .back {
            NativeGlassFeedback.perform(action)
        } else {
            action()
        }
    }

    private var visual: some View {
        Image(systemName: icon.rawValue)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(prominent ? Color.white : (neutral ? Color(uiColor: .label) : PlanningPalette.accent))
            .frame(width: PlanningTokens.Header.buttonVisual, height: PlanningTokens.Header.buttonVisual)
            .modifier(PlanningIconGlass(prominent: prominent, tint: theme.accent))
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
                    .glassEffect(.regular.interactive(), in: Circle())
            } else {
                content.glassEffect(.regular.interactive(), in: Circle())
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

struct NativePeriodSelector: View {
    let title: String
    var action: () -> Void

    var body: some View {
        NativeGlassTextButton(title: LocalizedStringKey(title), action: action)
            .accessibilityLabel(Text(title))
    }
}
