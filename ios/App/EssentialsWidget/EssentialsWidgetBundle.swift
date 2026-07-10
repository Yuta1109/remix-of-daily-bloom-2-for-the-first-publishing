import WidgetKit
import SwiftUI

@main
struct EssentialsWidgetBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        if #available(iOS 16.1, *) {
            EssentialsWidgetLiveActivity()
        }
    }
}
