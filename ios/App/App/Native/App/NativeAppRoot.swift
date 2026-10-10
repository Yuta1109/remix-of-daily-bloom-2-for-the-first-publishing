import SwiftUI

@MainActor
struct NativeAppRoot: View {
    @StateObject private var appState = AppState()

    var body: some View {
        AppThemeReader { theme in
            AppShell()
                .environmentObject(appState)
                .environmentObject(appState.planningSession)
                .preferredColorScheme(.light)
                .background(theme.background)
        }
    }
}
