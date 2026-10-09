import SwiftUI

struct PostponeBoxPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var kind: PlanningItemKind = .task
    @State private var editing: PostponedEntry?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Picker(PlanningText.string(.postponeBoxTitle), selection: $kind) {
                    Text(PlanningText.string(.postponeTasks)).tag(PlanningItemKind.task)
                    Text(PlanningText.string(.postponeEvents)).tag(PlanningItemKind.event)
                }
                .pickerStyle(.segmented)
                ForEach(PlanningBucket.allCases) { bucket in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(bucket.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(PlanningPalette.muted)
                        let entries = session.postponed.filter { $0.kind == kind && $0.bucket == bucket }
                        if entries.isEmpty {
                            Text(PlanningText.isEnglish ? "None" : "なし")
                                .font(.system(size: 14))
                                .foregroundStyle(PlanningPalette.muted)
                        }
                        ForEach(entries) { entry in
                            Button {
                                editing = entry
                            } label: {
                                PostponeBoxRow(entry: entry)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 24)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .planningPageChrome(title: PlanningText.string(.postponeBoxTitle), onBack: { navigation.pop() })
        .planningExtendingSurface(PlanningPalette.paper)
        .sheet(item: $editing) { entry in
            PostponeActionSheet(session: session, entryID: entry.id)
        }
    }
}

private struct PostponeBoxRow: View {
    let entry: PostponedEntry

    var body: some View {
        HStack(spacing: 12) {
            PlanningCategoryIconBubble(
                symbol: entry.iconSymbol == "circle" ? "tray" : entry.iconSymbol,
                colorID: entry.colorID,
                diameter: 46
            )
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(1)
                let source = PeriodCalendar.postponeProvenance(bucket: entry.originBucket, key: entry.originPeriodKey)
                if !source.isEmpty {
                    Text(source)
                        .font(.system(size: 13))
                        .foregroundStyle(PlanningPalette.muted)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PlanningPalette.muted)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 74)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        .shadow(color: PlanningPalette.ink.opacity(0.04), radius: 6, y: 2)
    }
}

private struct PostponeActionSheet: View {
    @ObservedObject var session: PlanningSession
    let entryID: UUID
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var confirmingDelete = false

    private var entry: PostponedEntry? {
        session.postponed.first { $0.id == entryID }
    }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: { dismiss() },
            onConfirm: { dismiss() },
            showsControls: false,
            centerTitle: entry?.title ?? "",
            bodySurface: Color.white
        ) {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(PlanningText.string(.postponeEditName))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PlanningPalette.muted)
                    TextField(PlanningText.string(.postponeEditName), text: $title)
                        .font(.system(size: 16))
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .padding(.horizontal, 16)
                        .frame(height: 48)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                        .onSubmit { resign() }
                }
                .padding(.bottom, 20)
                VStack(alignment: .leading, spacing: 8) {
                    Text(PlanningText.string(.postponeMoveWithin))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PlanningPalette.muted)
                    Picker(PlanningText.string(.postponeMoveWithin), selection: moveBinding) {
                        ForEach(PlanningBucket.allCases) { bucket in
                            Text(bucket.title).tag(bucket)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.bottom, 33)
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                        Text(PlanningText.string(.postponeDelete))
                            .font(.system(size: 17, weight: .semibold))
                    }
                    .foregroundStyle(Color(red: 0.75, green: 0.22, blue: 0.18))
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color(red: 0.75, green: 0.22, blue: 0.18).opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
        .onAppear { title = entry?.title ?? "" }
        .onChange(of: title) { _, newValue in
            session.renamePostponed(entryID, title: newValue)
        }
        .onChange(of: confirmingDelete) { _, show in
            guard show else { return }
            confirmingDelete = false
            PlanningDiscardConfirmation.presentDestructive(
                message: PlanningText.string(.postponeDeleteConfirm),
                destructiveTitle: PlanningText.string(.postponeDelete)
            ) {
                session.postponed.removeAll { $0.id == entryID }
                dismiss()
            }
        }
    }

    private var moveBinding: Binding<PlanningBucket> {
        Binding(
            get: { entry?.bucket ?? .monthly },
            set: { session.movePostponed(entryID, to: $0) }
        )
    }

    private func resign() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
