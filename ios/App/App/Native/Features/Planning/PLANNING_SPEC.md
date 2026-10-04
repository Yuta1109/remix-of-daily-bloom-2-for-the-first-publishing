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
- The user can view, rename/edit, delete, and move an item between those period boxes.
- An item can later be placed onto a Monthly, Weekly, or Daily plan.
- Task and Event stay visually distinct.

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
- Editing an existing plan counts as Replan and supports リプラン数.
- Import from Notes only when that Note is already a bullet list. Handwritten/photo scan uses the same API and key path as the existing Notes AI camera, and only the prescribed scan format. Do not add another AI provider. Do not duplicate that API in Phase 2-A.

## Future page

- Year selector, for example `2026`.
- Tap the year to open a year picker.
- Previous and next controls.
- Horizontal swipe moves to the previous or next year.
- Twelve small month calendars, 3 columns by 4 rows. January, February, and March are the first row.
- A month can show fixed-event date highlights and its single monthly goal or short outlook when space allows.
- Do not copy the blueprint calendar decoration.

## Future month editor

Tapping a month opens a large bottom sheet on the existing native sheet foundation.

1. Monthly Goal: exactly one goal, synchronized with that month's Monthly page.
2. Calendar: tap a date, show fixed events, highlight dates that have fixed events.
3. Simple event entry: date or date range, optional time, title. Detailed editing can happen later in Calendar or the period pages.
4. Rough outlook: a simple bullet area.

Events created here must be able to sync later with Monthly, Weekly when relevant, and Calendar. Do not create a second unrelated copy of the same event. Use one stable id.

## Period sources

Recorded now. Monthly and Weekly screens are implemented later.

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

Monthly, Weekly, and Daily, when built, share one period-navigation architecture:

- Left and right chevrons
- Tap the period title to open that period's picker
- Horizontal swipe for previous and next period

Monthly uses a month picker, Weekly a week picker, Daily a date picker. Do not build three unrelated navigators.

ToDo and Events each use the full available width as a large section. Do not use the blueprint's side-by-side cards. Nested tasks go to 3 levels. **Superseded by Phase 2-D1 Blueprint card treatment and depth 2.**

## Completion

- Monthly completion may be checked on Monthly.
- Weekly completion may be checked on Weekly.
- Daily completion cannot be changed from Planning. It comes from Today. Planning Daily does not show completion checkboxes.
- Top-level Daily task and event rows use a leading type glyph. Child task rows do not.
- Planning Daily does not show Routine or Quick Memo. Those stay on Today.
- Planning Daily contains ToDo and Events only.

## Subdivision

Tasks can contain subtasks. The planning hierarchy is at most 3 levels everywhere: Plan, Monthly, Weekly, Daily, Today, and Reflection. **Superseded by Phase 2-D1. Parent plus one subtask level only.**

For Monthly progress, a subtask divides the parent's contribution. A child is not a second full task.

## Identity and sync

Do not fully wire every integration in Phase 2-A. The model must still allow them.

- A Daily Planning task and the Today task are the same logical task. Only Today may change Daily completion.
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

When a Reflection is due, ask `振り返りを始めますか？` with:

- 始める
- 今日/今週/今月/今年はやめとく
- キャンセル

First show the period's activity and results. Then `振り返りをしましょう！` and every relevant item in that period.

Each item receives 維持, 先送り, or 終了. Completion and this classification are different. Do not derive one from the other.

After Reflection:

- The normal ToDo and Event sections are no longer the main result view for that reflected period.
- Show the Reflection result instead.
- Show each item's completion state separately from its 維持 / 先送り / 終了 classification.
- Show period progress or status only after Reflection. Do not show `今月の進捗` or Reflection status before that.
- The same behavior applies to Monthly, Weekly, and Daily.
- Strongly offer optional Replan. Replan is never mandatory.
- Do not add Challenges or Points.

## No-activity periods

If a day, week, or month has no task or event added, no meaningful edit, no postpone action, and no other activity that makes it an active planning period:

- Do not create a Reflection obligation.
- Do not increment its Reflection badge.

Offer two alternatives, neither of which counts as Reflection:

- `写真＋一言` — photo plus a short text
- `過去を思い出して、その日何があったかを日記形式で書いてみる`

## Reflection history

Later history supports Future, Monthly, Weekly, and Daily, and shows the last 5 completed Reflections. Periods that were never reflected are excluded. Keep, Postpone, and Stop stay editable under the established Reflection-window rules. The data model must not discard this.

## Weekly setting

Weekly is on by default. The later Weekly page includes `Weeklyをなくす`, which opens the Weekly setting section itself, not a generic Settings root. When Weekly is disabled, hide it from the right-edge index, keep its data, and do not delete historical Weekly data.

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
