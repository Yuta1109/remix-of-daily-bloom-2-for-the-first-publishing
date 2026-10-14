import FirebaseAuth
import SwiftUI

/// Temporary TestFlight check. Remove or replace before a public release.
/// Planning header User button is the only entry. It does not run at launch.
struct LegacyCalendarDiagnosticSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reading = false
    @State private var report: LegacyDiagnosticReport?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("以前のアプリに保存された予定を確認します。データの変更や取り込みは行いません。")
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
                    .disabled(reading)
                    if let report {
                        result(report)
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
            report = snapshot.report(signedInUid: uid)
            reading = false
        }
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
            line("予定候補", "\(report.candidateCount)件")
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
