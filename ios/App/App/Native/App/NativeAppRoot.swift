import SwiftUI

struct NativeAppRoot: View {
    @StateObject private var appState: AppState

    init(appState: AppState = AppState()) {
        _appState = StateObject(wrappedValue: appState)
    }

    var body: some View {
        AppThemeReader { theme in
            AppShell()
                .environmentObject(appState)
                .preferredColorScheme(nil)
                .background(theme.background)
        }
    }
}
