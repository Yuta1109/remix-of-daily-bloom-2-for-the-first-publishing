import Foundation

/// Japanese / English strings for Planning Blueprint 1 screens.
/// The project has no String Catalog registered in the Xcode project, so the
/// table lives in code and resolves from `Bundle.main.preferredLocalizations`
/// (CFBundleLocalizations: ja, en). Index tab labels are never localized.
enum PlanningText {
    enum Key: String {
        case planIntroTitle, planIntroBody, newPlanButton
        case planListTitle, noPlans, lastUpdated, replanCount
        case searchPlans, noSearchResults
        case newPlan, editPlan
        case titleLabel, titlePlaceholder, iconLabel, colorLabel, bulletsLabel, memoLabel
        case parentPlaceholder, subtaskPlaceholder
        case reflectToItems, save, selectItemsTitle, selectAll, chooseDestination
        case discardTitle, cancel, discard
        case destinationKind, destinationScope, destinationPeriod
        case task, event
        case destinationNoteTask, destinationNoteEvent
        case planningHelpTitle
        case futureDescription, monthGoal, monthEvents, noEvents
        case monthlyDescription, weeklyDescription, dailyDescription
        case addEvent, editEvent, startLabel, endLabel, unset
        case reflectionTitle, reflectionExplain, confirmReflection
        case reflectionResult, keepCount, postponeCount, stopCount
        case monthlyDueTitle, monthlyDueBody, weeklyDueTitle, weeklyDueBody, dailyDueTitle, dailyDueBody
        case startReflection
        case monthlyEmptyTitle, weeklyEmptyTitle, dailyEmptyTitle
        case monthlyEmptyBody, weeklyEmptyBody, dailyEmptyBody
        case photoAndLine, anythingDiary
    }

    private static let table: [Key: (ja: String, en: String)] = [
        .planIntroTitle: ("今、考えていることを整理しよう", "Sort out what is on your mind"),
        .planIntroBody: (
            "頭の中にあることを書き出して、プランとして残しましょう。あとから Monthly / Weekly / Daily に反映できます。",
            "Write down what is in your head and keep it as a plan. You can copy it to Monthly, Weekly, or Daily later."
        ),
        .newPlanButton: ("プランを新規作成", "Create a new plan"),
        .planListTitle: ("プランの一覧", "Plans"),
        .noPlans: ("まだプランはありません", "No plans yet"),
        .lastUpdated: ("最終更新日", "Last updated"),
        .replanCount: ("リプラン数", "Replans"),
        .searchPlans: ("プランを検索…", "Search plans…"),
        .noSearchResults: ("該当するプランはありません", "No matching plans"),
        .newPlan: ("新規プラン", "New Plan"),
        .editPlan: ("プランを編集", "Edit Plan"),
        .titleLabel: ("タイトル", "Title"),
        .titlePlaceholder: ("タイトルを入力", "Enter a title"),
        .iconLabel: ("アイコン", "Icon"),
        .colorLabel: ("カラー", "Color"),
        .bulletsLabel: ("やること・考えていること", "To do / on your mind"),
        .memoLabel: ("メモ", "Memo"),
        .parentPlaceholder: ("やること・考えていること", "Something to do or think about"),
        .subtaskPlaceholder: ("サブタスク", "Subtask"),
        .reflectToItems: ("タスク・予定に反映", "Reflect to tasks / events"),
        .save: ("保存", "Save"),
        .selectItemsTitle: ("反映する項目を選択", "Select items to reflect"),
        .selectAll: ("全体を選択", "Select all"),
        .chooseDestination: ("反映先を選ぶ", "Choose destination"),
        .discardTitle: ("この変更を破棄しますか？", "Discard these changes?"),
        .cancel: ("キャンセル", "Cancel"),
        .discard: ("破棄", "Discard"),
        .destinationKind: ("1. 反映先の種類", "1. Destination type"),
        .destinationScope: ("2. 反映先のスコープ", "2. Destination scope"),
        .destinationPeriod: ("3. 期間を選択", "3. Choose a period"),
        .task: ("タスク", "Task"),
        .event: ("予定", "Event"),
        .destinationNoteTask: ("選択した項目は、指定した期間のタスクにコピーされます。", "Selected items are copied to tasks in the chosen period."),
        .destinationNoteEvent: ("選択した項目は、指定した期間の予定にコピーされます。", "Selected items are copied to events in the chosen period."),
        .planningHelpTitle: ("Planning の使い方", "How to use Planning"),
        .monthlyDescription: (
            "今月の予定ややることを整理して、1か月の流れを見通しましょう。",
            "Sort this month’s events and tasks so you can see the month ahead."
        ),
        .weeklyDescription: (
            "今週の予定ややることを整理して、1週間の流れを見通しましょう。",
            "Sort this week’s events and tasks so you can see the week ahead."
        ),
        .dailyDescription: (
            "今日の予定とやることを確認して、1日の流れを整えましょう。",
            "Check today’s events and tasks so the day has a clear shape."
        ),
        .futureDescription: (
            "これからの1年を見通して、それぞれの月の予定や大まかな予定を立てましょう！",
            "Look across the coming year and sketch the plans and rough schedule for each month."
        ),
        .monthGoal: ("今月の目標", "Goal for this month"),
        .monthEvents: ("今月の予定", "Events this month"),
        .noEvents: ("まだ予定はありません", "No events yet"),
        .addEvent: ("予定を追加", "Add event"),
        .editEvent: ("予定を編集", "Edit event"),
        .startLabel: ("開始", "Start"),
        .endLabel: ("終了", "End"),
        .unset: ("設定なし", "Not set"),
        .reflectionTitle: ("振り返り", "Reflection"),
        .reflectionExplain: (
            "それぞれの項目を、次の期間へどう引き継ぐか決めましょう。",
            "Decide how each item carries into the next period."
        ),
        .confirmReflection: ("結果を確定する", "Confirm the result"),
        .reflectionResult: ("振り返り結果", "Reflection result"),
        .keepCount: ("維持", "Keep"),
        .postponeCount: ("先送り", "Postpone"),
        .stopCount: ("終了", "Stop"),
        .monthlyDueTitle: ("今月の振り返り", "This month's reflection"),
        .monthlyDueBody: (
            "今月のやること・予定を振り返って、次の月につなげましょう。",
            "Look back at this month's tasks and events, and carry what matters into next month."
        ),
        .weeklyDueTitle: ("今週の振り返り", "This week's reflection"),
        .weeklyDueBody: (
            "今週のやること・予定を振り返って、次の週につなげましょう。",
            "Look back at this week's tasks and events, and carry what matters into next week."
        ),
        .dailyDueTitle: ("今日の振り返り", "Today's reflection"),
        .dailyDueBody: (
            "今日のやること・予定を振り返って、次の日につなげましょう。",
            "Look back at today's tasks and events, and carry what matters into tomorrow."
        ),
        .startReflection: ("振り返りを始める", "Start reflection"),
        .monthlyEmptyTitle: ("今月は記録がありませんでした", "There was no record this month."),
        .weeklyEmptyTitle: ("今週は記録がありませんでした", "There was no record this week."),
        .dailyEmptyTitle: ("今日は記録がありませんでした", "There was no record today."),
        .monthlyEmptyBody: (
            "忙しい日はだれにでもあります。\n今月は下のどちらかをやってみませんか？",
            "Busy days happen to everyone.\nWould you try one of these for this month?"
        ),
        .weeklyEmptyBody: (
            "忙しい週はだれにでもあります。\n今週は下のどちらかをやってみませんか？",
            "Busy weeks happen to everyone.\nWould you try one of these for this week?"
        ),
        .dailyEmptyBody: (
            "忙しい日はだれにでもあります。\n今日は下のどちらかをやってみませんか？",
            "Busy days happen to everyone.\nWould you try one of these for today?"
        ),
        .photoAndLine: ("写真 & 一言", "Photo & one line"),
        .anythingDiary: ("なんでも日記", "Anything diary")
    ]

    static var isEnglish: Bool {
        Bundle.main.preferredLocalizations.first?.hasPrefix("en") == true
    }

    static func string(_ key: Key) -> String {
        guard let entry = table[key] else { return key.rawValue }
        return isEnglish ? entry.en : entry.ja
    }

    static func morePlans(_ count: Int) -> String {
        isEnglish ? "\(count) more plans" : "他\(count)プラン"
    }
}
