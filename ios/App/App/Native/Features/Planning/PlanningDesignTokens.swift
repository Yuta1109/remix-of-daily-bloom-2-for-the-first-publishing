import SwiftUI

/// Single source of truth for Planning Blueprint 1 geometry.
/// Reference device: iPhone 13, 390 x 844 pt. See PLANNING_VISUAL_SPEC.md.
/// Do not scatter these numbers through views.
enum PlanningTokens {
    /// Content inset shared by every Planning page body.
    static let contentInset: CGFloat = 16

    enum Header {
        static let height: CGFloat = 72
        static let titleSize: CGFloat = 34
        static let buttonVisual: CGFloat = 44
        static let buttonHit: CGFloat = 44
        /// Visual gap between the 44pt circles.
        static let buttonGap: CGFloat = 10
        /// Stack spacing that yields `buttonGap` between visual circles.
        static let buttonStackSpacing: CGFloat = buttonGap - (buttonHit - buttonVisual)
    }

    enum Index {
        static let trailingMargin: CGFloat = 4
        /// 28 × 1.10. The extra width grows inward; `trailingMargin` stays the screen-edge gap.
        static let depth: CGFloat = 30.8
        /// 75 × 1.20. The 2 pt gap between tabs is unchanged.
        static let length: CGFloat = 90
        static let gap: CGFloat = 2
        static let topGap: CGFloat = 2
        static let cornerRadius: CGFloat = 7.5
        static let fontSize: CGFloat = 13.5
        static let seamWidth: CGFloat = 2
        static let outlineWidth: CGFloat = 1.5
        static var columnWidth: CGFloat { depth + trailingMargin }
    }

    enum PlanMain {
        static let titleTop: CGFloat = 35
        static let iconSlot: CGFloat = 28
        static let iconGap: CGFloat = 10
        static let titleSize: CGFloat = 20
        static let titleToParagraph: CGFloat = 17.5
        static let paragraphSize: CGFloat = 15.5
        static let paragraphLineSpacing: CGFloat = 4.5
        static let paragraphToButton: CGFloat = 31
        static let buttonHeight: CGFloat = 52
        static let buttonCorner: CGFloat = 14
        static let buttonFontSize: CGFloat = 17
        static let buttonToList: CGFloat = 39
        static let listCorner: CGFloat = 15.5
        static let listPadding: CGFloat = 10
        static let listHeaderSize: CGFloat = 17
        static let previewLimit = 5
        static let cardMinHeight: CGFloat = 75
        static let cardCorner: CGFloat = 11.5
        static let cardGap: CGFloat = 6
        static let cardInset: CGFloat = 9
        static let cardIcon: CGFloat = 44
        static let chevronHit: CGFloat = 44
    }

    enum Search {
        static let height: CGFloat = 38
        static let inset: CGFloat = 16
        static let topGap: CGFloat = 10
    }

    enum Editor {
        static let fieldHeight: CGFloat = 46
        static let iconCell: CGFloat = 44
        static let parentRowHeight: CGFloat = 32
        static let outlineRowSpacing: CGFloat = 2
        static let parentBulletInset: CGFloat = 6
        static let subtaskIndent: CGFloat = 28
        static let subpageTopGap: CGFloat = 8
        static let colorCell: CGFloat = 44
        static let colorGap: CGFloat = 9
        static let memoMinHeight: CGFloat = 90
        static let ctaHeight: CGFloat = 51
        static let ctaCorner: CGFloat = 15
        static let ctaInset: CGFloat = 16
        static let sectionGap: CGFloat = 20
    }

    /// Period label sits in the center. Arrow zones stay fixed on the left and right.
    enum PeriodSelector {
        static let arrowZone: CGFloat = 44
        static let labelScaleFloor: CGFloat = 0.75
    }

    /// Reflection-due card. Height is 1.5×–2.0× the visible system tab-menu height, never the 90 pt index tab.
    enum ReflectionDue {
        static let minimumMultiple: CGFloat = 1.5
        static let maximumMultiple: CGFloat = 2.0
        /// Visible UITabBar menu height used until the live bar is measured.
        static let tabBarFallback: CGFloat = 49
        /// Title, two-line explanation, and action, with compact padding.
        static let contentNeed: CGFloat = 96

        static func height(tabBar: CGFloat) -> CGFloat {
            let bar = tabBar > 1 ? tabBar : tabBarFallback
            let low = bar * minimumMultiple
            let high = bar * maximumMultiple
            return min(high, max(low, contentNeed))
        }
    }

    enum Future {
        static let titleSize: CGFloat = 21.5
        static let iconGap: CGFloat = 10
        static let descriptionGap: CGFloat = 11
        static let descriptionSize: CGFloat = 15
        static let descriptionLineSpacing: CGFloat = 3.5
        static let yearGap: CGFloat = 20
        static let columnGap: CGFloat = 7.5
        static let rowGap: CGFloat = 8
        static let cardHeight: CGFloat = 120
        static let cardRadius: CGFloat = 11.5
        static let trailingInset: CGFloat = 9
        static let monthFont: CGFloat = 14.5
        static let weekdayFont: CGFloat = 7.5
        static let dateFont: CGFloat = 8.5
        static let sheetTopGap: CGFloat = 20
        static let goalMinHeight: CGFloat = 74
    }

    enum Sheet {
        static let horizontalInset: CGFloat = 16
        /// Distance from the sheet top to the × / ✓ row. The row is centered by matching space below.
        static let headerTop: CGFloat = 16
        /// 16 pt top + 44 pt control + 16 pt bottom.
        static let headerHeight: CGFloat = 76
        static let controlDiameter: CGFloat = 44
        static let topInset: CGFloat = 18
        static let sectionSpacing: CGFloat = 22
        static let bottomInset: CGFloat = 20
        static let rowHeight: CGFloat = 46
        /// Tallest fitted Planning sheet. Content scrolls inside instead of growing to full screen.
        static let maximumBody: CGFloat = 640
        static let calendarHeight: CGFloat = 392
        static let timeWheelHeight: CGFloat = 148
    }
}
