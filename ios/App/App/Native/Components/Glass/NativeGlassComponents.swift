import SwiftUI

enum NativeGlassIcon: String {
    case back = "chevron.backward"
    case close = "xmark"
    case check = "checkmark"
    case user = "person.crop.circle"
    case help = "questionmark"
    case search = "magnifyingglass"
}

struct NativeGlassIconButton: View {
    let icon: NativeGlassIcon
    let accessibilityLabel: LocalizedStringKey
    var prominent = false
    var action: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        if #available(iOS 26.0, *) {
            if prominent {
                Button(action: action) {
                    label
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .tint(theme.accent)
                .accessibilityLabel(accessibilityLabel)
            } else {
                Button(action: action) {
                    label
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .accessibilityLabel(accessibilityLabel)
            }
        } else {
            Button(action: action) {
                Image(systemName: icon.rawValue)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(prominent ? Color.white : theme.foreground)
                    .frame(width: 40, height: 40)
                    .background(
                        Circle().fill(prominent ? AnyShapeStyle(theme.accent) : AnyShapeStyle(.thinMaterial))
                    )
                    .overlay(Circle().stroke(.white.opacity(0.24), lineWidth: 0.5))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibilityLabel)
        }
    }

    private var label: some View {
        Image(systemName: icon.rawValue)
            .font(.system(size: 16, weight: .semibold))
            .frame(width: 40, height: 40)
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
