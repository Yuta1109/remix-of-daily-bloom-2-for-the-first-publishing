# Planning specification

Canonical source of truth for the native Planning tab. Later phases must follow this file and must not silently drop or reinterpret a requirement.

Phase 2-A implements the shell, header, index, Help, Postpone Box, Plan list, Plan editor, Future year, and Future month sheet, plus the models those later pages need. Monthly, Weekly, Daily, and Reflection screens are specified here and are not fully built yet.

## Blueprint 1 overrides

Geometry lives in `PLANNING_VISUAL_SPEC.md` and `PlanningDesignTokens.swift`. These rules supersede conflicting older rules.

- Navigation: the `TabNavigationState` environment object wraps the `NavigationStack` (and is re-injected on every Planning destination). Every Back button calls `navigation.pop()`.
- Plan main page shows at most 5 saved plans, newest `updatedAt` first, inside one always-visible "プランの一覧" container. The header chevron opens the Plan List page; a whole card opens the editor. No per-card menu or chevron.
- Plan List page: system tab bar visible, no index, search over title, memo, bullets.
- Plan editor and selection page are full screen with no index and no tab bar. Back with unsaved changes shows a standard alert (キャンセル / 破棄); nothing navigates before the user answers.
- Plans have a stable `iconID` (default `leaf`).
- `タスク・予定に反映` opens the selection page. The persistent bottom button `反映先を選ぶ` (disabled at zero selection) opens the destination sheet; the sheet's check copies and returns to the editor.
- Index tabs are rectangles with rounded right corners. Labels stay English in every language.
- Planning pages keep the paper palette. Sheets and popups use native system surfaces.
- The app is portrait-only on iPhone.

## Phase 2-D2 overrides

- Hierarchy stays parent plus subtask. No third level.
- A Plan is saved only with the top-right check. Leaving with unsaved changes asks before discard.
- `タスク・予定に反映` copies the selection to a chosen task or event on a specific Monthly, Weekly, or Daily period. The Plan itself stays intact.
- Monthly, Weekly, and Daily main cards do not add items inline. Tapping ToDo or 予定 opens the list sheet. The floating plus opens the existing source list.
- New and existing items share one editor: icon, content, color, optional start/end, and subtasks.
- Daily task checkboxes display Today completion and do not change it.
- Event row checks are local list state. They are not task completion and not 維持 / 先送り / 終了.

## Phase 2-D1 overrides

These rules supersede any older Planning UI rule in this file that conflicts with them.

- Blueprint fidelity is primary. Reproduce the attached Blueprint at about 90%. Screen map: 1st phone Plan, 2nd Future, 3rd Monthly, 4th Daily. Weekly is not in the Blueprint and uses the Monthly visual language with Weekly content. Daily keeps the 4th-screen design and must not look identical to Monthly or Weekly.
- Essences iOS is Light only. `Info.plist` sets `UIUserInterfaceStyle` to `Light`, and the SwiftUI root sets `.preferredColorScheme(.light)` once. System Dark Mode does not change Planning, the tab bar, or other native screens. Planning keeps its paper palette and does not add a separate appearance modifier.
- Layout: full-width Planning header, then content beside the right-edge index. The index starts below the header.
- Index labels are rotated 90 degrees. Selected tab is visually distinct. Reflection badges stay, maximum 99. One `+`.
- Section header glyphs for Plan, Future, Monthly, Weekly, and Daily are removed. Item-level Task and Event marks may remain.
- Hierarchy is parent plus subtask only. Maximum depth is 2. The older 3-level rule is superseded.
- Plan transfer may copy to Monthly, Weekly, or Daily. Plan content is copied and never removed from the Plan. The older "Plan cannot transfer directly to Daily" rule is superseded.
- Hide scroll indicators throughout Planning. Scrolling stays enabled.
- Dismiss the keyboard from empty background taps and from interactive scroll, without a hit layer that blocks controls.
- Help body copy stays. Help header is one row: back chevron and `Planning の使い方`, slightly smaller, untinted material, not the solid Planning header.
- Future year calendars use a stable 6 by 7 slot matrix so every month card is the same size. Year changes and Monthly, Weekly, and Daily period changes use real paging that follows the finger. Hide page dots.
- Future month sheet has no title bar, month title, calendar, or rough outlook. Controls are 30pt × and ✓. Body is one Monthly Goal and the whole month's events as sticky notes, with start date, optional start time, end date, optional end time, joined by `～`. A dirty × asks `この変更を破棄しますか？` with 破棄 and キャンセル.
- Year, month, week, and day pickers have no old titles, 30pt × and ✓, fixed height, and cannot expand upward.
- 写真 & 一言 and なんでも日記 appear only for a past elapsed period with no meaningful activity, after a recommendation card, and only one is chosen. They are not Reflection.
- A future period shows the normal empty planner, not the no-activity memory UI.
- Temporary TestFlight sample data is in-memory only. Do not write it to Firebase or persisted user data.
- Back navigation uses `TabNavigationState.pop()`, which does nothing when the path is empty.

## Superseded

The following older sentences remain below only as history. Do not implement them:

- Blueprint is structure-only and must not define colors.
- Planning header is solid white in Light and solid black in Dark.
- Index colors must not copy the Blueprint, and index text is horizontal.
- Section glyphs are required.
- Nested bullets and tasks use 3 levels.
- Plan cannot transfer directly to Daily. **Superseded by Phase 2-D1. Copy to Monthly, Weekly, or Daily. Never remove the Plan bullet.**
- Future month sheet includes a calendar and rough outlook.
- Period swipe may replace content after the gesture ends.
- No-activity photo and diary controls appear whenever a period has no activity, including future periods.
- Monthly and Weekly must not use the Blueprint card treatment, and Daily should share that same generic layout.

The blueprint image is a structure and relative-layout reference only. It does not define the system tab bar, icons, type, or colors. **Superseded by Phase 2-D1.**

## Shell

- Planning stays inside the existing Apple system `TabView`.
- Do not add a custom floating tab bar, custom lens, or custom drag-between-tabs gesture.
- Do not change Today, Calendar, Progress, or Notes.
- Planning must preserve, across main-tab switches:
  - current Planning subsection
  - Plan editor / navigation path
  - selected Future year
  - later selected Monthly, Weekly, and Daily periods
- Do not reset Planning to Plan when the user leaves and returns.

## Header

Planning uses a different header from Today, Calendar, and Progress.

- Light mode: solid white. Dark mode: solid black. **Superseded by Phase 2-D1 fixed paper palette.**
- No `.ultraThinMaterial` on the Planning header.
- Large left-aligned title: `Planning`.
- No breadcrumb `Plan / Future / Monthly / Weekly / Daily`.
- Right-side actions, left to right: Postpone Box, Help, User.
- Use the shared 30pt glass icon button. Do not create a second header-button component.
- The glass circle stays 30pt. The hit target stays at least 44pt.

## Right-edge index

Physical-planner vertical index on the right edge, in this order:

1. Plan
2. Future
3. Monthly
4. Weekly
5. Daily
6. +

- Weekly is hidden when Weekly is disabled in Settings. Default is enabled. Hiding it does not delete Weekly data.
- The selected page is unmistakably highlighted.
- Tabs may use a subtle color family. They must stay readable in Light and Dark. Do not copy the blueprint colors or shapes. **Superseded by Phase 2-D1.**
- There is only one `+`.
- If an eligible Reflection is still unresolved, show its count at the upper-right of the matching period tab.
- The displayed count is capped at 99.
- Do not count a period that has no meaningful activity.
- The `+` page shows exactly: `次回のアップデートをお楽しみに`.

## Section glyphs

Plan, Future, Monthly, Weekly, and Daily use an app-owned line-glyph system. **Superseded by Phase 2-D1. Do not show section header glyphs.** Item-level Task and Event marks remain allowed.

## Help

`?` opens a dedicated full page, not a sheet.

Title: `Planningの使い方`

Intro:

EssencesのPlanningは、頭の中にあることを整理し、
「いつやるか」「次にどうするか」を少しずつ決めていく場所です。

バレットジャーナルの考え方を参考にしていますが、
すべてのページを毎日使う必要はありません。
自分に必要なページだけ使ってください。

Plan:

まずは考えていることを自由に箇条書きします。
最大3段階まで整理できます。

書いた項目は、1項目だけでも、まとまりでも、
必要なら全体でもMonthly / Weeklyへ移せます。

Future:

1年を大きく見渡すページです。
月ごとの目標、先に決まっている予定、
ざっくりした見通しを残します。

Monthly:

今月やりたいことと予定を整理します。
Planから持ってきても、その場で追加しても、
先送りボックスから戻しても構いません。

Weekly:

Monthlyを今週できる大きさへ分けるためのページです。
Weeklyを使わない場合はSettingsから無効にできます。

Daily:

今日やることを決めます。
Monthly / Weeklyから選ぶ、新しく追加する、
先送りボックスから戻す、という方法があります。

Dailyの完了チェックはPlanningではなく
Todayタブで行います。

Reflection:

期間が終わったら、必要に応じて振り返ります。

各項目について、維持 / 先送り / 終了 を決めます。

これは「完了したかどうか」とは別の判断です。

振り返り後、必要ならReplanできます。
Replanは必須ではありません。

Postpone Box:

次にどうするかまだ決めなかったタスクや予定を
一時的に置いておく場所です。

Monthly / Weekly / Dailyごとに整理され、
タスクと予定は別々に管理します。

Recommended flow:

Plan → Monthly / Weekly → Daily → Todayで実行 → Reflection → 必要ならReplan

This flow is recommended, not required.

Footer:

Planningは予定通りに進めるためだけの機能ではありません。
予定が変わったときに、もう一度考え直すためにも使ってください。

## Postpone Box

Opened from the Planning header icon.

Meaning: items whose next destination was not chosen after Reflection.

- Tasks and Events are separate lists. Never merge them.
- Organize each list by Monthly, Weekly, and Daily.
- There is no Future postpone box.
- Each item is one card. The row opens an action sheet. The main page does not show inline edit, delete, or move.
- The action sheet has a one-line name field labeled `名称を編集` / `Edit name`, a move control labeled `先送りボックス内で移動させる` / `Move within Postpone Box`, and a destructive `削除` / `Delete` button.
- Delete asks `削除するともとに戻すことはできません。削除しますか？` and does nothing on cancel.
- `originBucket` and `originPeriodKey` stay fixed when the current box changes. The secondary line is that reflection provenance, localized, not the current bucket and not a generic task/date line.
- There is no `プランへ戻す` action on this page.
- Titles and labels use `PlanningText` for Japanese and English.

## Plan page

Intro:

まずは今考えていることを箇条書きで書いてみましょう。
そうしている内にやるべきことがわかってきます。

Primary action: `プランを新規作成`

Then the saved Plan list. Each row shows title, リプラン数, 最終更新日, and an edit/menu affordance.

Do not show blueprint period labels such as Plan, Future, or Daily on a plan row. A Plan is not tied to one period. It is a brainstorming document. Later, one bullet, a block, or the whole structure can be distributed.

## Plan editor

- Dedicated full page. Not a bottom sheet.
- Blank brainstorming area.
- Nested bullets, maximum 3 levels, with a clearly different hierarchy. **Superseded by Phase 2-D1. Maximum depth is 2: parent plus subtask.**
- Intuitive indent and outdent.
- Memo area at the bottom. The memo is not linked to Notes.
- Selection supports one bullet, a bullet plus its children, multiple blocks, and the entire Plan.
- Selected content can be sent to Monthly ToDo, Monthly Event, Weekly ToDo, or Weekly Event.
- Plan cannot transfer directly to Daily. **Superseded by Phase 2-D1. Copy to Monthly, Weekly, or Daily. Never remove the Plan bullet.**
- When the user reaches the transfer action, show:

プラン全体を移動する必要はありません。
必要な1項目だけ、まとまりだけ、または全体を選んで
Monthly / Weekly のToDo・予定へ反映できます。

- Allow save only, or transfer the selection and save. **Superseded by Phase 2-D2. Save is the top-right check. Copy is `タスク・予定に反映`.**
- Return moves focus from the current row to the next row in the same turn. It does not clear focus.
- Backspace on an empty parent or subtask removes that row and focuses the previous visible row. Text is not merged. Depth stays at two.
- The focused row scrolls into view above `タスク・予定に反映`. There is no extra blank row reserved above that button.
- `タスク・予定に反映` and `反映先を選ぶ` use one glass action: iOS 26 prominent Liquid Glass, earlier systems a translucent orange material, white label.
- Editing an existing plan counts as Replan and supports リプラン数.
- Import from Notes only when that Note is already a bullet list. Handwritten/photo scan uses the same API and key path as the existing Notes AI camera, and only the prescribed scan format. Do not add another AI provider. Do not duplicate that API in Phase 2-A.

## Future page

- Year selector, for example `2026`.
- Tap the year to open a year picker.
- Previous and next controls.
- Horizontal swipe moves to the previous or next year.
- Twelve small month calendars, 3 columns by 4 rows. January, February, and March are the first row.
- A month can show fixed-event date highlights and its single monthly goal or short outlook when space allows.
- A one-day event is a one-cell pastel highlight behind the date number. A longer event keeps the range band. Overlaps use the earliest stored event.
- Do not copy the blueprint calendar decoration.

## Future month editor

Tapping a month opens a large bottom sheet on the existing native sheet foundation.

1. Monthly Goal: exactly one goal, synchronized with that month's Monthly page.
2. Calendar: tap a date, show fixed events, highlight dates that have fixed events.
3. Simple event entry: date or date range, optional time, title. Detailed editing can happen later in Calendar or the period pages.
4. Rough outlook: a simple bullet area.

Events created here must be able to sync later with Monthly, Weekly when relevant, and Calendar. Do not create a second unrelated copy of the same event. Use one stable id.

## Period sources

Monthly, Weekly, and Daily mains keep the shared intro and the existing period selector. Below that, ToDo and 予定 are separate collapsible lists. Parent task checkboxes share one timeline; the line joins parent positions and does not connect a parent to its subtasks. There is no horizontal group separator and no count in the section heading. A row opens the existing list sheet. The add button stays inside that sheet. Photo and Diary periods do not show ToDo or 予定.

Monthly shares the one Future monthly goal. Weekly keeps its own items and can later be turned off without deleting history. Daily shows completion and does not change it. Today owns completion. Daily does not include Routine or Quick Memo.

List, source, and item editor sheets use `PlanningSystemSheetChrome`. Colour tints the icon and the event mark. It does not fill the row.

Monthly and Weekly task and event sources:

1. Selected content from Plan
2. Created on that page
3. Retrieved from Postpone Box
4. Continuation from Reflection when applicable

Daily task and event sources:

1. Selected from Monthly or Weekly
2. Created on Daily
3. Retrieved from Postpone Box
4. Previous Daily Reflection Keep items when applicable

Monthly and Weekly ToDo lists may stay independent. Selected Monthly ToDo items may be copied down into Weekly.

## Shared period navigation

Monthly, Weekly, and Daily share one period-navigation architecture. Their intro uses `PlanningSectionIntro` (`PlanMain.titleTop`, `PlanMain.titleToParagraph`). The selector sits in the scroll under that intro. The root Planning header, the clear index host, and the system tab bar stay the same as Plan.

- Left and right chevrons
- Tap the period title to open that period's picker
- Horizontal swipe for previous and next period

Monthly uses a month picker, Weekly a week picker, Daily a date picker. Do not build three unrelated navigators.

ToDo and Events each use the full available width as a large section. Do not use the blueprint's side-by-side cards. Nested tasks go to 3 levels. **Superseded by Phase 2-D1 Blueprint card treatment and depth 2.**

## Completion

- Monthly completion may be checked on Monthly.
- Weekly completion may be checked on Weekly.
- Daily completion is editable in Planning. Daily Planning and Today share the same `todayTaskID` completion. Checking a parent checks its subtasks. Checking every subtask does not check the parent. Unchecking a parent does not clear subtasks.
- Top-level Daily task and event rows use a leading type glyph. Child task rows do not.
- Planning Daily does not show Routine or Quick Memo. Those stay on Today.
- Planning Daily contains ToDo and Events only.

## Subdivision

Tasks can contain subtasks. The planning hierarchy is at most 3 levels everywhere: Plan, Monthly, Weekly, Daily, Today, and Reflection. **Superseded by Phase 2-D1. Parent plus one subtask level only.**

For Monthly progress, a subtask divides the parent's contribution. A child is not a second full task.

## Identity and sync

Do not fully wire every integration in Phase 2-A. The model must still allow them.

- A Daily Planning task and the Today task are the same logical task. Either surface may change Daily completion through `todayTaskID`.
- A Planning event and the Calendar event share one stable id. They are not unrelated duplicates.
- An event created on Monthly can later appear on Weekly where relevant, on Calendar, and optionally on Future.
- An event created on Daily can later appear on Monthly, Weekly, Calendar, and optionally on Future.
- Calendar stays event-only. It does not create tasks.

## Reflection

Reflection exists for Future, Monthly, Weekly, and Daily. Timing comes from Settings. The Reflection page only links to the relevant Settings section.

Defaults already established:

- Daily: after 17:00, with end-of-day or next-day timing configurable
- Weekly: Sunday, weekday configurable
- Monthly: month boundary, beginning-versus-end configurable
- Future: end of year, date configurable

A Reflection is due only when the period had meaningful activity, the default time has passed, and it is neither completed nor skipped. That state is `PlanningReflectionDueCard`, fixed above the system tab bar. The whole card is the tap target. It does not scroll with the page. No-activity, skipped, completed, and Photo/Diary periods do not show it.

The flow is overview, then classification, then the result. The overview shows circular progress and separates ToDo from 予定. The classification page has no progress summary. Each relevant item shows 完了 or 未完了 and exactly one of 維持, 先送り, or 終了. Completion does not choose the classification. `完了` stays disabled until every item is classified, then stores a historical snapshot and returns to the period page.

After Reflection:

- The period page shows the result card, not the due card.
- The result has progress plus 維持, 先送り, and 終了. It has no `主な項目` section and no Replan.
- Detail lists the stored snapshot, with ToDo and 予定 separate.
- Historical edits start only from `振り返りの編集` on that detail page.
- Editable completed windows are the latest 7 Daily, 4 Weekly, and 1 Monthly. Older completed records stay viewable and read-only.
- Photo and Diary are not Reflections.

## No-activity periods

If a day, week, or month has no task or event added, no meaningful edit, no postpone action, and no other activity that makes it an active planning period:

- Do not create a Reflection obligation.
- Do not increment its Reflection badge.

Offer exactly two alternatives, neither of which counts as Reflection, a badge, or history:

- Title, past tense: `今月は記録がありませんでした`, `今週は記録がありませんでした`, `今日は記録がありませんでした`
- `写真 & 一言` — one photo and one sentence
- `なんでも日記` — title and body, no photo

Temporary TestFlight examples cover the previous three months, three weeks, and three days. The nearest previous period is a Reflection result, the second is Photo & one line, and the third is Anything Diary. They live only in `TemporaryPlanningSamples`, are marked `isSample`, and are skipped when that period already has a record. They are not written to Firebase.

## Reflection editing

`振り返りの編集` lists only the editable completed windows: latest 7 Daily, latest 4 Weekly, and latest 1 Monthly. Opening one opens `振り返りを編集`, which corrects that period's stored snapshot through `updateHistoricalDecision`. Expired reflections stay on their period as results and are absent from the edit list. Photo and Diary records are not in this list.

## Weekly setting

Weekly is on by default. The Weekly page does not show `Weeklyをなくす`. When Weekly is disabled, hide it from the right-edge index, keep its data, and do not delete historical Weekly data.

## Cross-feature routes

Keep contracts for these, without building the other tabs' screens now:

- Planning → Today
- Planning events → Calendar
- Plan → bullet-formatted Notes import
- Planning Help
- Planning → Reflection Settings
- Weekly → Weekly Settings
- Planning → User
- Reflection → optional Replan

## Phase 2-A boundary

Implemented in this phase: shell, header, index, Help, Postpone Box management, Plan list, Plan editor, Future year, Future month sheet, and the shared models/routes above.

Not implemented yet: Monthly, Weekly, and Daily pages, Reflection flow, period pickers, Notes import, scan API calls, Settings screens, Today completion wiring, and Calendar sync.
