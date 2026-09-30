import SwiftUI

struct AppTheme {
    let accent: Color
    let background: Color
    let foreground: Color
    let secondaryBackground: Color
    let secondaryForeground: Color

    static func system(colorScheme: ColorScheme) -> AppTheme {
        AppTheme(
            accent: Color(red: 0.916, green: 0.524, blue: 0.244),
            background: Color(uiColor: .systemBackground),
            foreground: Color(uiColor: .label),
            secondaryBackground: Color(uiColor: .secondarySystemBackground),
            secondaryForeground: Color(uiColor: .secondaryLabel)
        )
    }
}

private struct AppThemeKey: EnvironmentKey {
    static let defaultValue = AppTheme.system(colorScheme: .light)
}

extension EnvironmentValues {
    var appTheme: AppTheme {
        get { self[AppThemeKey.self] }
        set { self[AppThemeKey.self] = newValue }
    }
}

struct AppThemeReader<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @ViewBuilder var content: (AppTheme) -> Content

    var body: some View {
        let theme = AppTheme.system(colorScheme: colorScheme)
        content(theme)
            .environment(\.appTheme, theme)
            .tint(theme.accent)
    }
}
