import SwiftUI

struct NativeFloatingTabBar: View {
    let tabs: [AppTab]
    @Binding var selection: AppTab

    @State private var dragX: CGFloat?
    @State private var isDragging = false
    @State private var suppressTap = false

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let segmentWidth = width / CGFloat(max(tabs.count, 1))
            let selectedIndex = tabs.firstIndex(of: selection) ?? 0
            let selectedCenter = (CGFloat(selectedIndex) + 0.5) * segmentWidth
            let lensCenter = min(max(dragX ?? selectedCenter, segmentWidth / 2), width - segmentWidth / 2)

            ZStack {
                barSurface
                selectionLens(width: segmentWidth - 8)
                    .offset(x: lensCenter - width / 2)
                    .animation(
                        isDragging ? nil : .spring(response: 0.34, dampingFraction: 0.82),
                        value: lensCenter
                    )
                HStack(spacing: 0) {
                    ForEach(tabs) { tab in
                        tabButton(tab, highlighted: nearestTab(to: lensCenter, segmentWidth: segmentWidth) == tab)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 4, coordinateSpace: .local)
                    .onChanged { value in
                        isDragging = true
                        suppressTap = true
                        dragX = min(max(value.location.x, 0), width)
                    }
                    .onEnded { value in
                        let x = min(max(value.location.x, 0), width)
                        let target = nearestTab(to: x, segmentWidth: segmentWidth)
                        isDragging = false
                        dragX = nil
                        withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                            selection = target
                        }
                        DispatchQueue.main.async {
                            suppressTap = false
                        }
                    }
            )
        }
        .frame(height: 66)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Main navigation")
    }

    @ViewBuilder
    private var barSurface: some View {
        if #available(iOS 26.0, *) {
            Color.clear
                .glassEffect(.regular, in: Capsule())
        } else {
            Capsule()
                .fill(.thickMaterial)
                .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 0.75))
                .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
        }
    }

    @ViewBuilder
    private func selectionLens(width: CGFloat) -> some View {
        if #available(iOS 26.0, *) {
            NativeTabLens26(width: width)
        } else {
            Capsule()
                .fill(.regularMaterial)
                .overlay(Capsule().stroke(.white.opacity(0.5), lineWidth: 0.75))
                .shadow(color: .white.opacity(0.22), radius: 5)
                .frame(width: width, height: 56)
                .allowsHitTesting(false)
        }
    }

    private func tabButton(_ tab: AppTab, highlighted: Bool) -> some View {
        Button {
            guard !isDragging && !suppressTap else { return }
            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                selection = tab
            }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: tab.systemImage)
                    .font(.system(size: 19, weight: highlighted ? .semibold : .regular))
                Text(tab.title)
                    .font(.system(size: 10, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(highlighted ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color.primary))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(selection == tab ? .isSelected : [])
    }

    private func nearestTab(to x: CGFloat, segmentWidth: CGFloat) -> AppTab {
        guard !tabs.isEmpty else { return selection }
        let index = min(tabs.count - 1, max(0, Int(x / max(segmentWidth, 1))))
        return tabs[index]
    }
}

@available(iOS 26.0, *)
private struct NativeTabLens26: View {
    let width: CGFloat
    @Namespace private var lensNamespace

    var body: some View {
        GlassEffectContainer(spacing: 0) {
            Color.clear
                .frame(width: width, height: 56)
                .glassEffect(.clear.interactive(), in: Capsule())
                .glassEffectID("native-tab-selection", in: lensNamespace)
        }
        .allowsHitTesting(false)
    }
}
