import SwiftUI

struct NativeSheetScaffold<Content: View>: View {
    let title: LocalizedStringKey
    var onClose: () -> Void
    var onConfirm: (() -> Void)?
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            NativeHeader(
                title: title,
                leading: [
                    NativeHeaderAction(
                        id: "close",
                        icon: .close,
                        accessibilityLabel: "Close",
                        action: onClose
                    )
                ],
                trailing: onConfirm.map { confirm in
                    [
                        NativeHeaderAction(
                            id: "confirm",
                            icon: .check,
                            accessibilityLabel: "Save",
                            prominent: true,
                            action: confirm
                        )
                    ]
                } ?? [],
                backgroundStyle: .translucent
            )
            Divider()
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .presentationCornerRadius(28)
        .modifier(NativeSheetBackground())
    }
}

private struct NativeSheetBackground: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // System sheets adopt the platform's native Liquid Glass surface.
            content
        } else {
            content.presentationBackground(.thickMaterial)
        }
    }
}

extension View {
    func nativeSheet<SheetContent: View>(
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        @ViewBuilder content: @escaping () -> SheetContent
    ) -> some View {
        sheet(isPresented: isPresented) {
            content()
                .presentationDetents(detents)
                .presentationDragIndicator(.visible)
        }
    }
}

struct NativeConfirmation {
    let title: LocalizedStringKey
    let message: LocalizedStringKey?
    let confirmTitle: LocalizedStringKey
    var destructive = false
}

extension View {
    func nativeConfirmationDialog(
        _ confirmation: NativeConfirmation,
        isPresented: Binding<Bool>,
        onConfirm: @escaping () -> Void
    ) -> some View {
        confirmationDialog(
            confirmation.title,
            isPresented: isPresented,
            titleVisibility: .visible
        ) {
            Button(confirmation.confirmTitle, role: confirmation.destructive ? .destructive : nil) {
                onConfirm()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let message = confirmation.message {
                Text(message)
            }
        }
    }
}
