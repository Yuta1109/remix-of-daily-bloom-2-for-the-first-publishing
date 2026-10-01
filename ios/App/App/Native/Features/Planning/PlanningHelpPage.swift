import SwiftUI

struct PlanningHelpPage: View {
    @EnvironmentObject private var navigation: TabNavigationState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                    if !navigation.path.isEmpty {
                        navigation.path.removeLast()
                    }
                }
                Text("Planningの使い方")
                    .font(.largeTitle.bold())
                Text("EssencesのPlanningは、頭の中にあることを整理し、「いつやるか」「次にどうするか」を少しずつ決めていく場所です。")
                Text("バレットジャーナルの考え方を参考にしていますが、すべてのページを毎日使う必要はありません。自分に必要なページだけ使ってください。")
                helpSection("Plan", "まずは考えていることを自由に箇条書きします。最大3段階まで整理できます。\n\n書いた項目は、1項目だけでも、まとまりでも、必要なら全体でもMonthly / Weeklyへ移せます。")
                helpSection("Future", "1年を大きく見渡すページです。月ごとの目標、先に決まっている予定、ざっくりした見通しを残します。")
                helpSection("Monthly", "今月やりたいことと予定を整理します。Planから持ってきても、その場で追加しても、先送りボックスから戻しても構いません。")
                helpSection("Weekly", "Monthlyを今週できる大きさへ分けるためのページです。Weeklyを使わない場合はSettingsから無効にできます。")
                helpSection("Daily", "今日やることを決めます。Monthly / Weeklyから選ぶ、新しく追加する、先送りボックスから戻す、という方法があります。\n\nDailyの完了チェックはPlanningではなくTodayタブで行います。")
                helpSection("Reflection", "期間が終わったら、必要に応じて振り返ります。\n\n各項目について、維持、先送り、終了を決めます。\n\nこれは「完了したかどうか」とは別の判断です。\n\n振り返り後、必要ならReplanできます。Replanは必須ではありません。")
                helpSection("Postpone Box", "次にどうするかまだ決めなかったタスクや予定を一時的に置いておく場所です。\n\nMonthly / Weekly / Dailyごとに整理され、タスクと予定は別々に管理します。")
                helpSection("おすすめの流れ", "Plan → Monthly / Weekly → Daily → Todayで実行 → Reflection → 必要ならReplan\n\nこれはおすすめの流れであり、強制ではありません。")
                Text("Planningは予定通りに進めるためだけの機能ではありません。予定が変わったときに、もう一度考え直すためにも使ってください。")
                    .foregroundStyle(.secondary)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationBarHidden(true)
    }

    private func helpSection(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title3.weight(.semibold))
            Text(body)
        }
    }
}
