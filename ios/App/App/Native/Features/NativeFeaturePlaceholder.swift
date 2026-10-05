import SwiftUI

struct NativeFeaturePlaceholder: View {
    let tab: AppTab

    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(theme.accent)
                Text(tab.title)
                    .font(.title3.weight(.semibold))
                Text("Native screen foundation")
                    .font(.footnote)
                    .foregroundStyle(theme.secondaryForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .planningFixedHeader {
            NativeHeader(
                title: tab.title,
                trailing: [
                    NativeHeaderAction(
                        id: "user",
                        icon: .user,
                        accessibilityLabel: "User",
                        action: {}
                    )
                ]
            )
        }
        .planningExtendingSurface(theme.background)
        .navigationBarHidden(true)
    }
}
