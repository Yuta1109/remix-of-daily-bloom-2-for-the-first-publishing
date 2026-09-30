import Foundation

enum NativeDataFeature: String, CaseIterable, Sendable {
    case planning
    case today
    case calendar
    case progress
    case notes
    case user
    case settings
}

/// Stable boundary between SwiftUI features and the existing V3/Firebase layer.
/// Feature-specific typed payloads are added when each feature is migrated.
struct NativeFeatureSnapshot: Sendable, Equatable {
    var revision: String?
    var values: [String: String]

    static let empty = NativeFeatureSnapshot(revision: nil, values: [:])
}

protocol NativeDataAdapter: Sendable {
    func snapshot(for feature: NativeDataFeature) async throws -> NativeFeatureSnapshot
}

struct EmptyNativeDataAdapter: NativeDataAdapter {
    func snapshot(for feature: NativeDataFeature) async throws -> NativeFeatureSnapshot {
        .empty
    }
}
