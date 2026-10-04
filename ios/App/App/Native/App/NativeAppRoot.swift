import SwiftUI

@MainActor
struct NativeAppRoot: View {
    @StateObject private var appState = AppState()

    var body: some View {
        AppThemeReader { theme in
            AppShell()
                .environmentObject(appState)
                .preferredColorScheme(.light)
                .background(theme.background)
        }
    }
}
