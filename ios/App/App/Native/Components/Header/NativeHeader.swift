import SwiftUI

struct NativeHeaderAction: Identifiable {
    let id: String
    let icon: NativeGlassIcon
    let accessibilityLabel: LocalizedStringKey
    var prominent = false
    let action: () -> Void
}

enum NativeHeaderBackgroundStyle {
    case clear
    case translucent
}

struct NativeHeader: View {
    let title: LocalizedStringKey?
    var leading: [NativeHeaderAction] = []
    var trailing: [NativeHeaderAction] = []
    var backgroundStyle: NativeHeaderBackgroundStyle = .clear

    var body: some View {
        ZStack {
            if let title {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.primary)
                    .lineLimit(1)
                    .padding(.horizontal, 108)
            }
            HStack(spacing: 8) {
                actionGroup(leading)
                Spacer(minLength: 12)
                actionGroup(trailing)
            }
            .padding(.horizontal, 16)
        }
        .frame(minHeight: 52)
        .background {
            if backgroundStyle == .translucent {
                ZStack {
                    Rectangle()
                        .fill(Color.white)
                    Rectangle()
                        .fill(.ultraThinMaterial)
                }
                .ignoresSafeArea(edges: .top)
            }
        }
    }

    @ViewBuilder
    private func actionGroup(_ actions: [NativeHeaderAction]) -> some View {
        HStack(spacing: 8) {
            ForEach(actions) { item in
                NativeGlassIconButton(
                    icon: item.icon,
                    accessibilityLabel: item.accessibilityLabel,
                    prominent: item.prominent,
                    action: item.action
                )
            }
        }
    }
}
