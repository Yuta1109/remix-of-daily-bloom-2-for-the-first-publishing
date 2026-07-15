import WidgetKit
import SwiftUI

@main
struct EssencesWidgetBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        if #available(iOS 16.1, *) {
            EssencesWidgetLiveActivity()
        }
    }
}
