import SwiftUI

struct PlanListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center, spacing: 10) {
                    PlanningGlyph(section: .plan)
                    Text("まずは今考えていることを箇条書きで書いてみましょう。そうしている内にやるべきことがわかってきます。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Button("プランを新規作成") {
                    let id = session.beginPlan()
                    navigation.path.append(PlanningRoute.planEditor(id))
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity)
                ForEach(session.plans.filter(\.hasBeenSaved)) { plan in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(plan.title.isEmpty ? "無題のプラン" : plan.title)
                                .font(.body.weight(.semibold))
                            Text("リプラン数 \(plan.replanCount)")
                                .font(.caption)
                            Text("最終更新日 \(Self.dateText(plan.updatedAt))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Menu {
                            Button("編集") {
                                navigation.path.append(PlanningRoute.planEditor(plan.id))
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .frame(width: 44, height: 44)
                        }
                    }
                    .padding(14)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
            .padding(16)
        }
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd"
        return formatter.string(from: date)
    }
}

struct PlanEditorPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let planID: UUID

    @State private var title = ""
    @State private var bullets: [PlanBullet] = [PlanBullet()]
    @State private var memo = ""
    @State private var selected: Set<UUID> = []
    @State private var includeChildren = false
    @State private var showingTransfer = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                    if !navigation.path.isEmpty { navigation.path.removeLast() }
                }
                TextField("タイトル", text: $title)
                    .font(.title3.weight(.semibold))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    BulletList(
                        bullets: $bullets,
                        selected: $selected,
                        depth: 0
                    )
                    HStack {
                        Button("字上げ") { outdentSelection() }
                        Button("字下げ") { indentSelection() }
                        Button(includeChildren ? "ブロック選択中" : "ブロック") {
                            includeChildren.toggle()
                        }
                        Button("全体") { selectEntirePlan() }
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                    Text("メモ")
                        .font(.caption.weight(.semibold))
                        .padding(.top, 12)
                    TextEditor(text: $memo)
                        .frame(minHeight: 120)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.3)))
                }
                .padding(16)
            }
            if showingTransfer {
                Text(PlanningRules.transferExplanation)
                    .font(.footnote)
                    .padding(.horizontal, 16)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(PlanTransferTarget.allCases) { target in
                            Button(target.title) {
                                session.transfer(
                                    planID: planID,
                                    bulletIDs: selected,
                                    includeChildren: includeChildren,
                                    to: target
                                )
                                save()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            HStack {
                Button("保存") {
                    save()
                }
                .buttonStyle(.borderedProminent)
                Button("選んだ内容を移して保存") {
                    showingTransfer = true
                }
                .buttonStyle(.bordered)
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationBarHidden(true)
        .onAppear(perform: load)
    }

    private func load() {
        guard let plan = session.plans.first(where: { $0.id == planID }) else { return }
        title = plan.title
        bullets = plan.bullets
        memo = plan.memo
    }

    private func save() {
        session.save(planID: planID, title: title, bullets: bullets, memo: memo)
    }

    private func indentSelection() {
        for id in selected {
            _ = PlanBulletEditing.indent(id, in: &bullets)
        }
    }

    private func outdentSelection() {
        for id in selected {
            _ = PlanBulletEditing.outdent(id, in: &bullets)
        }
    }

    private func selectEntirePlan() {
        selected = Set(flattenedIDs(bullets))
        includeChildren = true
    }

    private func flattenedIDs(_ nodes: [PlanBullet]) -> [UUID] {
        nodes.flatMap { [$0.id] + flattenedIDs($0.children) }
    }
}

private struct BulletList: View {
    @Binding var bullets: [PlanBullet]
    @Binding var selected: Set<UUID>
    let depth: Int

    var body: some View {
        ForEach($bullets) { $bullet in
            HStack(alignment: .top, spacing: 8) {
                Button {
                    if selected.contains(bullet.id) {
                        selected.remove(bullet.id)
                    } else {
                        selected.insert(bullet.id)
                    }
                } label: {
                    Image(systemName: selected.contains(bullet.id) ? "checkmark.circle.fill" : "circle")
                        .frame(width: 44, height: 32)
                }
                .buttonStyle(.plain)
                bulletMark
                TextField("項目", text: $bullet.text)
                    .padding(.leading, CGFloat(depth) * 16)
            }
            if !bullet.children.isEmpty {
                BulletList(bullets: $bullet.children, selected: $selected, depth: depth + 1)
                    .padding(.leading, 12)
            }
        }
    }

    @ViewBuilder
    private var bulletMark: some View {
        switch depth {
        case 0:
            Circle().fill(Color.primary).frame(width: 8, height: 8).padding(.top, 12)
        case 1:
            Circle().stroke(Color.primary, lineWidth: 1.5).frame(width: 8, height: 8).padding(.top, 12)
        default:
            Capsule().fill(Color.secondary).frame(width: 10, height: 2).padding(.top, 16)
        }
    }
}
