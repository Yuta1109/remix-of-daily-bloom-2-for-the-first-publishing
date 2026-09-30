import SwiftUI

@MainActor
final class TabNavigationState: ObservableObject {
    @Published var path = NavigationPath()
    /// Feature views can opt into restoration without changing the app shell.
    @Published var scrollPositions: [String: CGFloat] = [:]
    @Published var selectedValues: [String: String] = [:]

    func reset() {
        path = NavigationPath()
        scrollPositions.removeAll()
        selectedValues.removeAll()
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var tabConfiguration: AppTabConfiguration
    @Published var selectedTab: AppTab

    let dataAdapter: any NativeDataAdapter
    private var navigationByTab: [AppTab: TabNavigationState]

    init(
        tabConfiguration: AppTabConfiguration = .standard,
        dataAdapter: any NativeDataAdapter = EmptyNativeDataAdapter()
    ) {
        self.tabConfiguration = tabConfiguration
        self.selectedTab = tabConfiguration.launchTab
        self.dataAdapter = dataAdapter
        self.navigationByTab = Dictionary(
            uniqueKeysWithValues: AppTab.allCases.map { ($0, TabNavigationState()) }
        )
    }

    func navigation(for tab: AppTab) -> TabNavigationState {
        if let state = navigationByTab[tab] { return state }
        let state = TabNavigationState()
        navigationByTab[tab] = state
        return state
    }

    func apply(_ configuration: AppTabConfiguration) {
        tabConfiguration = configuration
        if !configuration.order.contains(selectedTab) {
            selectedTab = configuration.launchTab
        }
    }
}
