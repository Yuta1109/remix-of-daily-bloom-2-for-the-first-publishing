import FirebaseAuth
import SwiftUI

/// Temporary TestFlight check. Remove or replace before a public release.
/// Planning header User button is the only entry. It does not run at launch.
private struct LegacyImportOutcome {
    var inserted: Int
    var skipped: Int
    var unsupported: Int
    var deferred: Int
    var reconciliation: Int
    var persistedLegacyCount: Int
    var wrote: Bool
}

struct LegacyCalendarDiagnosticSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState
    @State private var reading = false
    @State private var importing = false
    @State private var report: LegacyDiagnosticReport?
    @State private var snapshot: LegacyWebViewDataReader.Snapshot?
    @State private var outcome: LegacyImportOutcome?
    @State private var confirmImport = false
    @State private var preflight = CanonicalPlanningEngine.LegacyPreflightSummary()
    @State private var persistedCount = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("以前のアプリに保存された予定を確認します。確認だけではデータは変わりません。取り込みは次のボタンを押したときだけ行います。")
                        .font(.system(size: 15))
                        .foregroundStyle(PlanningPalette.muted)
                    Button(action: start) {
                        Text(reading ? "確認しています" : "旧カレンダーデータを確認")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(PlanningPalette.accent)
                    .disabled(reading || importing)
                    if let report {
                        result(report)
                        if report.owner == .differentOwner {
                            Text("この端末の旧データは、今のアカウントと一致しない印が付いています。バージョン1.1の予定は端末内のデータなので、取り込みは止めません。")
                                .font(.system(size: 14))
                                .foregroundStyle(PlanningPalette.muted)
                        }
                        if preflight.deferred > 0 {
                            Text("一部の繰り返し予定には、現在のアプリで再現できない変更が含まれています。これらは取り込まず、旧データに残します。")
                                .font(.system(size: 14))
                                .foregroundStyle(PlanningPalette.muted)
                        }
                        if preflight.importable > 0 && outcome == nil {
                            Button { confirmImport = true } label: {
                                Text(importing ? "取り込んでいます" : "旧カレンダーデータを取り込む")
                                    .font(.system(size: 17, weight: .semibold))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 48)
                            }
                            .buttonStyle(.bordered)
                            .disabled(importing)
                            .confirmationDialog(
                                report.owner == .differentOwner ? "別のアカウントの印が付いた予定です" : "この端末の旧カレンダーをコピーします",
                                isPresented: $confirmImport,
                                titleVisibility: .visible
                            ) {
                                Button("取り込む", action: importEvents)
                                Button("キャンセル", role: .cancel) {}
                            } message: {
                                Text("以前のアプリに保存された予定を、今のアプリの中へコピーします。元のデータは削除しません。")
                            }
                        }
                        if let outcome {
                            line("今回追加", "\(outcome.inserted)件")
                            line("重複スキップ", "\(outcome.skipped)件")
                            line("未対応・取り込み不可", "\(outcome.unsupported)件")
                            line("見送った繰り返し", "\(outcome.deferred)件")
                            line("再確認が必要", "\(outcome.reconciliation)件")
                            line("取り込み済み", "\(outcome.persistedLegacyCount)件")
                            line("保存状態", outcome.wrote ? "保存確認済み" : "保存失敗")
                        }
                    }
                }
                .padding(20)
            }
            .background(PlanningPalette.paper)
            .navigationTitle("旧データの確認")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
        }
    }

    private func start() {
        guard !reading else { return }
        reading = true
        let uid = Auth.auth().currentUser?.uid
        Task {
            let snapshot = await LegacyWebViewDataReader().read()
            self.snapshot = snapshot
            outcome = nil
            report = snapshot.report(signedInUid: uid)
            let records = LegacyCalendarClassification.calendarRecords(v3Raw: snapshot.v3Raw, calendarEventsRaw: snapshot.calendarEventsRaw)
            preflight = CanonicalPlanningEngine.summarizeLegacy(appState.canonicalPlanning.document, records)
            persistedCount = reloadedLegacyCount()
            reading = false
        }
    }

    private func importEvents() {
        guard !importing, let snapshot, preflight.importable > 0 else { return }
        importing = true
        let records = LegacyCalendarClassification.calendarRecords(v3Raw: snapshot.v3Raw, calendarEventsRaw: snapshot.calendarEventsRaw)
        var stats = CanonicalPlanningEngine.LegacyImportStats()
        let wrote = appState.canonicalPlanning.mutate { document in
            stats = CanonicalPlanningEngine.importLegacy(&document, records)
        }
        let persisted = reloadedLegacyCount()
        let changed = stats.inserted + stats.exclusionsAdded + stats.overridesAdded
        persistedCount = max(persisted, 0)
        preflight = CanonicalPlanningEngine.summarizeLegacy(appState.canonicalPlanning.document, records)
        outcome = LegacyImportOutcome(
            inserted: stats.inserted,
            skipped: stats.skipped,
            unsupported: stats.unsupported,
            deferred: stats.deferred,
            reconciliation: stats.reconciliation,
            persistedLegacyCount: max(persisted, 0),
            wrote: persisted >= 0 && (wrote || changed == 0)
        )
        importing = false
    }

    @ViewBuilder
    private func result(_ report: LegacyDiagnosticReport) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("旧データの確認結果")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(PlanningPalette.ink)
            line("WebViewストレージ", storageLabel(report.status))
            line("V3データ", report.v3Present ? "検出" : "なし")
            line("旧Calendarデータ", report.calendarEventsPresent ? "検出" : "なし")
            line("予定候補", "\(preflight.candidates)件")
            line("取り込める予定", "\(preflight.importable)件")
                            line("取り込み済み", "\(persistedCount)件")
                            line("見送った繰り返し", "\(preflight.deferred)件")
                            line("再確認が必要", "\(preflight.reconciliation)件")
            line("重複候補", "\(report.duplicateCount)件")
            line("形式の問題", "\(report.malformedCount)件")
            line("アカウント", ownerLabel(report.owner))
            line("取り込み", report.importExecuted ? "実行済み" : "実行していません")
            line("今後の移行", report.eligibleForFutureImport ? "条件を満たしています" : "まだ実行できません")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func line(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(PlanningPalette.muted)
            Spacer()
            Text(value).foregroundStyle(PlanningPalette.ink)
        }
        .font(.system(size: 15))
    }

    private func storageLabel(_ status: LegacyWebViewDataReader.Status) -> String {
        switch status {
        case .availableWithData: return "読み取り成功"
        case .accessibleButEmpty: return "読み取り成功・予定なし"
        case .inaccessibleOrigin: return "オリジンに到達できません"
        case .missingLegacyAssets: return "読み取りページを用意できません"
        case .malformedData: return "データが壊れています"
        case .unsupportedFormat: return "未対応の形式です"
        case .readFailed: return "読み取りに失敗しました"
        case .readInProgress: return "別の確認が進行中です"
        }
    }

    private func reloadedLegacyCount() -> Int {
        switch CanonicalPlanningPersistence.load() {
        case .loaded(let document):
            return document.payloads.filter { $0.legacyWebID != nil }.count
        case .absent:
            return 0
        case .unreadable:
            return -1
        }
    }

    private func ownerLabel(_ owner: LegacyOwnerMatch) -> String {
        switch owner {
        case .matchingOwner: return "一致"
        case .differentOwner: return "別のアカウント"
        case .missingOwner: return "所有者を確認できません"
        case .unauthenticated: return "未サインイン"
        case .invalidOwnerMarker: return "所有者情報が不正です"
        }
    }
}
