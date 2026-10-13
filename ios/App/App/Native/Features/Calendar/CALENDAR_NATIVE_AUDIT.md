# Native Calendar rebuild — source audit

Status: investigation only. No Calendar UI, persistence, propagation, Reflection, notification, or ActivityKit behavior was changed.

Scope inspected: `ios-native-rebuild` working tree. The WebView calendar still lives under `src/`. `webview-baseline` was not checked out and was not merged. Claims below are from this tree unless marked **NOT VERIFIED**.

Native Calendar today is a placeholder: `CalendarRootView` in `ios/App/App/Native/Features/FeatureRoots.swift` renders `NativeFeaturePlaceholder(tab: .calendar)`. It does not mount `src/pages/Calendar.tsx`.

---

## A. Legacy WebView file map

| Area | Path | Role |
| --- | --- | --- |
| Month/week page | `src/pages/Calendar.tsx` | View mode, grids, swipe, holiday names, day selection, sheet launch |
| Month wheel | `src/components/MonthWheel.tsx` | Month paging and `tickHaptic` |
| Week wheel | `src/components/WeekWheel.tsx` | Week paging and haptics |
| Week list | `src/components/WeekEventList.tsx` | Week event rows |
| Day sheet | `src/components/calendar/CalendarDaySheet.tsx` | Day contents |
| Day content | `src/components/calendar/CalendarDayContent.tsx` | Events inside a day |
| Event editor | `src/components/EventSheet.tsx` | Create/edit fields, repeat, reminders, Live Activity |
| Event model | `src/lib/events-store.ts` | `CalendarEvent`, recurrence, exceptions, color tokens |
| V3 adapter | `calendarEventToV3Item` / `v3ItemToCalendarEvent` in `events-store.ts` | Maps to `CalendarEventItem` |
| Repository | `src/lib/v3/repository.ts` (`events`) | Persisted V3 store |
| Prefs | `src/lib/calendar-prefs.ts` | Month/week mode, week start, swipe hints |
| Holidays | `src/lib/jp-holidays.ts` | Japanese public holidays |
| Display | `src/lib/event-display.ts`, `src/lib/week-timeline.ts` | Labels and timed layout |
| Notifications | `src/lib/notifications.ts` | Capacitor `LocalNotifications` |
| Live Activity window | `src/lib/live-activity-window.ts` | Which occurrences may be active |
| Stamps | `StampTray.tsx`, `CalendarStampLayer.tsx`, `src/lib/calendar-stamp-drag.ts` | Decorative stamps, not events |
| Wallpaper | `WallpaperPickerSheet.tsx`, `DayWallpaperLayer.tsx` | Day background |
| Legacy key | `LEGACY_KEY = "calendar-events"` in `events-store.ts` | One-time leftover import |

## B. Current native implementation file map

| Area | Path | Role |
| --- | --- | --- |
| Calendar tab | `FeatureRoots.swift` `CalendarRootView` | Placeholder only |
| Period items | `PlanningNode` in `PlanningModels.swift` | Task/event membership per bucket and period |
| Event record | `PlanningEventRecord` | Title, month span, times, icon, color. No location, memo, reminders, repeat, or Live Activity |
| Session | `PlanningSession` | In-memory items, events, reflection, postpone box |
| Navigation persist | `PlanningSession.persist(into:)` | Section, period keys, tutorial flags only. Does not encode events or nodes |
| Copy / import | `placeCopy`, `copyMonthlyTasks`, `importSources`, `linkWeeklyEvent` in `PlanningPeriod.swift` | Manual downward copies |
| Delete | `deleteLiveItem` | Removes every node sharing `logicalID`, `eventID`, or `todayTaskID` |
| Future months | `FuturePages.swift` `belongs` / `covers` | Which `PlanningEventRecord`s fall in a month or day |
| Reflection | `ReflectionDisposition` (`.keep`, `.postpone`, `.stop`) in `PlanningModels.swift`; `ReflectionFlow.swift` | Classification is not recurrence-aware |
| Add menu | `PeriodCalendar.addSources` | Monthly: plan, create, postpone. Weekly adds monthly. Daily: periods, create, postpone |
| Live Activity native | `ios/App/App/LiveActivities/*`, `ios/App/EssentialsWidget/EssentialsWidgetLiveActivity.swift` | ActivityKit widget and push-token plumbing for the existing web bridge |
| Local notifications plugin | `CapApp-SPM/Package.swift` `CapacitorLocalNotifications` | Web plugin, not a Swift calendar scheduler |

## C. Functionality inventory

| Feature | Where | User-facing | Persistence | Status |
| --- | --- | --- | --- | --- |
| Month grid | `Calendar.tsx` `MonthGrid` | Seven columns, leading blanks from `monthGridLeadingBlanks` | View only | Implemented in WebView. Not in native tab |
| Week view | `Calendar.tsx` `weekDaysFromAnchor`, `WeekEventList.tsx` | Seven days from `weekStartsOn` | Mode saved | Implemented in WebView |
| Month/week switch | `loadCalendarViewMode` / `saveCalendarViewMode` | Month or week | `calendar-prefs` localStorage | Implemented |
| Swipe | `MonthWheel`, `WeekWheel`, `WEEK_HINT_SWIPE_PX` | Horizontal paging | Hint flags in prefs | Implemented |
| Date selection | `Calendar.tsx` sheet requests | Opens day or editor | None | Implemented |
| Multiple events per day | `eventsForDate` | Listed for that YMD | V3 `events` | Implemented |
| Multi-day / cross-month | `date` + `endDate`, `eventOccursOn`, `eventSpanDays` | Spans inclusive dates | V3 item `startAt`/`endAt` | Implemented in WebView model |
| Colors | `EVENT_COLORS` keys blue, green, orange, pink, purple, red | Swatches in `EventSheet` | `color` string | Different palette from Planning `PlanIconColor` |
| Location, notes | `CalendarEvent.location`, `.notes` | Editor fields | V3 via adapter | Implemented. Absent on `PlanningEventRecord` |
| Start/end time | `startTime` / `endTime` `HH:mm` | Editor | Adapter clocks | Implemented |
| All-day | `allDay` | Toggle in editor; `EventSheet` new drafts set `allDay: false` | Stored boolean | Implemented. Timed events use clocks; all-day omits clocks |
| Reminders | `ReminderOffset` set, `getReminders` | Multi-select leads | `reminders` | Implemented. Scheduling is Capacitor, not native Planning |
| Repeat | `RepeatFreq` none, daily, weekly, monthly, monthlyWeekday, yearly | Editor options in `EventSheet` | `recurrence.freq` plus `excludeDates`, `repeatEndDate`, exception ids | Implemented. No arbitrary custom RRULE. **Custom interval / count NOT VERIFIED as absent beyond these enums** |
| Exception edit | `saveOccurrenceException`, `excludeOccurrence`, `endSeriesOn`, `replaceSeriesFromDate` | This occurrence vs series | Detached copy + master exclude | Implemented in store. Native Reflection does not call these |
| Delete event | `deleteEvent` | Removes one id | V3 | Web delete is id-scoped. Native `deleteLiveItem` is identity-scoped |
| Holidays | `getJapaneseHolidayName` | Name on the cell | Computed, not stored | Implemented for JP rules in `jp-holidays.ts` |
| Month haptic | `tickHaptic` from `MonthWheel` / `WeekWheel` | Tick on detent | None | Web haptics. Native checkbox haptics are separate (`PlanningHaptics`) |
| Stamps | stamp tray and drag | Placed glyphs | V3 stamps | Implemented. Not an event. Out of the new cell spec unless requested |
| Wallpaper | wallpaper sheets | Day background | V3 | Implemented. Not requested for the new month grid |
| Search | — | — | — | **NOT VERIFIED** as a calendar search feature |
| Monthly Goal on Calendar | — | — | — | Not found as a Calendar section in `Calendar.tsx`. Do not reintroduce one |
| Native month/week UI | `CalendarRootView` | Placeholder | None | Not implemented |

## D. Month and week view behavior

Month (`MonthGrid`): builds a grid from the month’s leading blanks (`weekStartsOn` 0 Sunday or 1 Monday). Each cell can show the holiday name and the day’s events. Stamps are a separate layer. Swipe changes the visible month through `MonthWheel` and fires `tickHaptic`.

Week: `weekDaysFromAnchor` uses `startOfWeek`. The selected day stays aligned with `selectedOffsetInWeek`. Events for those seven dates come from `eventsForDate` / range helpers. Ordering inside the week list is **NOT VERIFIED** beyond file presence of `WeekEventList.tsx`.

Prefs (`calendar-prefs.ts`): `essences` view mode and week start are localStorage. Native Planning has its own `weeklyEnabled` and period keys in `TabNavigationState`, not these keys.

Cells today can show more than events (stamps). The new contract is events only, no ToDos. Web calendar ToDo entry points exist (`setTaskSheetRequest` with `createdFrom: "calendar"` in `Calendar.tsx`). Those tasks are not Planning `PlanningNode`s.

## E. Event editor options and field mapping

| Field | Web `CalendarEvent` | Native `PlanningEventRecord` / `PlanningNode` | Future owner |
| --- | --- | --- | --- |
| Title | `title` | `title` | Canonical event |
| Start date | `date` | `year`, `month`, `startDay` | Canonical event, local date |
| End date | `endDate` | `endYear`, `endMonth`, `endDay` | Canonical event |
| Start/end time | `startTime`, `endTime` | `timeMinutes`, `endTimeMinutes` | Canonical event |
| All-day | `allDay` | Absent | Keep stored meaning: all-day means the local dates with no clock. Do not drop the flag on migration. New editor omits the toggle; represent migrated all-day rows as date-only |
| Color | `EVENT_COLORS` keys | `colorID` (`PlanIconColor`) | Planning six pastel ids. Map web keys explicitly; do not assume names match |
| Icon | Absent | `iconSymbol` | Planning icon |
| Location, notes | `location`, `notes` | Absent | Canonical event |
| Reminders | `reminders` | Absent | Canonical event, one schedule per logical event |
| Repeat | `repeat` + exception fields | Absent | Canonical series |
| Live Activity | `liveActivity`, `liveActivityLead` | Absent | Canonical event |
| Level membership | None | `PlanningNode.bucket`, `periodKey`, `logicalID`, `eventID` | Membership rows, not copies of the payload |
| Reflection | None on the web event | `reflectionDisposition` on the node | Occurrence override, not the series |

`EventSheet` draft defaults (`allDay: false`, empty reminders, `repeat: "none"`) show the editor can create timed non-repeating events. Repeat choices are the six `RepeatFreq` values, not a custom rule builder.

## F. Notifications audit

`src/lib/notifications.ts` uses Capacitor `LocalNotifications`:

- `ensurePermission` / `checkPermission` / settings links
- `rescheduleAll` cancels then `schedule`s with `allowWhileIdle: true`
- `scheduleReflectionNotices` uses separate ids so reflection notices are not doubled

Event reminder ids and the exact cancel-on-edit path are inside `rescheduleAll` (**per-id format NOT VERIFIED line by line**). This does not run inside `PlanningSession`. The native binary links `CapacitorLocalNotifications` for the web bridge.

Apple constraint: local notification scheduling is available while the app is running and for already-scheduled requests. A pure Swift replacement should use `UNUserNotificationCenter`. Background refresh is not a substitute for scheduled local notifications. [User Notifications](https://developer.apple.com/documentation/usernotifications).

## G. Live Activities audit

Web: `live-activity-window.ts` refuses all-day events and clamps the lead with `effectiveLiveActivityLeadMinutes` to `LIVE_ACTIVITY_MAX_ACTIVE_MINUTES` (8 hours). Lock-screen linger constant is 12 hours. The picker still lists 12h and 24h; they are clamped.

Native: `LiveActivitiesPlugin.swift`, `LiveActivityRefreshCenter.swift`, `LiveActivityPushTokenCenter.swift`, `EssentialsWidgetLiveActivity.swift`, `EssentialsAttributes.swift`. These serve the existing Capacitor/web activity, including push-to-start tokens. They do not read `PlanningEventRecord`.

Apple constraints: an activity stays active at most about 8 hours; the Lock Screen can keep it longer (the code comments 12 hours). Starting an activity requires the app to be in an allowed execution state; push-to-start needs the ActivityKit push setup already sketched in `AppDelegate`. [ActivityKit](https://developer.apple.com/documentation/activitykit). Do not promise a new Live Activity from a killed app without that push path.

One logical event must schedule one activity. Level copies must not call `Activity.request` again.

## H. Recurrence audit

Verified in `events-store.ts`:

- Frequencies: `none`, `daily`, `weekly`, `monthly`, `monthlyWeekday`, `yearly`
- `repeatEndDate` stops the series on/after that date (`endSeriesOn`)
- `excludeDates` skips one occurrence (`excludeOccurrence`)
- `saveOccurrenceException` writes a detached event (`recurrenceMasterId`, `recurrenceDate`)
- `eventOccursOn` / `occurrenceStartForDate` decide if a date shows the series
- `repeatAllowedForEvent` gates which frequencies a span may use

Not found: arbitrary “every N days”, count-based end separate from `repeatEndDate`, or native Planning recurrence. Editing one occurrence versus the series is implemented in the web store, not in Reflection.

## I. Current Planning propagation and deletion

Propagation is manual:

- `PeriodCalendar.addSources`: Daily offers `.periods` (“Monthly / Weeklyから追加”), Weekly offers `.monthly`, Monthly does not offer an upward source.
- `importSources` / `placeCopy` / `copyMonthlyTasks` / `linkWeeklyEvent` create another `PlanningNode` that shares `logicalID` or `eventID`.
- There is no automatic date-coverage projection. A Monthly item does not appear on Weekly or Daily until a copy is made.
- Future events are `PlanningEventRecord`s filtered by `FuturePages` `belongs` / `covers`. That is not the same object as a Daily `PlanningNode`.

Deletion is not level-local. `deleteLiveItem` (`PlanningPeriod.swift`):

- Events: deletes the `PlanningEventRecord` where `id` or `sourceEventID` matches, then every `periodItems` row with that `eventID` or `logicalID`.
- Tasks: deletes every row whose `id`, `logicalID`, or `todayTaskID` matches.

That contradicts the new rule that deleting Monthly must leave Weekly and Daily memberships in place.

Today/Daily task completion already shares `todayTaskID` and `setCompleted`. Keep that path. It is not the same as event propagation.

## J. Proposed directional propagation

Do not implement in this change. Target rules:

Tasks, downward only: Monthly → Weekly, Monthly → Daily, Weekly → Daily. Never Weekly → Monthly or Daily → upward.

Events: Future → Monthly, Monthly → Weekly, Monthly → Daily, Weekly → Daily. Never upward. A Calendar-created event is a Daily membership only.

After this exists, the period plus menu can drop “add from Monthly/Weekly” (`.monthly`, `.periods`). Keep Plan, New, and Postpone Box until a separate product pass says otherwise.

Implementation shape: one canonical payload plus membership rows `(logicalID, bucket, periodKey, tombstone?)`. Projection fills a missing membership when the origin level and the date coverage allow it. A tombstone blocks regeneration after a local delete.

Unscheduled tasks (nil start/end) have no date coverage. Do not invent a day. They stay on the level where they were created until the user assigns dates. Product confirmation is still required.

## K. Calendar / Daily canonical event model

Recommended store:

1. `CanonicalEvent` — id, title, local start/end date and optional clocks, all-day flag, icon, Planning color id, location, notes, reminder set, recurrence rule, Live Activity lead, series exception list.
2. `LevelMembership` — logical id, bucket (`future` / `monthly` / `weekly` / `daily`), period key, tombstone.
3. Calendar reads Daily memberships whose period key is that local day, joined to `CanonicalEvent`. It does not store a second event body.

`PlanningEventRecord` and web `CalendarEvent` both fold into (1). `PlanningNode` event rows become (2). `eventID` on the node points at the canonical id.

Duplicates: if Monthly and Weekly both cover the same day, projection inserts one Daily membership per canonical id, not one per path.

Native `PlanningSession.events` is in-memory (samples plus runtime edits). `persist(into:)` does not save it. Treat native Planning events as **not durable** until a store is added.

## L. Recurrence and Reflection

`ReflectionDisposition` is `.keep`, `.postpone`, `.stop` on a `PlanningNode`. `ReflectionFlow` applies that to the node it classified. It does not read `repeat` or `excludeDates`.

Proposed rule, not implemented:

- Default for a series is keep: completing Reflection does not call `replaceSeriesFromDate` and does not insert a new future copy.
- An explicit postpone or stop writes an occurrence exception (`excludeDates` or a detached row) for that date only.
- Changing the series remains an editor action (`endSeriesOn` / `replaceSeriesFromDate`).
- Completion (`PlanningNode.completed` / Today) stays separate from disposition.

## M. Multi-day and cross-period behavior

Web: `eventOccursOn` treats the span as date-inclusive. Cross-month uses `endDate`. Cross-midnight is two local dates when end date differs.

Native: `PlanningEventRecord` can store `endYear` / `endMonth` / `endDay`. `FuturePages.covers` uses that range. `eventsRelevantToWeek` only checks `startDay` inside the week, so a span that starts before the week and covers it can be missed. **That gap is in the current function.** Time zones: web YMD helpers use local `Date` components; native `PeriodCalendar` uses its calendar. DST: **NOT VERIFIED** with a fixture. Year boundaries: Future records have year/month fields; web `endDate` can cross years. Both must be tested before projection.

A Monthly event from 30 Oct through 3 Nov should produce one canonical span, Monthly memberships for both months, Weekly memberships for each touched week, and Daily memberships for 30 Oct–3 Nov. One Daily row per day per id.

## N. Migration and compatibility

Web events live in the V3 repository (localStorage in the WebView) plus a one-time import from `calendar-events` guarded by `essences-calendar-adapter-imported-v1`. The native shell does not read WKWebView localStorage. **Access path from the SwiftUI app to that store is NOT VERIFIED.** If the WebView origin is still on device, a one-time export bridge is required; do not assume the keys are in `UserDefaults`.

Plan:

- Read each web `CalendarEvent` / `CalendarEventItem` once.
- Insert `CanonicalEvent` keyed by the existing string id (stable UUID derived from that id).
- Record a migration marker. Second launch no-ops ids already present.
- If a native event with a newer `updatedAt` exists, do not overwrite it. Native records currently have no `updatedAt` on `PlanningEventRecord`; add one before migration.
- Map reminder and Live Activity fields onto the canonical event. Map color keys through an explicit table.
- All-day stays a flag with nil clocks so the dates remain.
- Do not delete the web store in the first release.

## O. Blueprint requirements

- Paper background, shared header metrics, system `TabView`, light appearance.
- Header: tappable `2026年10月` using a system `Menu` (year/month), not a custom morph. Grouped `週` and `今日`. User button matches Planning/Today (`NativeGlassIconButton`).
- Month grid: 7 columns, variable row count, holidays from the same JP rules, event chips only, existing Planning colors after mapping, horizontal paging, haptic on month change.
- Week: same header; `週` toggles mode; preserve week-start preference.
- No Monthly Goal section. No ToDo checkboxes in cells.
- Editor: Planning sheet chrome; Calendar fields plus icon and six pastels; no all-day toggle in the new UI.
- Menu animation for add actions stays the system `Menu`.

## P. Technical risks

- `deleteLiveItem` identity wipe vs level-local tombstones.
- Two event shapes (`CalendarEvent` vs `PlanningEventRecord`) and two color sets.
- Native events are not persisted.
- Web notifications and Live Activities are Capacitor/ActivityKit-bridge code. Reusing the plugin from a pure SwiftUI screen is **NOT VERIFIED**.
- `eventsRelevantToWeek` ignores spans that start before the week.
- Recurrence exceptions vs Reflection `.stop` can double-apply if both write the series.
- System `Menu` year/month picker: deep year lists may be awkward. **Menu usability for a year grid is NOT VERIFIED on device.**
- Plus-button glass size: `.controlSize(.large)` was stacking on a framed label. Removed for the add menu only. Device size still needs a look.

## Q. Decisions requiring approval

1. Unscheduled tasks: stay only on their origin level until dates exist. Confirm.
2. All-day migration: keep the flag, hide the toggle. Confirm display as date-only.
3. Color map from `EVENT_COLORS` to `PlanIconColor`. Needs an explicit table.
4. Whether stamps and wallpapers ship in v1. Not in the month-cell contract.
5. Whether Calendar-created ToDos (`createdFrom: "calendar"`) are dropped.
6. Postpone Box and Plan import stay while automatic propagation replaces only `.monthly` / `.periods`. Confirm.
7. How to read WebView localStorage from the native app, or accept that old events wait for an export.

## R. Proposed phases

1. **Canonical event and membership store**, including tombstones, persistence, and an idempotent web import. No new screens. Validates delete-local and “no duplicate on relaunch”.
2. **Projection**: Future/Monthly/Weekly/Daily coverage, span and timezone fixtures, single Daily row per day. Then remove `.monthly` / `.periods` from `addSources`.
3. **Recurrence exceptions and Reflection**: occurrence-only postpone/stop; series edits stay in the editor.
4. **Native month and week UI** on paper, system header, holidays, event chips, haptics. Read-only against the store.
5. **Shared editor sheet** for Calendar and Planning (location, memo, reminders, repeat, Live Activity, icon, color).
6. **Swift notifications and Live Activities** scheduled once per canonical id, with cancel on edit/delete. TestFlight on a device.

Each phase is separately testable. Do not start phase 4 UI until phase 1–2 ids are stable.
