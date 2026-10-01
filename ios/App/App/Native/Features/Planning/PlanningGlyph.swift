import SwiftUI

struct PlanningGlyph: View {
    let section: PlanningSection

    var body: some View {
        PlanningGlyphShape(section: section)
            .stroke(style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            .frame(width: 28, height: 28)
            .accessibilityHidden(true)
    }
}

private struct PlanningGlyphShape: Shape {
    let section: PlanningSection

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch section {
        case .plan:
            path.move(to: CGPoint(x: rect.minX + 4, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.minY + 5))
            path.addLine(to: CGPoint(x: rect.maxX - 4, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - 5))
            path.closeSubpath()
        case .future:
            path.addArc(
                center: CGPoint(x: rect.midX, y: rect.maxY - 6),
                radius: rect.width * 0.38,
                startAngle: .degrees(200),
                endAngle: .degrees(340),
                clockwise: false
            )
            path.move(to: CGPoint(x: rect.midX, y: rect.minY + 4))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.midY))
        case .monthly:
            path.addEllipse(in: rect.insetBy(dx: 4, dy: 4))
            path.move(to: CGPoint(x: rect.midX, y: rect.minY + 4))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - 4))
            path.move(to: CGPoint(x: rect.minX + 4, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX - 4, y: rect.midY))
        case .weekly:
            path.move(to: CGPoint(x: rect.minX + 4, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX - 4, y: rect.midY))
            for step in 0..<4 {
                let x = rect.minX + 7 + CGFloat(step) * ((rect.width - 14) / 3)
                path.move(to: CGPoint(x: x, y: rect.midY - 7))
                path.addLine(to: CGPoint(x: x, y: rect.midY + 7))
            }
        case .daily:
            path.move(to: CGPoint(x: rect.midX, y: rect.minY + 3))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - 3))
            path.move(to: CGPoint(x: rect.minX + 3, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX - 3, y: rect.midY))
            path.addEllipse(in: rect.insetBy(dx: 9, dy: 9))
        case .plus:
            path.move(to: CGPoint(x: rect.midX, y: rect.minY + 6))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - 6))
            path.move(to: CGPoint(x: rect.minX + 6, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX - 6, y: rect.midY))
        }
        return path
    }
}
