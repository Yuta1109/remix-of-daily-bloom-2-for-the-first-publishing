import SwiftUI
import UIKit

enum PlanningPalette {
    static let paper = Color(red: 0.965, green: 0.941, blue: 0.902)
    static let card = Color(red: 0.992, green: 0.976, blue: 0.953)
    static let ink = Color(red: 0.227, green: 0.184, blue: 0.145)
    static let muted = Color(red: 0.478, green: 0.420, blue: 0.365)
    static let line = Color(red: 0.863, green: 0.816, blue: 0.745)
    static let plan = Color(red: 0.949, green: 0.780, blue: 0.745)
    static let future = Color(red: 0.780, green: 0.855, blue: 0.780)
    static let monthly = Color(red: 0.780, green: 0.835, blue: 0.910)
    static let weekly = Color(red: 0.910, green: 0.855, blue: 0.745)
    static let daily = Color(red: 0.910, green: 0.800, blue: 0.745)
    static let plus = Color(red: 0.870, green: 0.835, blue: 0.790)
    static let todo = Color(red: 0.980, green: 0.945, blue: 0.780)
    static let event = Color(red: 0.875, green: 0.855, blue: 0.945)
    static let rail = Color(red: 0.55, green: 0.42, blue: 0.32)
}

extension View {
    func planningScroll() -> some View {
        scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
    }

    func planningKeyboardDismiss() -> some View {
        background(PlanningKeyboardDismissInstaller().allowsHitTesting(false))
    }
}

struct PlanningKeyboardDismissInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = PlanningPassThroughView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

final class PlanningPassThroughView: UIView, UIGestureRecognizerDelegate {
    private static var installed = false

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard let window, !Self.installed else { return }
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        window.addGestureRecognizer(tap)
        Self.installed = true
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        nil
    }

    @objc private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var view = touch.view
        while let current = view {
            if current is UIControl || current is UITextView { return false }
            view = current.superview
        }
        return true
    }
}

/// Index tab: a rectangle with square left corners and rounded right corners.
/// It is deliberately not a trapezoid.
struct PlanningIndexTabShape: Shape {
    func path(in rect: CGRect) -> Path {
        let radius = PlanningTokens.Index.cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
            radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
            radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Open outline for the selected tab: top, rounded right side, bottom. No left edge,
/// so the tab flows into the page without a line at the seam.
struct PlanningIndexTabOutline: Shape {
    func path(in rect: CGRect) -> Path {
        let radius = PlanningTokens.Index.cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.minY + radius),
            radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(
            center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius),
            radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return path
    }
}

/// Chrome for native sheets and popups. Uses the system sheet surface
/// (not the Planning paper colour) and a fixed detent.
struct PlanningSystemSheetChrome<Content: View>: View {
    let height: CGFloat
    let onClose: () -> Void
    let onConfirm: () -> Void
    var confirmEnabled: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                NativeGlassIconButton(icon: .close, accessibilityLabel: "Close", action: onClose)
                Spacer()
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Confirm", prominent: true, action: onConfirm)
                    .disabled(!confirmEnabled)
                    .opacity(confirmEnabled ? 1 : 0.4)
            }
            .padding(.horizontal, PlanningTokens.Sheet.horizontalInset)
            .padding(.top, 8)
            content()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(height)])
        .presentationDragIndicator(.hidden)
    }
}

struct PlanningHeadingIconSlot: View {
    var body: some View {
        Color.clear
            .frame(width: 28, height: 28)
            .accessibilityHidden(true)
    }
}

enum PlanningCalendarGrid {
    static let rowCount = 6
    static let columnCount = 7

    static func matrix(year: Int, month: Int) -> [[Int?]] {
        let calendar = PeriodCalendar.calendar
        let start = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
        let dayCount = calendar.range(of: .day, in: .month, for: start)?.count ?? 30
        let weekday = calendar.component(.weekday, from: start)
        let leading = (weekday - calendar.firstWeekday + 7) % 7
        var cells = Array(repeating: Optional<Int>.none, count: rowCount * columnCount)
        for day in 1...dayCount {
            let index = leading + day - 1
            if index < cells.count { cells[index] = day }
        }
        return stride(from: 0, to: cells.count, by: columnCount).map { Array(cells[$0..<$0 + columnCount]) }
    }
}

extension PeriodCalendar {
    static func periodHasEnded(_ bucket: PlanningBucket, key: String, now: Date = Date()) -> Bool {
        let startOfToday = calendar.startOfDay(for: now)
        switch bucket {
        case .daily:
            guard let day = date(from: key) else { return false }
            return calendar.startOfDay(for: day) < startOfToday
        case .weekly:
            guard let start = date(from: key) else { return false }
            let end = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: start)) ?? start
            return end <= startOfToday
        case .monthly:
            let parts = monthParts(key)
            let start = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? now
            let next = calendar.date(byAdding: .month, value: 1, to: start) ?? start
            return next <= startOfToday
        }
    }
}

struct PlanningSheetChrome<Content: View>: View {
    let onClose: () -> Void
    let onConfirm: () -> Void
    var fixedHeight: CGFloat = 320
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                NativeGlassIconButton(icon: .close, accessibilityLabel: "Close", action: onClose)
                Spacer()
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: onConfirm)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            content()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(fixedHeight)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(PlanningPalette.paper)
        .planningKeyboardDismiss()
    }
}
