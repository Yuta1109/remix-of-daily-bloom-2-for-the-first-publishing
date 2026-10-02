# Planning visual specification (Blueprint 1)

Reference device: iPhone 13, 390 x 844 pt, portrait only. All values are mirrored in `PlanningDesignTokens.swift`; change both together.

## Palette split

- Planning pages (main, list, editor, selection, Help, Postpone): paper palette (`PlanningPalette`).
- Sheets and popups (destination sheet, period picker, alerts): native system surfaces. Never `presentationBackground(paper)`.

## Header (Plan main)

- Height 72 below the safe area. Title "Planning" 34 pt bold.
- Buttons: 30 pt visual circles, 44 pt hit targets, 10 pt visual gap, 16 pt horizontal inset.

## Index (right edge)

- Trailing margin 4, tab depth 28, tab length 75, gap 2, first tab 2 below the header.
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

- Visible system tab bar, no index. Back, centered "プランの一覧", search "プランを検索…" (16 inset, 38 tall), cards newest first.

## Plan new / edit page

- Full screen, no index, no tab bar. Top row: back, centered "新規プラン" / "プランを編集", check.
- Sections: タイトル (46 tall field), アイコン (44 pt cells, 6 icons), やること・考えていること (parent rows 40, subtask indent 28 with hollow marker), メモ (min 90).
- Bottom button "タスク・予定に反映": 51 tall, 15 radius, 16 inset. Save only via the top-right check.

## Selection page

- Full screen, no index, no tab bar. Back, centered "反映する項目を選択", check (same action as bottom button).
- "全体を選択", parent rows, indented subtasks. Parent toggles its subtasks; a subtask toggles alone.
- Persistent bottom button "反映先を選ぶ", disabled with zero selection.

## Destination sheet

- Native `.sheet`, fixed detent (430), system background, close and check (30 visual / 44 hit, 16 inset), no title.
- 1. 反映先の種類 (タスク / 予定), 2. 反映先のスコープ (Monthly / Weekly / Daily), 3. 期間を選択 (row opens a native wheel picker: year+month, week, date).
- Check copies (never moves), closes the sheet, then pops back to the editor after the sheet has dismissed.

## Keyboard

- No overlay above the UI. One window-level tap recogniser with `cancelsTouchesInView = false`.

## Fixed light

Planning uses `.preferredColorScheme(.light)` once on the Planning root and once on the shared destination container. The rest of Essences keeps the system appearance.

## Plan icon colour

`iconColorID` is one of rose, peach, yellow, mint, sky, lavender. Missing values resolve to rose. Only the icon uses the colour.

## Return key

A non-empty parent creates or focuses its first child. A non-empty child inserts the next child. Return on an empty child removes it and creates the next parent. Depth stays at two.

## Preview remainder

At most five cards. When more exist, the same container shows centered `他Nプラン` (N = total − 5) and opens the full list.

## Transfer

`タスク・予定に反映` saves the current editor state when it is new or dirty, then opens selection without popping. A clean saved plan is not saved again. The top-right check still saves once and pops once. Destination periods start at the current month, week, or day.

## Transparent header

The index has no fill, so the shell paper shows through its gaps. `PlanningTranslucentHeader` and `planningFixedHeader` use that same rule: no opaque header fill, scroll content moves underneath, controls stay in the header.

## Future

Title row: temporary calendar symbol, 28 pt slot, then English `Future` at 21.5 pt. Description follows at 15 pt. Year controls sit about 20 pt below and keep the existing year sheet (`fixedHeight: 260`). Years page with the native page TabView.

The year is a 3 by 4 grid. Every month card is 111 pt tall with radius 11.5 and a fixed 6 by 7 date grid.

The month sheet is a large native sheet on the system surface. It edits the one monthly goal through `setGoal`, shared with Monthly. Events open one add/edit sheet. Icon colours are `PlanIconColor`. Start and end are optional. An end before the start is not saved. × on a dirty sheet uses the standard discard alert and blocks swipe dismissal.

## Navigation contract

- `TabNavigationState` is injected on the `NavigationStack` and on each destination. Every Back uses `navigation.pop()`.
