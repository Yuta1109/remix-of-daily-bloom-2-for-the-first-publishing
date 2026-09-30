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
    }
}

private struct NativeTabRoot: View {
    let tab: AppTab
    @ObservedObject var navigation: TabNavigationState

    var body: some View {
        NavigationStack(path: $navigation.path) {
            nativeFeatureRoot(for: tab)
        }
    }
}
