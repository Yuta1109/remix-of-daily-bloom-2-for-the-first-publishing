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
                .tag(tab)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            NativeFloatingTabBar(
                tabs: appState.tabConfiguration.order,
                selection: $appState.selectedTab
            )
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .padding(.bottom, 6)
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
