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

    /// Pops one Planning route. Safe when the path is already empty or the
    /// back button fires twice before SwiftUI publishes the first pop.
    func pop() {
        guard !isPopping, path.count > 0 else { return }
        isPopping = true
        // The toolbar Back action arrives while the navigation bar is still
        // resolving the tap. removeLast() in that same turn is dropped.
        // The next turn commits one pop. isPopping stays set until then.
        DispatchQueue.main.async {
            if self.path.count > 0 {
                self.path.removeLast()
            }
            self.isPopping = false
        }
    }

    private var isPopping = false
}

@MainActor
final class AppState: ObservableObject {
    @Published var tabConfiguration: AppTabConfiguration
    @Published var selectedTab: AppTab

    let dataAdapter: any NativeDataAdapter
    /// One Planning/Today task store. Both tabs observe this instance.
    let planningSession = PlanningSession()
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
