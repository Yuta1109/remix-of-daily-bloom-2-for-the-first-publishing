import SwiftUI

struct PostponeBoxPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var kind: PlanningItemKind = .task
    @State private var editing: PostponedEntry?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("Kind", selection: $kind) {
                Text("Tasks").tag(PlanningItemKind.task)
                Text("Events").tag(PlanningItemKind.event)
            }
            .pickerStyle(.segmented)
            .padding(16)
            List {
                ForEach(PlanningBucket.allCases) { bucket in
                    Section(bucket.title) {
                        let entries = session.postponed.filter { $0.kind == kind && $0.bucket == bucket }
                        if entries.isEmpty {
                            Text("なし")
                                .foregroundStyle(.secondary)
                        }
                        ForEach(entries) { entry in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(entry.title)
                                    .font(.body.weight(.semibold))
                                Text(entry.kind == .task ? "Task" : "Event")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                HStack {
                                    Button("編集") { editing = entry }
                                    Button("削除", role: .destructive) {
                                        session.postponed.removeAll { $0.id == entry.id }
                                    }
                                    Menu("移動") {
                                        ForEach(PlanningBucket.allCases) { destination in
                                            Button(destination.title) {
                                                session.movePostponed(entry.id, to: destination)
                                            }
                                        }
                                    }
                                    Button("プランへ戻す") {
                                        session.placePostponedOnPlan(entry.id)
                                    }
                                }
                                .font(.caption)
                                .buttonStyle(.borderless)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .planningPageChrome(title: "Postpone Box", onBack: { navigation.pop() })
        .planningExtendingSurface(PlanningPalette.paper)
        .nativeSheet(isPresented: Binding(
            get: { editing != nil },
            set: { if !$0 { editing = nil } }
        ), detents: [.medium]) {
            if let editing {
                PostponeEditorSheet(entry: editing) { updated in
                    if let index = session.postponed.firstIndex(where: { $0.id == updated.id }) {
                        session.postponed[index] = updated
                    }
                    self.editing = nil
                } onClose: {
                    self.editing = nil
                }
            }
        }
    }
}

private struct PostponeEditorSheet: View {
    @State var entry: PostponedEntry
    let onSave: (PostponedEntry) -> Void
    let onClose: () -> Void

    var body: some View {
        NativeSheetScaffold(title: "編集", onClose: onClose, onConfirm: { onSave(entry) }) {
            TextField("名前", text: $entry.title)
                .textFieldStyle(.roundedBorder)
                .padding(20)
            Spacer()
        }
        .presentationBackground(Color(uiColor: .systemBackground))
        .background {
            Color(uiColor: .systemBackground)
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
    }
}
