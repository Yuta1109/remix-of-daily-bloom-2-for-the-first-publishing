# Planning visual specification (Blueprint 1)

Reference device: iPhone 13, 390 x 844 pt, portrait only. All values are mirrored in `PlanningDesignTokens.swift`; change both together.

## Palette split

- Planning pages (main, list, editor, selection, Help, Postpone): paper palette (`PlanningPalette`).
- Sheets and popups (destination sheet, period picker, alerts): native system surfaces. Never `presentationBackground(paper)`.

## Header (Plan main)

- Height 72 below the safe area. Title "Planning" 34 pt bold, left. Postpone, Help, and User stay on the right.
- The row is a system safe-area bar (`planningFixedHeader` / `safeAreaBar` on iOS 26, material inset on iOS 17.2–25). It does not paint a cream rectangle. Scroll content can move underneath; the index starts below this bar.

## Index (right edge)

- Trailing margin stays 4. Tab depth is 30.8 (28 × 1.10) and tab length is 90 (75 × 1.20). The extra width grows inward; the screen-edge gap does not move. Gap 2, first tab 2 below the header. Every tab, including +, uses these sizes. The hit target is the enlarged tab.
- Tab shape: rectangle, square left corners, 7.5 pt right corners. Not a trapezoid.
- Label 13.5 pt semibold, rotated 90 degrees clockwise, one line, English always (Plan / Future / Monthly / Weekly / Daily / +).
- One continuous 2 pt brown seam. Real z-order: unselected tabs (0) < seam (1) < selected tab (2).
- Selected tab: darker outline in its own colour on top, right, bottom only (no left edge).

## Plan main body

- Content inset 16. Title row starts 35 below the body top: 28 x 28 icon slot, 10 gap, 20 pt semibold title.
- Paragraph 17.5 below title, 15.5 pt, 4.5 line spacing, left edge aligned with the button.
- New plan button 31 below the paragraph: 52 tall, 14 radius, text "＋  プランを新規作成".
- Plan list container 39 below the button: radius 15.5, padding 10, always visible.
  - Header "プランの一覧" 17 pt semibold, one chevron (44 pt hit) to the Plan List page.
  - Up to 5 cards, newest first, or "まだプランはありません" inside the container.
  - Card: min height 75, radius 11.5, gap 6, inset 9. Icon, title, `最終更新日`, `リプラン数`. Whole card taps.

## Plan List page

- Visible system tab bar, no index. Back, centered "プランの一覧", then 10 pt before the search field "プランを検索…" (16 inset, 38 tall). Cards stay where they are.

## Plan new / edit page

- Full screen, no index, no tab bar. System toolbar: back, centered "新規プラン" / "プランを編集", trailing `保存` capsule (about 30 pt tall, 44 pt hit, 15.5 pt semibold, orange, white text). iOS 26 uses prominent glass with an orange tint.
- Sections: タイトル (46 tall field), アイコン (44 pt cells, 6 icons), やること・考えていること (parent rows 40, subtask indent 28 with hollow marker), メモ (min 90).
- Bottom button "タスク・予定に反映": 51 tall, 15 radius, 16 inset, pinned with `safeAreaInset` just above the keyboard. The editor scroll view keeps 44 pt of extra bottom room, and a focused row scrolls above that button with the same 44 pt of clearance under the focused row. Save only via `保存`: one save, one `navigation.pop()`.

## Selection page

- Full screen, no index, no tab bar. Back, centered "反映する項目を選択", no top check.
- "全体を選択", parent rows, indented subtasks. Parent toggles its subtasks; a subtask toggles alone.
- Persistent bottom button "反映先を選ぶ", disabled with zero selection.

## Destination sheet

- Native `.sheet` sized to its content (`presentationSizing(.fitted)` on iOS 18+, a measured height detent on earlier systems). No medium, large, or 430 pt detent. System background, close and check (30 visual / 44 hit, 16 inset), no title. The × / ✓ row uses 8 pt top padding so it sits at the native sheet position. 22 pt between sections, 20 pt after the note, plus the Home indicator. The sheet ignores the keyboard safe area, so the header stays put and the body scrolls.
- 1. 反映先の種類 (タスク / 予定), 2. 反映先のスコープ (Monthly / Weekly / Daily), 3. 期間を選択 (row opens a native wheel picker: year+month, week, date). Each picker sheet uses the same fitted chrome and ends after the wheel plus the 20 pt bottom inset.
- Check copies (never moves), closes the sheet, then pops back to the editor after the sheet has dismissed.

## Keyboard

- No overlay above the UI. One window-level tap recogniser with `cancelsTouchesInView = false`.
- `タスク・予定に反映` clears editor focus and waits one run loop before saving and pushing Transfer selection. Returning does not restore that focus.
- Return between outline rows assigns the next focus directly and does not set focus to nil.
- The editor paper is painted on the scrolling body. It is not painted as a rectangle behind the keyboard's top corners.
- `タスク・予定に反映` and `反映先を選ぶ` are the shared glass action: orange accent, white text, prominent Liquid Glass on iOS 26, translucent material before that.

## Appearance

Essences iOS uses a fixed Light appearance across the entire application. `UIUserInterfaceStyle` is `Light` in the app Info.plist, and `NativeAppRoot` sets `.preferredColorScheme(.light)` once. System Light/Dark settings do not alter Essences UI. Planning does not add its own color-scheme or toolbar color-scheme modifier.

## Discard confirmation

Planning dirty dismiss uses `PlanningDiscardConfirmation`, a `UIAlertController` whose view tint is `.label`. Cancel is therefore black. Discard stays destructive red. The app accent is unchanged.

## Plan icon colour

`iconColorID` is one of rose, peach, yellow, mint, sky, lavender. Missing values resolve to rose. Only the icon uses the colour.

## Return key

A non-empty parent creates or focuses its first child. A non-empty child inserts the next child. Return on an empty child removes it and creates the next parent. Backspace on an empty row deletes it and focuses the previous visible row. Depth stays at two. Focus is never cleared as part of Return.

## Preview remainder

At most five cards. When more exist, the same container shows centered `他Nプラン` (N = total − 5) and opens the full list.

## Transfer

`タスク・予定に反映` saves the current editor state when it is new or dirty, then opens selection without popping. A clean saved plan is not saved again. `保存` saves once and pops once. Destination periods start at the current month, week, or day.

## Shared header chrome

Pushed pages (Plan List, New/Edit Plan, Transfer selection, Postpone, Help) use `planningPageChrome`: the system navigation bar, a back button, a centered title, and a trailing control only when the page has one. iOS 26 uses the system Liquid Glass toolbar. iOS 17.2–25 uses an ultra-thin material toolbar. The Planning root uses `planningFixedHeader` (`safeAreaBar` on iOS 26, material inset before that). Monthly, Weekly, and Daily do not add a second period-header strip. Their selector scrolls under the shared intro. One Back tap calls `navigation.pop()`, which commits `removeLast()` on the next turn so the toolbar tap is not dropped. Appearance is the app-wide Light setting, not a Planning-only modifier.

## Index host

`PlanningIndexHost` wraps Plan, Future, Monthly, Weekly, and Daily. The host and the index column are clear. Tabs and the seam paint themselves. There is no period-coloured or material fill behind the index column. The shell paper shows through the gaps.

## Future

The Future title and description use `PlanningSectionIntro`, the same `PlanMain.titleTop` and `titleToParagraph` rhythm as Plan. Monthly, Weekly, and Daily use that same intro. The period selector is a centered one-line label with fixed left and right arrow zones (`PlanningTokens.PeriodSelector`). Generic accents use `PlanningPalette.accent`. Year controls sit about 20 pt below and keep the existing year sheet (`fixedHeight: 260`). Years page with the native page TabView.

The year is a 3 by 4 grid. Every month card is 120 pt tall with radius 11.5 and a fixed 6 by 7 date grid. A one-day event uses the same pastel band as a one-cell range behind the date number. A multi-day event draws a 0.26 opacity band behind the numbers, with a leading cap, middle segments, and a trailing cap per week row. The first event in repository order wins when dates overlap. The same event id is not copied across weeks, months, or years.

Monthly, Weekly, and Daily mains show summary cards only: ToDo count and completion, and 予定 count. A card opens the list sheet. The list, the source chooser, and the task or event editor share `PlanningSystemSheetChrome`. Daily completion is display-only.

The month editor, event editor, and date/time editor use `PlanningSystemSheetChrome`: one fitted height, system surface, the same × and ✓ row. The month goal is one line at the editor field height. Long lists scroll inside `maximumBody`. The date sheet shows the calendar, then the Time toggle, then the time wheel only while Time is on. Turning Time on remeasures that one height. A child sheet hides the parent × / ✓ while it is presented.

## Reflection due card

`PlanningReflectionDueCard` is one component for Monthly, Weekly, and Daily. Its height is `PlanningTokens.ReflectionDue.height`: 1.5× to 2.0× the measured visible system tab-menu height (`tabBarFallback` 49 until `PlanningTabBarHeightReader` finds the bar). It is not based on the 90 pt index tab. The card sits in the period content column, inset by `contentInset` on the left and the right, so its right edge stops before the index seam. It is fixed with `safeAreaInset` above the system tab bar while the page scrolls, and the scroll body keeps bottom space so the last content can clear it. iOS 26 uses `glassEffect`. Earlier systems use ultra-thin material. Text stays dark. The action uses the Essences orange accent.

The classification page lists items only. It has no progress ring, percent, or count summary, and no `進捗サマリー`. The result page shows period, snapshot completion counts, and 維持 / 先送り / 終了 counts. It has no `主な項目` section. A sample result is titled `振り返り結果（例）`. History opens `振り返りを編集`. No-activity copy stays `今月は記録がありませんでした`, `今週は記録がありませんでした`, and `今日は記録がありませんでした`, with `写真 & 一言` and `なんでも日記`.

## Shared chrome

Pushed pages and the Planning root use the same translucent header as `Planning の使い方`: iOS 26 system glass, earlier systems ultra-thin material. Page content scrolls underneath. The system tab bar stays system-owned, with automatic glass on iOS 26 and material before that. No opaque white block is painted behind the header or the tab bar.

Future and the period pages page with `PlanningHorizontalPager`, a transparent horizontal `ScrollView`. Planning paper is one surface on the shell, extended under the system tab bar and behind the keyboard. It is not painted only on an inner scroll view.

`PlanningSystemSheetChrome` is one continuous sheet surface. The × / ✓ row is a real 76 pt header with a clear background. The sheet root ignores the keyboard safe area. Keyboard overlap is applied only as the body scroll inset. The detent stays frozen while that overlap is visible.

`NativeGlassFeedback` waits 0.22 s, once, before a glass control dismisses or navigates. Back, sheet × / ✓, and the primary CTAs use it. The Back control's glass is a 30 pt circle inside a 44 pt plain hit target. Outline rows register live `UITextField`s with `PlanningOutlineFocusCoordinator`. Return keeps the current field first responder until the next row is in a window.

## Navigation contract

- `TabNavigationState` is injected on the `NavigationStack` and on each destination. Every Back uses `navigation.pop()`.
