import Foundation

/// Read-only bridge for a later Planning cutover. Constructing it does not save.
enum PlanningCanonicalAdapter {
    struct Candidate {
        var id: String
        var isSample: Bool
        var parentID: String?
        var planDocument: Bool = false
        var planBullets: [(id: String, parentID: String?)] = []
        var postponeBox: Bool = false
        var logicalID: String?
    }

    struct Preview {
        var samplesExcluded: Int
        var collisions: Int
        var blocked: Int
        var ready: Int
        var batchConvertible: Bool
        var activationAllowed: Bool
        var activationBlockers: [String]
    }

    static let liveActivationBlockers = [
        "postpone-restore-creates-a-new-node",
        "latest-reflection-remains-editable",
    ]

    static func period(
        _ document: CanonicalPlanningDocument,
        _ level: CanonicalPlanningLevel,
        _ key: String
    ) -> [CanonicalEffectiveItem] {
        CanonicalPlanningEngine.effectiveItems(document, level, key)
    }

    /// Does not call `CanonicalPlanningController.mutate`.
    static func preview(_ document: CanonicalPlanningDocument, _ rows: [Candidate]) -> Preview {
        var samplesExcluded = 0
        var collisions = 0
        var blocked = 0
        var ready = 0
        for row in rows {
            if row.isSample {
                samplesExcluded += 1
                continue
            }
            if row.postponeBox && row.logicalID == nil {
                blocked += 1
                continue
            }
            if row.planDocument {
                let tooDeep = row.planBullets.contains { bullet in
                    guard let parentID = bullet.parentID else { return false }
                    guard let parent = row.planBullets.first(where: { $0.id == parentID }) else { return true }
                    return parent.parentID != nil
                }
                if row.planBullets.isEmpty || tooDeep {
                    blocked += 1
                    continue
                }
            }
            let taken = row.planDocument
                ? document.plans.contains { $0.id == row.id }
                : row.postponeBox
                ? document.postponeEntries.contains { $0.id == row.id || $0.logicalID == row.logicalID }
                : document.payloads.contains { $0.id == row.id || $0.legacyWebID == row.id }
            if taken { collisions += 1 } else { ready += 1 }
        }
        return Preview(
            samplesExcluded: samplesExcluded,
            collisions: collisions,
            blocked: blocked,
            ready: ready,
            batchConvertible: blocked == 0,
            activationAllowed: false,
            activationBlockers: liveActivationBlockers
        )
    }
}
