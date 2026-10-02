import SwiftUI

// MARK: - Icons

enum PlanIconCatalog {
    static let defaultID = "leaf"
    static let all: [(id: String, symbol: String)] = [
        ("leaf", "leaf"),
        ("book", "book"),
        ("house", "house"),
        ("heart", "heart"),
        ("airplane", "airplane"),
        ("briefcase", "briefcase")
    ]

    static func symbol(for id: String) -> String? {
        all.first { $0.id == id }?.symbol
    }
}

// MARK: - Search

enum PlanSearch {
    /// Matches title, memo, and every bullet / subtask text. Empty query returns everything.
    static func filter(_ plans: [PlanDocument], query: String) -> [PlanDocument] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return plans }
        return plans.filter { plan in
            let texts = [plan.title, plan.memo] + plan.bullets.flatMap { [$0.text] + $0.children.map(\.text) }
            return texts.contains { $0.localizedCaseInsensitiveContains(needle) }
        }
    }
}

// MARK: - Shared pieces

private enum PlanDateText {
    static func string(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd"
        return formatter.string(from: date)
    }
}

/// Top bar for full-screen Plan pages: back on the left, centered title, optional trailing action.
private struct PlanPageBar<Trailing: View>: View {
    let title: String
    let onBack: () -> Void
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        ZStack {
            Text(title)
                .font(.headline)
                .foregroundStyle(PlanningPalette.ink)
                .lineLimit(1)
                .padding(.horizontal, 64)
                .allowsHitTesting(false)
            HStack {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back", action: onBack)
                Spacer()
                trailing()
            }
        }
        .padding(.horizontal, PlanningTokens.contentInset)
        .frame(height: 52)
    }
}

private struct PlanCtaButton: View {
    let title: String
    var fill: Color = PlanningPalette.plan
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
                .frame(maxWidth: .infinity)
                .frame(height: PlanningTokens.Editor.ctaHeight)
                .background(fill, in: RoundedRectangle(cornerRadius: PlanningTokens.Editor.ctaCorner, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: PlanningTokens.Editor.ctaCorner, style: .continuous)
                        .stroke(PlanningPalette.line, lineWidth: 1)
                )
                .opacity(isEnabled ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, PlanningTokens.Editor.ctaInset)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

/// One plan card: icon, title, last updated date, replan count. The whole card is the tap target.
private struct PlanCardRow: View {
    let plan: PlanDocument
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                Image(systemName: PlanIconCatalog.symbol(for: plan.resolvedIconID) ?? "leaf")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(PlanningPalette.ink)
                    .frame(width: PlanningTokens.PlanMain.cardIcon, height: PlanningTokens.PlanMain.cardIcon)
                    .background(PlanningPalette.plan.opacity(0.6), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(plan.title.isEmpty ? "無題のプラン" : plan.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                        .lineLimit(1)
                    Text("\(PlanningText.string(.lastUpdated)) \(PlanDateText.string(plan.updatedAt))")
                        .font(.system(size: 12))
                        .foregroundStyle(PlanningPalette.muted)
                    Text("\(PlanningText.string(.replanCount)) \(plan.replanCount)")
                        .font(.system(size: 12))
                        .foregroundStyle(PlanningPalette.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(PlanningTokens.PlanMain.cardInset)
            .frame(maxWidth: .infinity, minHeight: PlanningTokens.PlanMain.cardMinHeight, alignment: .leading)
            .background(PlanningPalette.paper, in: RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.cardCorner, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.cardCorner, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Plan main page

struct PlanListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: PlanningTokens.PlanMain.iconGap) {
                    PlanningHeadingIconSlot()
                    Text(PlanningText.string(.planIntroTitle))
                        .font(.system(size: PlanningTokens.PlanMain.titleSize, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .padding(.top, PlanningTokens.PlanMain.titleTop)

                Text(PlanningText.string(.planIntroBody))
                    .font(.system(size: PlanningTokens.PlanMain.paragraphSize))
                    .lineSpacing(PlanningTokens.PlanMain.paragraphLineSpacing)
                    .foregroundStyle(PlanningPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, PlanningTokens.PlanMain.titleToParagraph)

                Button {
                    let id = session.beginPlan()
                    navigation.path.append(PlanningRoute.planEditor(id))
                } label: {
                    Text("＋  \(PlanningText.string(.newPlanButton))")
                        .font(.system(size: PlanningTokens.PlanMain.buttonFontSize, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: PlanningTokens.PlanMain.buttonHeight)
                        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.buttonCorner, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.buttonCorner, style: .continuous)
                                .stroke(PlanningPalette.line, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .padding(.top, PlanningTokens.PlanMain.paragraphToButton)

                planListContainer
                    .padding(.top, PlanningTokens.PlanMain.buttonToList)
            }
            .padding(.horizontal, PlanningTokens.contentInset)
            .padding(.bottom, 24)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
    }

    /// One outer container. "プランの一覧" is always shown, even with no plans.
    private var planListContainer: some View {
        VStack(alignment: .leading, spacing: PlanningTokens.PlanMain.cardGap) {
            HStack {
                Text(PlanningText.string(.planListTitle))
                    .font(.system(size: PlanningTokens.PlanMain.listHeaderSize, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Spacer()
                Button {
                    navigation.path.append(PlanningRoute.planList)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(PlanningPalette.muted)
                        .frame(width: PlanningTokens.PlanMain.chevronHit, height: PlanningTokens.PlanMain.chevronHit)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(PlanningText.string(.planListTitle))
            }
            .padding(.leading, 4)

            let previews = session.previewPlans
            if previews.isEmpty {
                Text(PlanningText.string(.noPlans))
                    .font(.system(size: 15))
                    .foregroundStyle(PlanningPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
            } else {
                ForEach(previews) { plan in
                    PlanCardRow(plan: plan) {
                        navigation.path.append(PlanningRoute.planEditor(plan.id))
                    }
                }
            }
        }
        .padding(PlanningTokens.PlanMain.listPadding)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.listCorner, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.listCorner, style: .continuous)
                .stroke(PlanningPalette.line, lineWidth: 1)
        )
    }
}

// MARK: - Plan list page

struct PlanFullListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var query = ""

    var body: some View {
        let plans = PlanSearch.filter(session.savedPlansNewestFirst, query: query)
        VStack(spacing: 0) {
            PlanPageBar(title: PlanningText.string(.planListTitle), onBack: { navigation.pop() }) { EmptyView() }
            searchField
                .padding(.horizontal, PlanningTokens.Search.inset)
                .padding(.bottom, 10)
            ScrollView {
                LazyVStack(spacing: PlanningTokens.PlanMain.cardGap) {
                    if plans.isEmpty {
                        Text(PlanningText.string(query.isEmpty ? .noPlans : .noSearchResults))
                            .font(.system(size: 15))
                            .foregroundStyle(PlanningPalette.muted)
                            .padding(.top, 32)
                    } else {
                        ForEach(plans) { plan in
                            PlanCardRow(plan: plan) {
                                navigation.path.append(PlanningRoute.planEditor(plan.id))
                            }
                            .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: PlanningTokens.PlanMain.cardCorner, style: .continuous))
                        }
                    }
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.bottom, 24)
            }
            .planningScroll()
        }
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField(PlanningText.string(.searchPlans), text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: PlanningTokens.Search.height)
        .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - Plan new / edit page

struct PlanEditorPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let planID: UUID

    @State private var title = ""
    @State private var iconID = PlanIconCatalog.defaultID
    @State private var bullets: [PlanBullet] = [PlanBullet()]
    @State private var memo = ""
    @State private var isNewPlan = true
    @State private var savedSnapshot = ""
    @State private var confirmDiscard = false
    @FocusState private var focusedID: UUID?

    var body: some View {
        VStack(spacing: 0) {
            PlanPageBar(
                title: PlanningText.string(isNewPlan ? .newPlan : .editPlan),
                onBack: requestClose
            ) {
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: save)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: PlanningTokens.Editor.sectionGap) {
                    titleSection
                    iconSection
                    bulletsSection
                    memoSection
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, 6)
                .padding(.bottom, 20)
            }
            .planningScroll()
            VStack(spacing: 2) {
                PlanCtaButton(title: PlanningText.string(.reflectToItems), action: reflect)
                    .disabled(!canTransfer)
                if !canTransfer {
                    Text(PlanningText.string(.saveBeforeReflect))
                        .font(.system(size: 12))
                        .foregroundStyle(PlanningPalette.muted)
                        .padding(.bottom, 6)
                }
            }
        }
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .onAppear(perform: load)
        .alert(PlanningText.string(.discardTitle), isPresented: $confirmDiscard) {
            Button(PlanningText.string(.cancel), role: .cancel) {}
            Button(PlanningText.string(.discard), role: .destructive) { leave() }
        }
    }

    // MARK: Sections

    private func sectionLabel(_ key: PlanningText.Key) -> some View {
        Text(PlanningText.string(key))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(PlanningPalette.muted)
    }

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(.titleLabel)
            TextField(PlanningText.string(.titlePlaceholder), text: $title)
                .font(.system(size: 17))
                .foregroundStyle(PlanningPalette.ink)
                .padding(.horizontal, 12)
                .frame(height: PlanningTokens.Editor.fieldHeight)
                .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        }
    }

    private var iconSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(.iconLabel)
            HStack(spacing: 8) {
                ForEach(PlanIconCatalog.all, id: \.id) { entry in
                    Button {
                        iconID = entry.id
                    } label: {
                        Image(systemName: entry.symbol)
                            .font(.system(size: 19, weight: .medium))
                            .foregroundStyle(PlanningPalette.ink)
                            .frame(width: PlanningTokens.Editor.iconCell, height: PlanningTokens.Editor.iconCell)
                            .background(PlanningPalette.card, in: Circle())
                            .overlay(
                                Circle().stroke(iconID == entry.id ? PlanningPalette.ink : PlanningPalette.line,
                                                lineWidth: iconID == entry.id ? 2 : 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(entry.id)
                    .accessibilityAddTraits(iconID == entry.id ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var bulletsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(.bulletsLabel)
            VStack(alignment: .leading, spacing: 0) {
                ForEach($bullets) { $bullet in
                    HStack(spacing: 10) {
                        Circle().fill(PlanningPalette.ink).frame(width: 7, height: 7)
                        TextField(PlanningText.string(.parentPlaceholder), text: $bullet.text)
                            .font(.system(size: 16))
                            .focused($focusedID, equals: bullet.id)
                            .submitLabel(.next)
                            .onSubmit { appendParent(after: bullet) }
                    }
                    .frame(minHeight: PlanningTokens.Editor.parentRowHeight)
                    ForEach($bullet.children) { $child in
                        HStack(spacing: 10) {
                            Circle()
                                .stroke(PlanningPalette.ink, lineWidth: 1.2)
                                .frame(width: 7, height: 7)
                            TextField(PlanningText.string(.subtaskPlaceholder), text: $child.text)
                                .font(.system(size: 15))
                                .focused($focusedID, equals: child.id)
                                .submitLabel(.next)
                                .onSubmit { appendChild(of: bullet.id, after: child) }
                        }
                        .padding(.leading, PlanningTokens.Editor.subtaskIndent)
                        .frame(minHeight: PlanningTokens.Editor.parentRowHeight)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        }
    }

    private var memoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(.memoLabel)
            TextEditor(text: $memo)
                .frame(minHeight: PlanningTokens.Editor.memoMinHeight)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        }
    }

    // MARK: Actions

    private func load() {
        guard let plan = session.plans.first(where: { $0.id == planID }) else { return }
        title = plan.title
        iconID = plan.resolvedIconID
        bullets = clamped(plan.bullets)
        memo = plan.memo
        isNewPlan = !plan.hasBeenSaved
        savedSnapshot = snapshot()
    }

    /// Transfer is allowed only from the last saved plan, never from a dirty draft.
    private var canTransfer: Bool {
        !isNewPlan && snapshot() == savedSnapshot
    }

    /// The only place a plan is saved. One save, then exactly one return.
    private func save() {
        bullets = clamped(bullets)
        session.save(planID: planID, title: title, bullets: bullets, memo: memo, iconID: iconID)
        navigation.pop()
    }

    private func reflect() {
        guard canTransfer, let plan = session.plans.first(where: { $0.id == planID }), plan.hasBeenSaved else { return }
        session.transferSource = PlanTransferSource(planID: planID, bullets: PlanBulletFilter.reflectable(plan.bullets))
        navigation.path.append(PlanningRoute.planTransfer(planID))
    }

    /// Back: if dirty show a standard alert first. Navigation is not touched until the user answers.
    private func requestClose() {
        if snapshot() != savedSnapshot {
            confirmDiscard = true
        } else {
            leave()
        }
    }

    private func leave() {
        session.discardUnsavedPlan(planID)
        navigation.pop()
    }

    private func snapshot() -> String {
        iconID + "\n" + title + "\n" + memo + "\n"
            + bullets.map { "\($0.id)\($0.text)" + $0.children.map { "\($0.id)\($0.text)" }.joined() }.joined()
    }

    private func clamped(_ nodes: [PlanBullet]) -> [PlanBullet] {
        nodes.map { PlanBullet(id: $0.id, text: $0.text, children: $0.children.map { PlanBullet(id: $0.id, text: $0.text) }) }
    }

    private func appendParent(after bullet: PlanBullet) {
        guard PlanningRowEntry.shouldAppendNextRow(bullet.text), let index = bullets.firstIndex(where: { $0.id == bullet.id }) else { return }
        let next = PlanBullet()
        if bullets[index].children.isEmpty {
            bullets[index].children.append(next)
        } else {
            bullets.insert(next, at: index + 1)
        }
        focusedID = next.id
    }

    private func appendChild(of parentID: UUID, after child: PlanBullet) {
        guard PlanningRowEntry.shouldAppendNextRow(child.text), let index = bullets.firstIndex(where: { $0.id == parentID }) else { return }
        let next = PlanBullet()
        bullets[index].children.append(next)
        focusedID = next.id
    }
}

enum PlanBulletFilter {
    /// Drops blank rows so the selection page only lists real items.
    static func reflectable(_ bullets: [PlanBullet]) -> [PlanBullet] {
        bullets.compactMap { bullet in
            let kids = bullet.children.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
            let hasText = !bullet.text.trimmingCharacters(in: .whitespaces).isEmpty
            guard hasText || !kids.isEmpty else { return nil }
            return PlanBullet(id: bullet.id, text: bullet.text, children: kids)
        }
    }
}

// MARK: - Selection page

struct PlanTransferSelectionPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let planID: UUID

    @State private var selected: Set<UUID> = []
    @State private var showingDestination = false
    @State private var popAfterDismiss = false

    private var bullets: [PlanBullet] {
        guard let source = session.transferSource, source.planID == planID else { return [] }
        return source.bullets
    }

    private var allIDs: Set<UUID> {
        Set(bullets.flatMap { [$0.id] + $0.children.map(\.id) })
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanPageBar(title: PlanningText.string(.selectItemsTitle), onBack: { navigation.pop() }) {
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Choose destination", prominent: true, action: openDestination)
                    .disabled(selected.isEmpty)
                    .opacity(selected.isEmpty ? 0.4 : 1)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    selectRow(
                        title: PlanningText.string(.selectAll),
                        isOn: !allIDs.isEmpty && selected.isSuperset(of: allIDs),
                        indent: 0,
                        bold: true
                    ) {
                        selected = selected.isSuperset(of: allIDs) ? [] : allIDs
                    }
                    Divider().padding(.leading, 12)
                    ForEach(bullets) { bullet in
                        selectRow(title: bullet.text, isOn: selected.contains(bullet.id), indent: 0, bold: false) {
                            selected = PlanningSelection.afterToggle(id: bullet.id, bullets: bullets, selected: selected)
                        }
                        ForEach(bullet.children) { child in
                            selectRow(title: child.text, isOn: selected.contains(child.id), indent: PlanningTokens.Editor.subtaskIndent, bold: false) {
                                selected = PlanningSelection.afterToggle(id: child.id, bullets: bullets, selected: selected)
                            }
                        }
                    }
                }
                .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, 6)
                .padding(.bottom, 20)
            }
            .planningScroll()
            // Mandatory persistent bottom action.
            PlanCtaButton(title: PlanningText.string(.chooseDestination), action: openDestination)
                .disabled(selected.isEmpty)
        }
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .sheet(isPresented: $showingDestination, onDismiss: {
            // Pop only after the sheet is fully gone, never in the same transaction.
            if popAfterDismiss {
                popAfterDismiss = false
                navigation.pop()
            }
        }) {
            PlanDestinationSheet(
                session: session,
                planID: planID,
                bullets: bullets,
                selected: selected,
                onClose: { showingDestination = false },
                onCopied: {
                    popAfterDismiss = true
                    showingDestination = false
                }
            )
        }
    }

    private func openDestination() {
        guard !selected.isEmpty else { return }
        showingDestination = true
    }

    private func selectRow(title: String, isOn: Bool, indent: CGFloat, bold: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isOn ? PlanningPalette.ink : PlanningPalette.muted)
                Text(title.isEmpty ? "無題" : title)
                    .font(.system(size: 16, weight: bold ? .semibold : .regular))
                    .foregroundStyle(PlanningPalette.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.leading, 12 + indent)
            .padding(.trailing, 12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Destination sheet

private struct PlanDestinationSheet: View {
    @ObservedObject var session: PlanningSession
    let planID: UUID
    let bullets: [PlanBullet]
    let selected: Set<UUID>
    let onClose: () -> Void
    let onCopied: () -> Void

    @State private var kind: PlanningItemKind = .task
    @State private var bucket: PlanningBucket = .monthly
    @State private var monthlyKey = PeriodCalendar.currentKey(.monthly)
    @State private var weeklyKey = PeriodCalendar.currentKey(.weekly)
    @State private var dailyKey = PeriodCalendar.currentKey(.daily)
    @State private var showingPeriodPicker = false

    private var periodKey: String {
        switch bucket {
        case .monthly: monthlyKey
        case .weekly: weeklyKey
        case .daily: dailyKey
        }
    }

    var body: some View {
        PlanningSystemSheetChrome(
            height: PlanningTokens.Sheet.destinationHeight,
            onClose: onClose,
            onConfirm: copy
        ) {
            VStack(alignment: .leading, spacing: 8) {
                label(.destinationKind)
                Picker(PlanningText.string(.destinationKind), selection: $kind) {
                    Text(PlanningText.string(.task)).tag(PlanningItemKind.task)
                    Text(PlanningText.string(.event)).tag(PlanningItemKind.event)
                }
                .pickerStyle(.segmented)

                label(.destinationScope).padding(.top, 8)
                Picker(PlanningText.string(.destinationScope), selection: $bucket) {
                    Text("Monthly").tag(PlanningBucket.monthly)
                    Text("Weekly").tag(PlanningBucket.weekly)
                    Text("Daily").tag(PlanningBucket.daily)
                }
                .pickerStyle(.segmented)

                label(.destinationPeriod).padding(.top, 8)
                Button {
                    showingPeriodPicker = true
                } label: {
                    Text(PeriodCalendar.label(bucket: bucket, key: periodKey))
                        .font(.system(size: 17))
                        .foregroundStyle(Color.primary)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(height: PlanningTokens.Sheet.rowHeight)
                        .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Text(PlanningText.string(kind == .task ? .destinationNoteTask : .destinationNoteEvent))
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .padding(.top, 6)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, PlanningTokens.Sheet.horizontalInset)
            .padding(.top, 14)
        }
        .sheet(isPresented: $showingPeriodPicker) {
            PlanPeriodPickerSheet(bucket: bucket, initialKey: periodKey) { key in
                switch bucket {
                case .monthly: monthlyKey = key
                case .weekly: weeklyKey = key
                case .daily: dailyKey = key
                }
            }
        }
    }

    private func label(_ key: PlanningText.Key) -> some View {
        Text(PlanningText.string(key))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.secondary)
    }

    private func copy() {
        let target = PlanTransferTarget.allCases.first { $0.bucket == bucket && $0.kind == kind } ?? .monthlyTask
        session.transfer(
            planID: planID,
            bullets: bullets,
            bulletIDs: selected,
            includeChildren: false,
            to: target,
            periodKey: periodKey
        )
        onCopied()
    }
}

/// Native compact picker opened from the period row. No custom arrow buttons.
private struct PlanPeriodPickerSheet: View {
    let bucket: PlanningBucket
    let initialKey: String
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var year: Int
    @State private var month: Int
    @State private var weekKey: String
    @State private var day: Date

    init(bucket: PlanningBucket, initialKey: String, onPick: @escaping (String) -> Void) {
        self.bucket = bucket
        self.initialKey = initialKey
        self.onPick = onPick
        let parts = PeriodCalendar.monthParts(initialKey)
        _year = State(initialValue: parts.year)
        _month = State(initialValue: parts.month)
        _weekKey = State(initialValue: initialKey)
        _day = State(initialValue: PeriodCalendar.date(from: initialKey) ?? Date())
    }

    private var years: [Int] {
        let base = Calendar.current.component(.year, from: Date())
        let low = min(base - 2, year)
        let high = max(base + 10, year)
        return Array(low...high)
    }

    private var weekKeys: [String] {
        (-26...52).map { PeriodCalendar.shift(initialKey, bucket: .weekly, by: $0) }
    }

    var body: some View {
        PlanningSystemSheetChrome(
            height: PlanningTokens.Sheet.periodPickerHeight,
            onClose: { dismiss() },
            onConfirm: confirm
        ) {
            Group {
                switch bucket {
                case .monthly:
                    HStack(spacing: 0) {
                        Picker("Year", selection: $year) {
                            ForEach(years, id: \.self) { Text("\($0)年").tag($0) }
                        }
                        .pickerStyle(.wheel)
                        Picker("Month", selection: $month) {
                            ForEach(1...12, id: \.self) { Text("\($0)月").tag($0) }
                        }
                        .pickerStyle(.wheel)
                    }
                case .weekly:
                    Picker("Week", selection: $weekKey) {
                        ForEach(weekKeys, id: \.self) { key in
                            Text(PeriodCalendar.label(bucket: .weekly, key: key)).tag(key)
                        }
                    }
                    .pickerStyle(.wheel)
                case .daily:
                    DatePicker("Date", selection: $day, displayedComponents: .date)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .environment(\.calendar, PeriodCalendar.calendar)
                }
            }
            .frame(height: 216)
            .padding(.horizontal, PlanningTokens.Sheet.horizontalInset)
            .padding(.top, 16)
        }
    }

    private func confirm() {
        switch bucket {
        case .monthly:
            onPick(PeriodCalendar.monthKey(year: year, month: month))
        case .weekly:
            onPick(weekKey)
        case .daily:
            onPick(PeriodCalendar.dayKey(day))
        }
        dismiss()
    }
}
