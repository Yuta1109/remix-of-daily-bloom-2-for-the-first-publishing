import Foundation

/// Read-only bridge for a later Planning cutover. Constructing it does not save.
enum PlanningCanonicalAdapter {
    struct Candidate {
        var id: String
        var isSample: Bool
        var parentID: String?
        var planDocument: Bool = false
        var postponeBox: Bool = false
    }

    struct Preview {
        var samplesExcluded: Int
        var collisions: Int
        var blocked: Int
        var ready: Int
        var activationAllowed: Bool
    }

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
            if row.planDocument || row.postponeBox {
                blocked += 1
                continue
            }
            let taken = document.payloads.contains { $0.id == row.id || $0.legacyWebID == row.id }
            if taken { collisions += 1 } else { ready += 1 }
        }
        return Preview(
            samplesExcluded: samplesExcluded,
            collisions: collisions,
            blocked: blocked,
            ready: ready,
            activationAllowed: blocked == 0
        )
    }
}
