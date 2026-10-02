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

/// Plan subpage bars use the shared translucent header.
private typealias PlanPageBar = PlanningTranslucentHeader

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
                    .foregroundStyle(PlanIconColor.resolved(plan.resolvedIconColorID).color)
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
                    let remaining = session.savedPlansNewestFirst.count - previews.count
                    if remaining > 0 {
                        Button {
                            navigation.path.append(PlanningRoute.planList)
                        } label: {
                            Text(PlanningText.morePlans(remaining))
                                .font(.system(size: 14))
                                .foregroundStyle(PlanningPalette.muted)
                                .frame(maxWidth: .infinity)
                                .frame(minHeight: 36)
                        }
                        .buttonStyle(.plain)
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
        .planningFixedHeader {
            PlanPageBar(title: PlanningText.string(.planListTitle), onBack: { navigation.pop() }) { EmptyView() }
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
    @State private var iconColorID = PlanIconColor.defaultID
    @State private var bullets: [PlanBullet] = [PlanBullet()]
    @State private var memo = ""
    @State private var isNewPlan = true
    @State private var savedSnapshot = ""
    @State private var confirmDiscard = false
    @FocusState private var focusedID: UUID?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: PlanningTokens.Editor.sectionGap) {
                    titleSection
                    iconSection
                    colorSection
                    bulletsSection
                    memoSection
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, PlanningTokens.Editor.subpageTopGap)
                .padding(.bottom, 20)
            }
            .planningScroll()
            PlanCtaButton(title: PlanningText.string(.reflectToItems), action: reflect)
        }
        .planningFixedHeader {
            PlanPageBar(
                title: PlanningText.string(isNewPlan ? .newPlan : .editPlan),
                onBack: requestClose
            ) {
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: save)
            }
        }
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .onAppear(perform: load)
        .alert(PlanningText.string(.discardTitle), isPresented: $confirmDiscard) {
            Button(PlanningText.string(.cancel), role: .cancel) {}
                .tint(PlanningPalette.ink)
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

    private var colorSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel(.colorLabel)
            HStack(spacing: PlanningTokens.Editor.colorGap) {
                ForEach(PlanIconColor.allCases) { choice in
                    Button {
                        iconColorID = choice.rawValue
                    } label: {
                        Circle()
                            .fill(choice.color)
                            .frame(width: PlanningTokens.Editor.colorCell - 8, height: PlanningTokens.Editor.colorCell - 8)
                            .frame(width: PlanningTokens.Editor.colorCell, height: PlanningTokens.Editor.colorCell)
                            .overlay(
                                Circle().stroke(
                                    iconColorID == choice.rawValue ? PlanningPalette.ink.opacity(0.55) : Color.clear,
                                    lineWidth: 2
                                )
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(choice.rawValue)
                    .accessibilityAddTraits(iconColorID == choice.rawValue ? .isSelected : [])
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
                            .padding(.leading, PlanningTokens.Editor.parentBulletInset)
                        TextField(PlanningText.string(.parentPlaceholder), text: $bullet.text)
                            .font(.system(size: 16))
                            .focused($focusedID, equals: bullet.id)
                            .submitLabel(.next)
                            .onSubmit { apply(PlanBulletReturn.parent(bullets: bullets, parentID: bullet.id)) }
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
                                .onSubmit { apply(PlanBulletReturn.child(bullets: bullets, parentID: bullet.id, childID: child.id)) }
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
        iconColorID = plan.resolvedIconColorID
        bullets = clamped(plan.bullets)
        memo = plan.memo
        isNewPlan = !plan.hasBeenSaved
        savedSnapshot = snapshot()
    }

    private var transferIsValid: Bool {
        let titled = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasItem = bullets.contains {
            !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || $0.children.contains { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
        return titled || hasItem
    }

    /// Check mark: save once, then exactly one return. Transfer must not call this.
    private func save() {
        bullets = clamped(bullets)
        session.save(planID: planID, title: title, bullets: bullets, memo: memo, iconID: iconID, iconColorID: iconColorID)
        navigation.pop()
    }

    /// Saves the current editor state only when it differs from the last save, then opens selection.
    private func reflect() {
        bullets = clamped(bullets)
        guard transferIsValid else { return }
        let needsSave = isNewPlan || snapshot() != savedSnapshot
        if needsSave {
            session.save(planID: planID, title: title, bullets: bullets, memo: memo, iconID: iconID, iconColorID: iconColorID)
            isNewPlan = false
            savedSnapshot = snapshot()
        }
        let saved = session.plans.first { $0.id == planID }?.bullets ?? bullets
        session.transferSource = PlanTransferSource(planID: planID, bullets: PlanBulletFilter.reflectable(saved))
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
        iconID + "\n" + iconColorID + "\n" + title + "\n" + memo + "\n"
            + bullets.map { "\($0.id)\($0.text)" + $0.children.map { "\($0.id)\($0.text)" }.joined() }.joined()
    }

    private func clamped(_ nodes: [PlanBullet]) -> [PlanBullet] {
        nodes.map { PlanBullet(id: $0.id, text: $0.text, children: $0.children.map { PlanBullet(id: $0.id, text: $0.text) }) }
    }

    private func apply(_ result: PlanBulletReturn.Result) {
        switch result {
        case .unchanged:
            break
        case .focus(let id):
            focusedID = id
        case .replaced(let next, let focus):
            bullets = next
            focusedID = focus
        }
    }
}

enum PlanBulletReturn {
    enum Result {
        case unchanged
        case focus(UUID)
        case replaced([PlanBullet], focus: UUID)
    }

    /// Non-empty parent creates its first child, or focuses that child if it already exists.
    static func parent(bullets: [PlanBullet], parentID: UUID) -> Result {
        guard let index = bullets.firstIndex(where: { $0.id == parentID }) else { return .unchanged }
        guard PlanningRowEntry.shouldAppendNextRow(bullets[index].text) else { return .unchanged }
        if let first = bullets[index].children.first {
            return .focus(first.id)
        }
        var next = bullets
        let child = PlanBullet()
        next[index].children.append(child)
        return .replaced(next, focus: child.id)
    }

    /// Non-empty child inserts another child. An empty child becomes the next parent.
    static func child(bullets: [PlanBullet], parentID: UUID, childID: UUID) -> Result {
        guard let parentIndex = bullets.firstIndex(where: { $0.id == parentID }),
              let childIndex = bullets[parentIndex].children.firstIndex(where: { $0.id == childID }) else { return .unchanged }
        var next = bullets
        if PlanningRowEntry.shouldAppendNextRow(next[parentIndex].children[childIndex].text) {
            let created = PlanBullet()
            next[parentIndex].children.insert(created, at: childIndex + 1)
            return .replaced(next, focus: created.id)
        }
        next[parentIndex].children.remove(at: childIndex)
        let parent = PlanBullet()
        next.insert(parent, at: parentIndex + 1)
        return .replaced(next, focus: parent.id)
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
                .padding(.top, PlanningTokens.Editor.subpageTopGap)
                .padding(.bottom, 20)
            }
            .planningScroll()
            // Mandatory persistent bottom action.
            PlanCtaButton(title: PlanningText.string(.chooseDestination), action: openDestination)
                .disabled(selected.isEmpty)
        }
        .planningFixedHeader {
            PlanPageBar(title: PlanningText.string(.selectItemsTitle), onBack: { navigation.pop() }) {
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Choose destination", prominent: true, action: openDestination)
                    .disabled(selected.isEmpty)
                    .opacity(selected.isEmpty ? 0.4 : 1)
            }
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

enum PlanTransferCalendar {
    static func years(now: Date = Date()) -> [Int] {
        let year = PeriodCalendar.calendar.component(.year, from: now)
        return Array(year...(year + 10))
    }

    static func months(in year: Int, now: Date = Date()) -> [Int] {
        let parts = PeriodCalendar.calendar.dateComponents([.year, .month], from: now)
        let start = year == parts.year ? (parts.month ?? 1) : 1
        return Array(start...12)
    }

    static func weeks(now: Date = Date(), count: Int = 60) -> [String] {
        let start = PeriodCalendar.currentKey(.weekly, now: now)
        return (0..<count).map { PeriodCalendar.shift(start, bucket: .weekly, by: $0) }
    }

    static func earliestDay(now: Date = Date()) -> Date {
        PeriodCalendar.calendar.startOfDay(for: now)
    }

    static func clampDay(_ date: Date, now: Date = Date()) -> Date {
        max(date, earliestDay(now: now))
    }

    /// Past keys sort before the current key because every key is zero-padded.
    static func clamp(bucket: PlanningBucket, key: String, now: Date = Date()) -> String {
        let current = PeriodCalendar.currentKey(bucket, now: now)
        return key < current ? current : key
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
        let clamped = PlanTransferCalendar.clamp(bucket: bucket, key: initialKey)
        let parts = PeriodCalendar.monthParts(clamped)
        _year = State(initialValue: parts.year)
        _month = State(initialValue: parts.month)
        _weekKey = State(initialValue: bucket == .weekly ? clamped : PlanTransferCalendar.weeks().first ?? clamped)
        _day = State(initialValue: PlanTransferCalendar.clampDay(PeriodCalendar.date(from: initialKey) ?? Date()))
    }

    private var years: [Int] { PlanTransferCalendar.years() }

    private var months: [Int] { PlanTransferCalendar.months(in: year) }

    private var weekKeys: [String] { PlanTransferCalendar.weeks() }

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
                        .onChange(of: year) { _, newYear in
                            let allowed = PlanTransferCalendar.months(in: newYear)
                            if !allowed.contains(month) { month = allowed[0] }
                        }
                        Picker("Month", selection: $month) {
                            ForEach(months, id: \.self) { Text("\($0)月").tag($0) }
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
                    DatePicker("Date", selection: $day, in: PlanTransferCalendar.earliestDay()..., displayedComponents: .date)
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
