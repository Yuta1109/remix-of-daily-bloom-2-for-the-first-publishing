# Native Calendar implementation plan

Investigation only. No Calendar UI, store switch, or Planning behavior change was made while writing this file.

Written requirements override the attached Blueprint images where they disagree. Colors, header metrics, and the system tab bar come from the native Planning/Today implementation, not from Blueprint pixels.

---

## A. Current repository status

Verified on `ios-native-rebuild`.

| Earlier claim | Status | Evidence |
| --- | --- | --- |
| Canonical document exists and is not connected to screens | True | `CanonicalPlanningStore.swift` defines `CanonicalPlanningDocument`. `FeatureRoots.CalendarRootView` still returns `NativeFeaturePlaceholder(tab: .calendar)`. No other Swift file references `CanonicalPlanningEngine` |
| Planning still uses `PlanningSession` | True | `PlanningShell`, `PeriodPlannerPage`, `PlanningItemSheets` take `PlanningSession`. `PlanningSession.persist(into:)` in `PlanningModels.swift` writes only navigation keys (`planning.section`, period keys, tutorial flags) |
| Canonical persistence key is `essences.canonical-planning.v1` | True | `CanonicalPlanningPersistence.storageKey`. Nothing calls `save` or `load` at launch |
| Planning event persistence is incomplete | True | `events` and `periodItems` are in-memory. `TemporaryPlanningSamples` is explicitly in-memory. `PLANNING_SPEC.md` forbids writing samples to persisted user data |
| WebView localStorage migration is unresolved | True | `LegacyWebViewCalendarAccess.probeLegacyWebViewCalendar()` returns `"unresolved"`. `AppDelegate` installs `UIHostingController(rootView: NativeAppRoot())` and does not create a `WKWebView`. V3 key is `essences-app-data-v3` in `src/lib/v3/types.ts` (`STORAGE_KEY`). Leftover key is `calendar-events` in `events-store.ts` |
| `deleteLiveItem` cascades | True | `PlanningPeriod.deleteLiveItem` removes every event with that `eventID` or `sourceEventID`, and every node with that `id`, `eventID`, or `logicalID`. Tasks also match `todayTaskID` |

`src/lib/canonical-planning-foundation.ts` is the Windows test twin of the Swift engine. It is not a second live store. There is no XCTest target.

The live add menu is still `PlanningNativeAddMenu` (`NativeGlassComponents.swift`): a system `Menu` with a 50 pt label, 21 pt semibold plus, `.glassProminent` + `.buttonBorderShape(.circle)` on iOS 26, and no `.controlSize(.large)`. Today and Planning both use it. Do not change that control while building Calendar.

---

## B. Verified WebView behaviors

Source: `src/pages/Calendar.tsx`, `src/components/MonthWheel.tsx`, `src/components/WeekWheel.tsx`, `src/lib/v3/calendar-view.ts`, `src/lib/jp-holidays.ts`, `src/lib/events-store.ts`, `src/lib/calendar-prefs.ts`.

| Behavior | What the code does | Reuse |
| --- | --- | --- |
| Month grid | `monthGridLeadingBlanks(year, month0, weekStartsOn)` then one cell per day of that month. Leading cells are **empty**, not previous-month dates. No trailing next-month cells. Row count is `ceil((blanks + days) / 7)`, so 4, 5, or 6. `auto-rows-fr` shares the grid height | Translate the blank count and the variable row count. **Do not preserve empty leading cells.** The written spec fills the real first and last week rows with adjacent-month dates and does not add an extra week of only next-month dates |
| Viewport | `MonthWheel`: current month height is `viewport − 44 − 88 − tabCover`. Gap 8. Previous month peeks 44 pt under the header. Next month peeks 88 pt and may sit under the tab (`extendBehindTab`) | Translate these constants. Navigation is vertical. Header and `TabView` stay fixed |
| Gesture | Finger offset is 1:1. Rubber-band past `stride * 1.15` at 0.25. Settle when velocity exceeds 0.35 px/ms or offset exceeds `stride * 0.22`. Otherwise animate back to 0 | Translate. Do not use a horizontal paging scroll |
| Haptics | `tickHaptic` (`src/lib/haptics.ts`) fires a Capacitor light impact when the rounded month index changes and again on a committed step | Replace with `UIImpactFeedbackGenerator(style: .light)`. This is not `PlanningHaptics.selection()` |
| Holidays | `getJapaneseHolidayName` from `jp-holidays.ts` (祝日法, 振替, 国民の休日, equinox approximation 1980–2099). Shown only when `locale === "ja"`, as a red `祝` badge, not the holiday name, inside the cell | Port the date rules to Swift. Show `祝` in Japanese. English does not show the badge in the current UI |
| Sunday / Saturday | Weekday 0 red, weekday 6 blue, in both the header and the day number | Keep, using those roles. Week start is `loadWeekStartsOn()` (`0` Sunday or `1` Monday, default Sunday in `calendar-prefs.ts`) |
| Today | Day number gets `text-accent` plus a 1 pt accent ring. It is not a filled disc in code | Use `PlanningPalette.accent`. Draw a filled accent disc behind the day number so the indicator reads as the specified orange mark. Do not copy a Blueprint hex |
| Selection | `calendarDateTapResult`: first tap selects, second tap on the same day opens the day sheet | Keep |
| Event badges | `calendarEventSpan` returns `single`, `start`, `middle`, `end` from inclusive `date`…`endDate`. Bars are 13 pt, white 8 pt text, `hsl(color / 0.9)`. Start shows the title; middle/end continue the bar with negative horizontal margin | Translate the span roles. Colors become `PlanIconColor` after the explicit map, not the WebView HSL set |
| Overflow | Events are not capped. Task squares are capped at `CALENDAR_CELL_MARKER_LIMIT` (4). The new Calendar shows events only, so the task squares are not preserved | If the row cannot fit every 13 pt bar, clip and show a `+N` on that day. The WebView does not do this; it overflows the cell. This is the one layout choice that is not already in code |
| Week view | `weekDaysFromAnchor` uses `startOfWeek`. `WeekWheel` is the same vertical/horizontal detent pattern for weeks. `eventsForDate` sorts all-day first, then `startTime` | Keep the sort. Week navigation follows the same snap rules in `WeekWheel.tsx`. Calendar presentation defaults to Sunday. Planning period keys stay Monday. See the locked decisions |
| Not preserved | Monthly Goal block on the WebView page, stamps (`CalendarStampLayer`), wallpaper, task markers, stamp tray, marquee on the selected cell, `createdFrom: "calendar"` task sheet | Omit |

`eventsForDate` is the day query: `eventOccursOn`, then all-day before timed, then clock order. Calendar day lists use that order.

---

## C. Canonical data model and remaining gaps

Live screens do not read this model yet.

Identity, already implemented:

- `CanonicalPayload.id` is the logical id. `legacyWebID` keeps a WebView string id when one exists.
- Level appearance is not a copied payload. `projectedKeys` computes Future / Monthly / Weekly / Daily keys from origin plus the inclusive local span.
- `CanonicalTombstone` suppresses one `(logicalID, level, periodKey)`.
- `CanonicalLevelOverride` and `CanonicalOccurrenceOverride` layer title, icon, color, location, memo, reminders, and Live Activity.
- `CanonicalReflectionSnapshot` is append-only. `completeReflection` returns false if that id already exists.

Gaps that must be closed before Planning switches over:

1. **Event completion is on the payload.** `setCompleted` sets `CanonicalPayload.completed`. Checking one day of a repeating event would mark every projected day. Move event completion onto `CanonicalOccurrenceOverride.completed`. Tasks keep payload `completed` plus `todayTaskID`.
2. **Overrides do not follow a reschedule.** A level override stays on the old period key. An occurrence override stays on the old occurrence date. After `editPayload` changes `startDate` / `endDate` / recurrence, drop overrides whose key is no longer projected. Do not move them onto the new dates. Tombstones for days that leave the span become inert; if the span later covers that key again, the tombstone still hides it.
3. **Horizon.** With no `repeatEndDate`, occurrence generation stops at `PROJECTION_HORIZON_DAYS` (400) in both the Swift and TypeScript engines. The rule itself is stored. A later phase can page further; do not pre-create 400 Daily membership rows.
4. **No notification or ActivityKit fields are scheduled.** `reminders` and `liveActivity` are stored only.
5. **Samples.** `TemporaryPlanningSamples` must never be copied into `CanonicalPlanningPersistence`.
6. **`legacyMigration` is always `"unresolved"`.** `importLegacy` does not flip it. Keep that until a real WebKit reader exists.

Calendar reads `calendarDays` / `effectiveItems(..., .daily, dayKey)` only. It does not read Monthly, Weekly, or Future rows.

---

## D. Automatic projection and local deletion

Allowed directions, already encoded in `flows`:

- Tasks: Monthly → Weekly, Monthly → Daily, Weekly → Daily. Daily stays Daily. Future tasks stay Future (no downward rule exists; do not invent one).
- Events: Future → Monthly → Weekly → Daily, and Weekly → Daily. Daily, including a Calendar-created event, stays Daily.

One id produces one `effectiveItems` row per period key, even if two parent levels cover that day. Coverage walks every local date from start through end, inclusive. A span that crosses midnight is two dates when `endDate` is the next day. Week keys use Monday via `PeriodCalendar.firstWeekday = 2` / `weekStart`. Month keys are `yyyy-MM`. Future keys are the calendar year. Undated tasks (`startDate == nil`) appear only at `origin` + `originPeriodKey`.

`deleteLevel` inserts a tombstone and leaves the payload and other levels. It does not call `deleteLiveItem`. Reflection snapshots are not rewritten.

`PeriodCalendar.addSources` still offers `.monthly` and `.periods` (“Monthlyから追加”, “Monthly / Weeklyから追加”). Those two actions are removed only when Planning reads projections. `.plan`, `.create`, and `.postpone` stay.

Reschedule rules for the switch-over:

- Shorten: days outside the new span disappear because projection no longer emits them.
- Extend: new days appear unless a tombstone already names that key.
- Delete the origin period: tombstone that key only. Downstream days remain.
- Delete one Daily key: that day stays hidden if a later edit still covers it.

---

## E. Recurrence and Reflection rules

Verified frequencies in `RepeatFreq` and `CanonicalRepeatFrequency`: `none`, `daily`, `weekly`, `monthly`, `monthlyWeekday`, `yearly`. No custom interval. `repeatAllowedForSpan` rejects daily when the span is 1 day or more, and weekly when the span is 7 days or more. That gate is for the future editor. The store still projects a stored rule that fails it, and it does not delete or rewrite that rule.

Web exceptions (`events-store.ts`): `excludeDates`, `repeatEndDate` via `endSeriesOn`, detached rows via `saveOccurrenceException` (`recurrenceMasterId`, `recurrenceDate`). The canonical store uses `excludeOccurrence` and `editOccurrence` on `logicalID|yyyy-MM-dd` instead of a second payload. Do not also insert a detached payload.

Reflection (`ReflectionDisposition` in `PlanningModels.swift`: `.keep`, `.postpone`, `.stop`) is not recurrence. `ReflectionFlow` writes `PeriodReflectionRecord.decisions` and does not read `repeat`. When Planning switches:

- Completing Reflection does not call `createItem` for the next occurrence.
- Default series disposition is keep.
- An explicit postpone or stop writes `excludeOccurrence` for that date only.
- `completeReflection` must keep refusing a second write of the same snapshot id.

Event completion is a different field from Reflection. Checking the circle does not set `.keep` / `.postpone` / `.stop`.

### Event completion recommendation

Planning already draws a circle for events and a square for tasks (`PeriodListCheckbox`, `square: kind != .event`) and stores both on `PlanningNode.completed`. `setCompleted` shares completion across Daily tasks through `todayTaskID` only. `addCreatedItem` sets `todayTaskID` for Daily **tasks**, not events. So an event check does not mark a task, and it does not currently sync to Today.

For the shared model:

- Task completion stays `CanonicalPayload.completed` + `todayTaskID`. Today and Planning Daily keep using that one field.
- Event completion is `CanonicalOccurrenceOverride.completed` for that occurrence start date.
- A repeating event’s other dates stay unchecked.
- A multi-day non-recurring event is one occurrence (the start date). Checking it on any covered day checks that same occurrence, so the bar does not show three different states. **This multi-day reading is a product choice; see section M.**
- Calendar and Planning Daily both read that override. There is no second completion store.
- Haptic on the check is `PlanningHaptics.selection()` (`UISelectionFeedbackGenerator`). Month-wheel ticks stay a light impact.

---

## F. Native month and week layout

New files under `ios/App/App/Native/Features/Calendar/`. `CalendarRootView` replaces the placeholder only in the month/week stage.

Month:

- Fixed header and system `TabView` (`AppShell` already uses `.tabItem` and does not hide the tab bar).
- Vertical wheel, not a horizontal `TabView` or `ScrollView` paging axis.
- Three months mounted (previous, current, next), translated by finger offset.
- Current month’s grid height is the viewport minus a 44 pt top peek, an 88 pt bottom peek, and an 8 pt gap. The bottom peek may draw under the tab bar.
- Inside that height, the real week rows (4, 5, or 6) share the height equally. Do not force six rows.
- First week row includes the previous month’s dates that belong to that week. Last week row includes the next month’s dates that belong to that week. No additional row.
- Weekday header: 日 red, 土 blue, others `PlanningPalette.muted`, respecting week start.
- Today: accent disc and white or ink numeral using `PlanningPalette.accent`.
- Selected day: paper-tinted cell using `PlanningPalette.accent` at low opacity, matching `isSelected && "bg-accent/10"`.
- Holiday: Japanese `祝` in red. Port `jp-holidays.ts`; do not call the web module from Swift.
- Events only, as 13 pt bars. Span roles from `calendarEventSpan`. One logical id, one bar per day it covers.
- Second tap opens the day-list sheet.

Week:

- Same header. The mode control reads `月`.
- Range title is the week’s first and last local dates.
- Seven day cells, height independent of the month wheel.
- Event list under the strip uses `eventsForDate` order (all-day, then start minutes).
- The Blueprint’s 日曜始まり / 月曜始まり control is the migrated `weekStartsOn` preference. Default Monday if nothing was migrated.

`今日` sets the visible month or week and the selected day to the device’s local today (`PeriodCalendar.currentKey(.daily)`).

---

## G. Header, Menu, floating plus, and sheets

Header row is `PlanningTokens.Header.height` (72), horizontal inset 16, on `PlanningPalette.paper`, via `planningFixedHeader`. Do not use Today’s extra 30 pt title stack and do not add a `Calendar` title.

Left: `Menu` labeled `yyyy年M月` with `chevron.down`. Submenus are years and months. System presentation only. No custom morph.

Right group, one glass cluster, gap `Header.iconGroupGap` (8):

- Month mode: `週` then `今日`.
- Week mode: `月` then `今日`.
- Then a separate `NativeGlassIconButton(icon: .user)`. Visual size `Header.buttonVisual` (44) and hit size 44, same as Planning.

Floating plus:

- Do not use `PlanningNativeAddMenu` (that control is a `Menu`).
- Reuse the 50 pt circle and 21 pt semibold white plus from `PlanningNativeAddMenu.plusLabel`, as a `Button`.
- Default position matches Today: overlay `.bottomTrailing`, padding trailing 16, bottom 14, above the tab bar.
- Drag is allowed only between the header bottom and the tab-bar top. A new gesture; the WebView FAB (`fabPos` in `Calendar.tsx`) is reference behavior, not a view to embed.
- Reset to the default point when the tab changes, the month/week page changes, or any sheet or menu opens.
- Tap presents the shared event editor for a new Daily event on the selected day, or today if none is selected. No action menu.

Day list sheet: native sheet, paper or system grouped background, title `M月d日 EEEE`, trailing button “予定を追加” using the same 50 pt plus treatment inside the sheet header. Rows: circular event checkbox, title, clock range, `PlanningCategoryIconBubble`. This is not a task list.

Editor chrome: `PlanningSystemSheetChrome` (close, centered title, confirm). Dirty close uses the existing discard alert pattern (`この変更を破棄しますか？` on Planning editors). Delete uses the existing destructive confirmation, only when editing.

---

## H. Shared event editor specification

One sheet for Calendar create/edit and, later, Planning create/edit. Planning’s current editor (`PlanningItemEditorSheet`) stays until that stage. It has icon, color, title, optional schedule, and subtasks. It has no location, memo, reminders, recurrence, or Live Activity.

Field order:

1. Title. Empty title cannot confirm (`confirmEnabled` false), same rule as Future events (`FutureEventValidation` rejects an empty title and an end before the start).
2. Icon. `PlanningIconCatalog.symbols` (briefcase, book, house, cart, heart, airplane, then the rest of that array). Default for a new event: `calendar`, matching `PlanningEventRecord`. The “…” button opens the existing all-icons sheet.
3. Color. `PlanIconColor`: rose, peach, yellow, mint, sky, lavender. Default rose (`PlanIconColor.defaultID`).
4. Location. Single line. Default empty.
5. Memo. Multiline. Default empty. Web field is `notes`.
6. Start date and time. Existing `DatePicker` graphs in `PlanningItemSheets` / `FuturePages` (`.date` and `.hourAndMinute`, `.wheel` where those sheets already use it).
7. End date and time. Same pickers. End before start is rejected and not saved.
8. Notifications. One row. Value is the summary of the selection (“10分前”, or “2件” when several). Tap opens a multi-select sheet, not a `Menu`, because `reminders` is an array.
9. Recurrence. One row. A `Menu` is enough: the six frequencies are single-select.
10. Live Activity. Toggle. When on, show the lead row and the explanatory text. When off, hide them.
11. Delete. Existing events only, below the fold, destructive, confirmed.

Defaults for a new event, from `EventSheet` `blank` (not from the Blueprint’s 09:00):

- Start is the selected local day at the current clock.
- End is 60 minutes later, rolling the date if that crosses midnight.
- `allDay` false, reminders `[]`, repeat `none`, Live Activity off, lead `1h` stored but hidden until enabled.
- No all-day toggle. Migrated `allDay == true` keeps the flag and nil clocks, and the editor shows the dates without pretending a clock was saved. Turning Live Activity on for an all-day record stays disabled until a clock exists, matching `EventSheet` (`liveActivity && !allDay`).

Notification values, from `REMINDER_OPTIONS` in `EventSheet.tsx` and `reminderOffsetMinutes`:

`at`, `5m`, `10m`, `20m`, `30m`, `1h`, `2h`, `3h`, `4h`, `6h`, `8h`, `12h`, `24h`.

Legacy `15m` and `1d` still decode (`1d` equals `24h`). Do not offer them as new choices. Multiple selections are stored. Default is none.

Recurrence labels: なし, 毎日, 毎週, 毎月（日付）, 毎月（曜日）, 毎年. End date is optional (`repeatEndDate`). This phase’s editor can set frequency and an optional end. “この回だけ” vs “これ以降” is the existing `excludeOccurrence` / `endSeriesOn` split and belongs in the edit-existing flow, not as extra frequencies.

Live Activity leads offered in the picker (`LIVE_ACTIVITY_LEADS`): `8h`, `6h`, `4h`, `3h`, `2h`, `1h`, `30m`, `20m`, `10m`, `5m`. Default `1h`. `liveActivityLeadMinutes` also knows `12h` and `24h`, but `clampLiveActivityLead` forces those to `8h` because `LIVE_ACTIVITY_MAX_ACTIVE_MINUTES` is 480. Lock-screen linger constant is 12 hours (`LIVE_ACTIVITY_MAX_LOCK_SCREEN_HOURS`). All-day events skip Live Activity (`live-activity-window.ts`).

The explanatory copy currently lives in the WebView i18n strings used by `EventSheet`, not in Swift. Port the Japanese and English strings in the editor stage. Do not invent shorter copy. The reference image’s sentences about the countdown, the 8-hour cap, iOS 17.2, and offline limits match those comments in `events-store.ts` and `EventSheet.tsx`; confirm the exact i18n keys before pasting them into Swift.

Color map, already in `LegacyCalendarColorMap.resolved`:

| Web `EVENT_COLORS` | Planning |
| --- | --- |
| blue (212°) | sky |
| green (145°) | mint |
| orange (25°) | peach |
| pink (335°) | rose |
| purple (265°) | lavender |
| red, teal, gray | unresolved; keep `legacyColorKey`, do not guess |

---

## I. Notifications and Live Activities

What exists:

- Scheduling is `rescheduleAll` in `src/lib/notifications.ts`. It uses Capacitor `LocalNotifications`, cancels pending ids outside `50000...59999` (those are reflection notices), and schedules at most a horizon of upcoming occurrences. Ids are reassigned from 1 on every rebuild. `allowWhileIdle: true` is a plugin flag, not a Swift background mode.
- Permission helpers: `ensurePermission`, `checkPermission`, `getNotificationsUserEnabled`.
- ActivityKit types and the widget UI are native: `EssentialsAttributes.swift`, `LiveActivitiesPlugin.swift`, `LiveActivityRefreshCenter.swift`, `LiveActivityPushTokenCenter.swift`, `EssentialsWidgetLiveActivity.swift`. The plugin is a Capacitor bridge. The widget’s Lock Screen copy is the frozen relative-label text, not `Text(timerInterval:)`.
- `App.entitlements` has `aps-environment` = production only. No App Group entitlement was found. Do not add one unless a later measurement shows the widget cannot read the activity payload without it. ActivityKit does not require an App Group for the system to render an activity the app started.
- `Info.plist` deployment behavior is iOS 17.2 (`project.pbxproj`), light only (`UIUserInterfaceStyle` = Light), iPhone portrait only.

Native replacement, one scheduler per logical id:

- `UNUserNotificationCenter` requests, pending requests whose identifier is `event.<logicalID>.<occurrenceDate>.<reminder>`, and removal of that prefix on edit, delete, or `excludeOccurrence`.
- Do not schedule from Monthly and again from Daily. Schedule from the canonical payload plus its occurrence dates only.
- Recurrence edits cancel the old prefix and schedule the new occurrence set inside the same horizon `rescheduleAll` already uses. Read `HORIZON_DAYS` and `MAX_SCHEDULED` in `notifications.ts` at implementation time and keep those caps.
- Cross-midnight: the notification instant is the occurrence start minus the offset, in the device local calendar. DST is whatever `Calendar` produces for that local date; do not add a second timezone.
- Permission denied: store the user’s selection and schedule nothing. Do not loop prompts.
- A terminated app will not run custom code to start a Live Activity at lead time. Local notifications can fire from requests already submitted. Starting an activity in the background requires the existing push-to-start path (`LiveActivityPushTokenCenter`, `AppDelegate.registerForRemoteNotifications`). Do not promise a locally started activity while the app is killed.
- Offline: a local notification needs no network. The current Live Activity token upload (`LiveActivityTokenUploader`) does. The editor copy must keep that distinction.
- Reuse the widget extension and `EssentialsAttributes`. Replace the Capacitor call site, not the Lock Screen layout.
- All-day records do not start an activity.

Apple references: User Notifications, ActivityKit (activities end after about 8 hours of active time; the Lock Screen may keep the view longer, which is why the code clamps the lead to 8 hours and comments a 12-hour linger).

---

## J. Migration and persistence strategy

Persistence mechanism: one JSON document in `UserDefaults`, key `essences.canonical-planning.v1`, same pattern as `TodayPersistence`. `load` returns `.absent`, `.loaded`, or `.unreadable`. Unreadable data is not replaced with an empty success. `legacyMigration` stays `"unresolved"`.

Do not call `save` from `PlanningSession.persist` until the switch-over stage, and never encode `isSample` nodes.

Legacy WebView data:

- Not readable from Swift today. LevelDB website data is not JSON in `UserDefaults`.
- Do not delete `essences-app-data-v3` or `calendar-events`.
- `importLegacy` is the function a future explicit snapshot may call. It skips an id or `legacyWebID` that already exists. It does not overwrite a native title.
- Until that snapshot exists, the native Calendar opens on an absent store. That is not a finished migration.

Switch-over requirements, in order:

1. Occurrence-level event completion and orphan-override cleanup.
2. A single save call that writes only non-sample canonical records.
3. Planning reads `effectiveItems` instead of copied `periodItems` for events, then for tasks.
4. Replace `deleteLiveItem` for those records with `deleteLevel`. Leave the old function in place until every caller has moved.
5. Remove `.monthly` and `.periods` from `addSources`.
6. Only then point `CalendarRootView` at Daily projections.

Tab switches already keep `PlanningSession` alive in `AppState`. The canonical document must be held beside it, loaded once, and saved on change. Do not reload from `UserDefaults` on every tab appearance.

---

## K. Implementation file list

Stage 1 — store gaps (no UI):

- Edit `CanonicalPlanningStore.swift` and `src/lib/canonical-planning-foundation.ts`: occurrence completion, orphan override cleanup after span edits.
- Extend `canonical-planning-foundation.test.ts`.

Stage 2 — persistence wiring without samples:

- New `CanonicalPlanningSession.swift` (load/save, in-memory document, no view).
- Do not modify `TemporaryPlanningSamples.swift` to write the document.

Stage 3 — Planning projection switch:

- `PlanningPeriod.swift` (`addSources`, `deleteLiveItem` callers, `importSources`).
- `PlanningItemSheets.swift` (stop offering Monthly/Weekly copy).
- `PlanningModels.swift` only at the moment `periodItems` event rows are projections. Not before.

Stage 4 — shared editor:

- New `EventEditorSheet.swift` using `PlanningSystemSheetChrome`, `PlanningIconCatalog`, `PlanIconColor`, existing date pickers.
- Planning event create/edit calls it only after stage 3.

Stage 5 — month and week:

- New `CalendarMonthView.swift`, `CalendarWeekView.swift`, `CalendarWheel.swift`.
- Replace the body of `CalendarRootView` in `FeatureRoots.swift`.
- Port holiday rules to `JapaneseHolidays.swift`.

Stage 6 — day sheet:

- New `CalendarDaySheet.swift`.

Stage 7 — notifications and activities:

- New `CanonicalEventScheduler.swift` (`UNUserNotificationCenter`).
- Call the existing ActivityKit request types from that scheduler once per logical id. Do not edit `EssentialsWidgetLiveActivity.swift` copy.

Stage 8 — tests listed in section L.

No new event store and no second editor.

---

## L. Test plan and acceptance criteria

Already passing, and still the regression set: `canonical-planning-foundation.test.ts`, `planning-foundation.test.ts`, `native-ios-foundation.test.ts`, `today-foundation.test.ts`.

Add, before any UI:

- Occurrence check does not change another date or a task’s `completed`.
- Shortening a span drops the day; a tombstone on a remaining day stays; extending back over a tombstoned day does not show it.
- An override on a date that is no longer an occurrence does not apply to the new date.
- `completeReflection` still refuses a second write after those edits.
- Save/load round trip, missing optional fields, second import inserts 0.
- Sample nodes are not in the encoded document.

UI acceptance, on a later Simulator build (not claimed from Windows):

- Month wheel is vertical, 4/5/6 rows share one height, adjacent dates only inside the first and last real week, peeks match 44 and 88.
- Light impact once per month detent.
- Header is 72 pt, no `Calendar` title, `Menu` for the month, `週`/`月` label swaps, user button is 44 pt.
- Plus is 50 pt, resets when a sheet opens, tap opens the editor.
- Editor field order matches section H. Multi-select reminders. Six recurrence values. Live Activity lead list matches `LIVE_ACTIVITY_LEADS`.
- One Daily row per logical id. Delete Monthly leaves Daily.
- Light appearance, portrait iPhone, Japanese and English strings for the new screens.
- System tab bar unchanged.

`git diff --check` on touched paths. Swift compile only on the macOS Simulator workflow. Do not start that workflow from this phase.

---

## Stage 3A — Verified Legacy Data Access

Repository evidence, not a device run:

1. **Origin.** `capacitor.config.ts` and `ios/App/App/capacitor.config.json` set `appId` `com.confast.essences` and do not set `server.hostname`, `server.iosScheme`, or `server.url`. Capacitor 8’s defaults for those omitted fields are scheme `capacitor` and host `localhost`, so the historical document origin is `capacitor://localhost`. The repo does not contain `http://localhost` or `https://localhost` as the app server.
2. **Storage.** Both keys are `localStorage` in that origin’s `WKWebsiteDataStore`. `STORAGE_KEY` is `essences-app-data-v3` (`src/lib/v3/types.ts`). `calendar-events` is the leftover array in `events-store.ts`. V3 `events` is the calendar map. The same document also holds plans, tasks, notes, and routines. Those are not calendar events. `essences-cloud-owner-v1` (`cloud-session.ts`) is the local owner uid. The V3 blob itself is not per-user; stashes use `essences-app-data-v3:uid:`.
3. **Container.** `PRODUCT_BUNDLE_IDENTIFIER` is `com.confast.essences` in `project.pbxproj`. An in-place update with that id keeps the app container, including the default website data store. That survival is the platform rule, not something this repo has executed on a phone.
4. **Assets.** `AppDelegate` shows `NativeAppRoot` and does not create a Capacitor web view. `project.pbxproj` does not copy `dist` or `public`. The old JavaScript bundle is not in the native target.
5. **Bridge.** `LegacyWebViewDataReader` is not referenced by `AppState`. It loads an inert HTML response on `capacitor://localhost` through a `WKURLSchemeHandler`, then calls `localStorage.getItem` only. It does not call `setItem`, `removeItem`, or `clear`, and it does not write `essences.canonical-planning.v1`.
6. **Extraction.** The reader returns raw strings plus a coarse status. `classifyLegacyStorage` in `src/lib/legacy-webview-read.ts` is the tested validator. V3 schema 3 events win on the same id. `calendar-events` adds ids V3 does not have. `isSample: true` is skipped. Titles are not a sample test. Colors `red`, `teal`, and `gray` stay as stored. `startAt` stays the original local wall-clock string.
7. **Validation.** Absent keys are `accessibleButEmpty`, which is not a finished migration. Invalid JSON is `malformedData`. Another `schemaVersion` is `unsupportedFormat`. A failed navigation is `inaccessibleOrigin`. None of these set `legacyMigration`.
8. **Account.** Do not import until the signed-in uid equals `essences-cloud-owner-v1`. If that key is missing, or the uid differs, keep the rows local and unassigned. A previous user’s stash key can still be in the same WebView.
9. **Samples.** Canonical production saves already drop `isSample` payloads. This reader uses the same flag. Tutorial Planning rows are not in these WebView keys.
10. **PlanningSession.** `persist(into:)` writes navigation and tutorial keys only. `periodItems`, `events`, and `periodRecords` are memory. Routines and quick memos are `TodayPersistence` UserDefaults. A future cutover must copy non-sample in-memory Planning rows once before replacing the session. Do not open an empty canonical document over that memory.
11. **Device checks.** Confirm `capacitor://localhost` still has the keys after an update, that the inert handler can read them, and that the read does not change `localStorage` length.
12. **Blockers.** The reader has not run on WebKit. An older install that used a different scheme would be a different origin. Owner mismatch blocks automatic import.
13. **Stage 3A-2 diagnostic.** Planning’s existing User button opens `LegacyCalendarDiagnosticSheet`. It is not behind `#if DEBUG`. Remove it before a public release. The sheet calls `LegacyWebViewDataReader.read()` only after a tap. Swift `LegacyCalendarClassification` applies the same rules as `classifyLegacyStorage`: schema 3, V3 id precedence, explicit `isSample` skip, malformed versus empty. `LegacyCalendarClassification.owner` still compares `essences-cloud-owner-v1` with `Auth.auth().currentUser?.uid` and returns `matchingOwner`, `differentOwner`, `missingOwner`, `unauthenticated`, or `invalidOwnerMarker`. The uid is not shown. App Store 1.1 did not ship Google account linking, so that comparison is advisory. Import is offered when status is `availableWithData` and the candidate count is greater than zero, including signed-out, missing, blank, or different-owner states. The button asks for confirmation, then calls `CanonicalPlanningStore.importLegacy` through `CanonicalPlanningController.mutate`. It writes calendar events only. A series keeps its payload. `excludeDates` become occurrence exclusions. A detached row with `recurrenceMasterId` and `recurrenceDate` becomes an occurrence override when title, time, place, memo, reminders, and Live Activity are the only differences. A one-day color, icon, all-day, or span change defers the whole series: the parent is not inserted and no partial overrides are written. If that legacy id is already stored, the pass reports reconciliation and does not rewrite it. An occurrence child with no master is not created as a new event. An existing payload or override is not replaced, so a later title edit survives a second import. Missing compatible exclusions on an already imported supported series are added. The sheet shows series counts, not child rows as extra events. Import is offered only when at least one series is fully supported. The sheet reloads `essences.canonical-planning.v1` and shows that count. `legacyMigration` stays `"unresolved"`. WebKit keys are not deleted. Planning still reads `PlanningSession`. This import has not been confirmed on an iPhone. A fresh Simulator with no prior WebView data can report empty; that does not prove an upgrade. The iPhone check is an in-place TestFlight update, then Planning → User → 旧カレンダーデータを確認. A later TestFlight check showed six legacy events already stored: candidates 6, importable 0, already imported 6, deferred 0, reconciliation 0, persisted 6, save verified, no Firebase sign-in. That count was reloaded in the same session. A full quit and relaunch has not been confirmed. `PlanningCanonicalAdapter` only reads effective periods and previews a Planning handoff. It does not call `mutate`, does not run on launch, and does not rewrite those six `legacyWebID`s. Live Planning still uses `PlanningSession`. Stage 3B-2 does not switch it. Stage 3B-3A stores one-level children on `CanonicalPayload.parentID` and `childOrder`, and stores Reflection decisions in `reflectionDecisions` (`keep` / `postpone` / `stop`) separately from `completed`. Snapshots stay immutable. Stage 3B-3B stores Postpone Box rows in `postponeEntries`: a reference plus display fields, not a second payload. Live Planning also keeps the source item and adds a box row; canonical postpone does the same and does not tombstone the source. A recurring series without an occurrence date is rejected. Restoring a non-recurring item sets that payload and its children to the destination origin so Weekly restore projects Daily and does not stay on Monthly. `keep` and `stop` do not create box rows. `completeReflectionWithPostponements` writes the snapshot and box rows only after every postpone target validates; a repeat writes nothing. Sample box rows are dropped. Schema stays 1. A Postpone row with `logicalID` is convertible. Stage 3B-3C stores Plan documents in `plans` and one-level brainstorm rows in `planBullets`. Live Plans are not period tasks. Saved plans list newest `updatedAt` first. Unsaved drafts are omitted from that list. A save of an already saved plan increments `replanCount`. Bullets have stable ids, optional `parentID`, and `order`. A child of a child is rejected. `transferPlan` copies selected bullets into new payloads whose ids are `plan-copy:<bullet>:<level>:<period>:<kind>`. The plan text stays editable and is not rewritten onto the copy. The same operation id, or the same destination id, does not add another payload. A transfer to a different period does. Deleting a plan removes its bullets and leaves transferred payloads. The live session does not delete a saved plan; it only discards an unsaved draft. Sample plans and their bullets are dropped. A Plan candidate with a one-level bullet list is batch-convertible. An empty or deeper tree stays blocked. `batchConvertible` means this batch can be stored. `activationAllowed` stays false because live postpone restore can append a new node and drop children, and the latest completed Reflection can still be edited. `previewNativeHandoff` still does not write. The Weekly “Monthly から” and Daily “Monthly / Weekly から” menu choices stay. The approved sheet plus and the Today 50 pt plus are unchanged. The ToDo・予定 sheet plus uses `PlanningSheetAddMenu`, the same system circle as the sheet close button. Today’s plus stays the 50 pt `PlanningNativeAddMenu`.

---

## M. Unresolved blockers and decisions

Blockers:

1. `LegacyWebViewDataReader` can target `capacitor://localhost`, but no device has confirmed the keys are still there. Shipping Calendar before that read shows an empty native calendar to users who still have WebView events. Do not pretend migration ran.
2. Live Activity start while the process is suspended still depends on the existing push path. Local scheduling cannot replace it.

Decisions locked in Phase 2A. Visuals are not implemented yet.

1. **Completion.** One check per displayed local day. October 13 does not complete October 14. A recurring date does not complete the next date. Stored as `DayCompletion` (`logicalID` + date), not `CanonicalPayload.completed`. Instance identity stays `logicalID|occurrenceStart`. When several daily instances of a multi-day span cover one date, the cell stays one row and the check is that date only; instance titles apply only when a single instance covers the day.
2. **Overflow.** Draw as many bars as the cell height fits. Remaining count is a compact `+N` that opens the day list. Bars do not paint outside the cell. A multi-day bar continues across the days of a week row and starts again on the next row.
3. **Week start.** Calendar presentation defaults to Sunday, with a Monday option. `PeriodCalendar` membership weeks stay Monday. Changing the Calendar preference does not rewrite event ids, membership keys, or reflection snapshots. The selected date stays selected and the visible week is the one that contains it.
4. **Legacy colors.** Red, teal, and gray stay in `legacyColorKey` and are not rewritten onto rose, peach, yellow, mint, sky, or lavender. Rendering uses a deterministic fallback while the stored key remains. A later editor may replace that key only when the user picks a Planning pastel. The Planning picker does not gain extra swatches.

Compatibility, not a completed migration:

- An older event with `completed: true` and no `dayCompletions` displays as not completed. No historical day is invented. The payload flag is still decoded.
- A stored daily or weekly rule that `repeatAllowedForSpan` would reject in the editor is left unchanged and still projects. The shared editor phase must decide whether to show that rule, block saving a new overlap, or ask before rewriting it. This checkpoint does not choose that UI.

Not decisions, already specified: no all-day toggle, no task squares, no Monthly Goal, no stamps, no custom tab bar, no change to the native `Menu` animation, samples stay out of the canonical file.

Not decisions, already specified: no all-day toggle, no task squares, no Monthly Goal, no stamps, no custom tab bar, no change to the native `Menu` animation, samples stay out of the canonical file.

---

## Safe to implement next

Stage 1 only: occurrence-level event completion and orphan-override cleanup inside the canonical store and its tests. Do not point `CalendarRootView` or `PlanningSession` at the store in that change.
