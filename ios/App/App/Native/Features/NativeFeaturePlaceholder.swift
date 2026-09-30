import SwiftUI

struct NativeFeaturePlaceholder: View {
    let tab: AppTab

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            NativeHeader(
                title: tab.title,
                trailing: [
                    NativeHeaderAction(
                        id: "user",
                        icon: .user,
                        accessibilityLabel: "User",
                        action: {}
                    )
                ],
                backgroundStyle: [.today, .calendar, .progress].contains(tab) ? .translucent : .clear
            )
            Spacer()
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
            Spacer()
        }
        .background(theme.background)
        .navigationBarHidden(true)
    }
}
