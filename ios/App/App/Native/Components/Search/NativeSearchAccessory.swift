import SwiftUI

struct NativeSearchAccessory: View {
    @Binding var query: String
    var prompt: LocalizedStringKey = "Search"
    var onSubmit: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            searchField
            NativeGlassIconButton(icon: .close, accessibilityLabel: "Clear") {
                query = ""
            }
            .disabled(query.isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var searchField: some View {
        let field = HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField(prompt, text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit { onSubmit?() }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 44)

        if #available(iOS 26.0, *) {
            field.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            field
                .background(Capsule().fill(.thickMaterial))
                .overlay(Capsule().stroke(.white.opacity(0.24), lineWidth: 0.5))
        }
    }
}

extension View {
    /// Uses the system keyboard toolbar, so keyboard appearance and interactive
    /// dismissal move the accessory without keyboard-frame calculations.
    func nativeSearchAccessory(
        query: Binding<String>,
        prompt: LocalizedStringKey = "Search",
        onSubmit: (() -> Void)? = nil
    ) -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                NativeSearchAccessory(query: query, prompt: prompt, onSubmit: onSubmit)
            }
        }
    }
}
