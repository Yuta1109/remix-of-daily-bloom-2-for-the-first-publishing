import SwiftUI

struct AppShell: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            ForEach(appState.tabConfiguration.order) { tab in
                NativeTabRoot(
                    tab: tab,
                    navigation: appState.navigation(for: tab)
                )
                .tabItem {
                    Label(tab.title, systemImage: tab.systemImage)
                }
                .tag(tab)
            }
        }
        .modifier(NativeSystemTabChrome())
    }
}

/// System tab bar stays Apple-owned. iOS 26 uses the platform glass; earlier systems use material.
private struct NativeSystemTabChrome: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.toolbarBackground(.automatic, for: .tabBar)
        } else {
            content
                .toolbarBackground(.visible, for: .tabBar)
                .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        }
    }
}

private struct NativeTabRoot: View {
    let tab: AppTab
    @ObservedObject var navigation: TabNavigationState

    var body: some View {
        // The environment object must wrap the NavigationStack itself.
        // Pushed destinations do not inherit objects applied to the root content,
        // which crashed Planning Back buttons with a missing EnvironmentObject.
        NavigationStack(path: $navigation.path) {
            nativeFeatureRoot(for: tab)
        }
        .environmentObject(navigation)
    }
}
