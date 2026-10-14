import WebKit

/// Read-only probe of `capacitor://localhost`. Call only from the temporary diagnostic.
/// The inert document does not run the old app. WebKit access is unverified until a device run.
@MainActor
final class LegacyWebViewDataReader: NSObject, WKNavigationDelegate {
    static let origin = "capacitor://localhost"
    static let v3Key = "essences-app-data-v3"
    static let calendarEventsKey = "calendar-events"
    static let cloudOwnerKey = "essences-cloud-owner-v1"

    enum Status: String {
        case availableWithData
        case accessibleButEmpty
        case inaccessibleOrigin
        case missingLegacyAssets
        case malformedData
        case unsupportedFormat
        case readFailed
        case readInProgress
    }

    struct Snapshot {
        var status: Status
        var v3Raw: String?
        var calendarEventsRaw: String?
        /// Compared locally and not shown. Nil when the key is absent.
        var ownerMarker: String?
    }

    private static var inFlight = false
    private var webView: WKWebView?
    private var continuation: CheckedContinuation<Snapshot, Never>?
    private var timeout: Task<Void, Never>?
    private var finished = false
    private let handler = InertCapacitorOrigin()

    func read() async -> Snapshot {
        if Self.inFlight {
            return Snapshot(status: .readInProgress, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil)
        }
        Self.inFlight = true
        finished = false
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(handler, forURLScheme: "capacitor")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        webView = view
        let snapshot: Snapshot = await withCheckedContinuation { continuation in
            self.continuation = continuation
            self.timeout = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                self?.finish(Snapshot(status: .readFailed, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil))
            }
            guard let url = URL(string: "\(Self.origin)/essences-legacy-read.html") else {
                self.finish(Snapshot(status: .missingLegacyAssets, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil))
                return
            }
            view.load(URLRequest(url: url))
        }
        Self.inFlight = false
        return snapshot
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let url = navigationAction.request.url
        if url?.scheme == "capacitor", url?.host == "localhost" {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        (function() {
          var v3 = localStorage.getItem('\(Self.v3Key)');
          var events = localStorage.getItem('\(Self.calendarEventsKey)');
          var owner = localStorage.getItem('\(Self.cloudOwnerKey)');
          return JSON.stringify({ v3: v3, events: events, owner: owner });
        })()
        """
        webView.evaluateJavaScript(script) { [weak self] value, error in
            guard let self else { return }
            if error != nil {
                self.finish(Snapshot(status: .readFailed, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil))
                return
            }
            self.finish(Self.snapshot(from: value as? String))
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(Snapshot(status: .inaccessibleOrigin, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(Snapshot(status: .inaccessibleOrigin, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil))
    }

    private func finish(_ snapshot: Snapshot) {
        guard !finished else { return }
        finished = true
        timeout?.cancel()
        timeout = nil
        continuation?.resume(returning: snapshot)
        continuation = nil
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView = nil
    }

    static func snapshot(from encoded: String?) -> Snapshot {
        guard let encoded, let data = encoded.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return Snapshot(status: .readFailed, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: nil)
        }
        let v3 = object["v3"] as? String
        let events = object["events"] as? String
        let owner = object["owner"] as? String
        if v3 == nil && events == nil {
            return Snapshot(status: .accessibleButEmpty, v3Raw: nil, calendarEventsRaw: nil, ownerMarker: owner)
        }
        let classified = LegacyCalendarClassification.classify(v3Raw: v3, calendarEventsRaw: events)
        return Snapshot(status: classified.status, v3Raw: v3, calendarEventsRaw: events, ownerMarker: owner)
    }
}

enum LegacyOwnerMatch: String {
    case matchingOwner
    case differentOwner
    case missingOwner
    case unauthenticated
    case invalidOwnerMarker
}

enum LegacyCalendarClassification {
    static func owner(_ marker: String?, signedInUid: String?) -> LegacyOwnerMatch {
        let uid = signedInUid?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if uid.isEmpty { return .unauthenticated }
        guard let marker else { return .missingOwner }
        let trimmed = marker.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .invalidOwnerMarker }
        return trimmed == uid ? .matchingOwner : .differentOwner
    }

    static func classify(v3Raw: String?, calendarEventsRaw: String?) -> (
        status: LegacyWebViewDataReader.Status,
        candidateCount: Int,
        duplicateCount: Int,
        malformedCount: Int
    ) {
        if v3Raw == nil && calendarEventsRaw == nil {
            return (.accessibleButEmpty, 0, 0, 0)
        }
        var malformed = 0
        var unsupported = false
        var seen = Set<String>()
        var candidates = 0
        var duplicates = 0

        if let v3Raw {
            if let data = v3Raw.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if (object["schemaVersion"] as? Int) != 3 {
                    unsupported = true
                } else if let events = object["events"] as? [String: Any] {
                    for value in events.values {
                        guard let row = value as? [String: Any] else { malformed += 1; continue }
                        if (row["isSample"] as? Bool) == true { continue }
                        guard let id = row["id"] as? String, row["title"] is String else { malformed += 1; continue }
                        if seen.contains(id) { duplicates += 1 } else { seen.insert(id); candidates += 1 }
                    }
                } else if object["events"] != nil {
                    malformed += 1
                }
            } else {
                malformed += 1
            }
        }

        if let calendarEventsRaw {
            if let data = calendarEventsRaw.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) {
                if let list = parsed as? [Any] {
                    for value in list {
                        guard let row = value as? [String: Any] else { malformed += 1; continue }
                        if (row["isSample"] as? Bool) == true { continue }
                        guard let id = row["id"] as? String, row["title"] is String else { malformed += 1; continue }
                        if seen.contains(id) { duplicates += 1 } else { seen.insert(id); candidates += 1 }
                    }
                } else {
                    unsupported = true
                }
            } else {
                malformed += 1
            }
        }

        let status: LegacyWebViewDataReader.Status = malformed > 0
            ? .malformedData
            : unsupported
                ? .unsupportedFormat
                : candidates > 0 ? .availableWithData : .accessibleButEmpty
        return (status, candidates, duplicates, malformed)
    }

    /// Calendar events only. V3 wins on id. `isSample` rows are omitted.
    static func calendarRecords(v3Raw: String?, calendarEventsRaw: String?) -> [LegacyCalendarRecord] {
        var records: [LegacyCalendarRecord] = []
        var seen = Set<String>()
        if let v3Raw,
           let data = v3Raw.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           (object["schemaVersion"] as? Int) == 3,
           let events = object["events"] as? [String: Any] {
            for value in events.values {
                guard let row = value as? [String: Any], (row["isSample"] as? Bool) != true,
                      let id = row["id"] as? String, let title = row["title"] as? String,
                      seen.insert(id).inserted else { continue }
                records.append(record(id: id, title: title, row: row, v3: true))
            }
        }
        if let calendarEventsRaw,
           let data = calendarEventsRaw.data(using: .utf8),
           let list = try? JSONSerialization.jsonObject(with: data) as? [Any] {
            for value in list {
                guard let row = value as? [String: Any], (row["isSample"] as? Bool) != true,
                      let id = row["id"] as? String, let title = row["title"] as? String,
                      seen.insert(id).inserted else { continue }
                records.append(record(id: id, title: title, row: row, v3: false))
            }
        }
        return records
    }

    private static func record(id: String, title: String, row: [String: Any], v3: Bool) -> LegacyCalendarRecord {
        let startAt = row["startAt"] as? String
        let endAt = row["endAt"] as? String
        let allDay = row["allDay"] as? Bool
        let date = v3 ? startAt.flatMap { $0.count >= 10 ? String($0.prefix(10)) : nil } : row["date"] as? String
        let startTime = v3
            ? ((allDay == true) ? nil : startAt.flatMap { $0.count >= 16 ? String($0.dropFirst(11).prefix(5)) : nil })
            : row["startTime"] as? String
        let endTime = v3
            ? ((allDay == true) ? nil : endAt.flatMap { $0.count >= 16 ? String($0.dropFirst(11).prefix(5)) : nil })
            : row["endTime"] as? String
        let endDate = v3 ? endAt.flatMap { $0.count >= 10 ? String($0.prefix(10)) : nil } : row["endDate"] as? String
        let repeatValue: String?
        if v3, let recurrence = row["recurrence"] as? [String: Any] {
            repeatValue = recurrence["freq"] as? String
        } else {
            repeatValue = row["repeat"] as? String
        }
        let reminders = (row["reminders"] as? [Any])?.compactMap { $0 as? String }
            ?? (row["reminder"] as? String).map { [$0] }
        return LegacyCalendarRecord(
            id: id,
            title: title,
            date: date ?? "",
            endDate: endDate,
            allDay: allDay,
            startTime: startTime,
            endTime: endTime,
            color: row["color"] as? String,
            location: row["location"] as? String,
            notes: (v3 ? row["note"] : row["notes"]) as? String,
            reminders: reminders,
            repeatFrequency: repeatValue,
            repeatEndDate: row["repeatEndDate"] as? String,
            liveActivity: row["liveActivity"] as? Bool,
            liveActivityLead: row["liveActivityLead"] as? String,
            updatedAt: row["updatedAt"] as? String,
            excludeDates: (row["excludeDates"] as? [Any])?.compactMap { $0 as? String },
            recurrenceMasterId: row["recurrenceMasterId"] as? String,
            recurrenceDate: row["recurrenceDate"] as? String,
            icon: row["icon"] as? String
        )
    }
}

struct LegacyDiagnosticReport {
    var status: LegacyWebViewDataReader.Status
    var v3Present: Bool
    var calendarEventsPresent: Bool
    var candidateCount: Int
    var duplicateCount: Int
    var malformedCount: Int
    var owner: LegacyOwnerMatch
    var eligibleForFutureImport: Bool
    var importExecuted: Bool
}

extension LegacyWebViewDataReader.Snapshot {
    func report(signedInUid: String?) -> LegacyDiagnosticReport {
        let classified = LegacyCalendarClassification.classify(v3Raw: v3Raw, calendarEventsRaw: calendarEventsRaw)
        let owner = LegacyCalendarClassification.owner(ownerMarker, signedInUid: signedInUid)
        let status = self.status == .readFailed || self.status == .readInProgress || self.status == .inaccessibleOrigin || self.status == .missingLegacyAssets
            ? self.status
            : classified.status
        return LegacyDiagnosticReport(
            status: status,
            v3Present: v3Raw != nil,
            calendarEventsPresent: calendarEventsRaw != nil,
            candidateCount: classified.candidateCount,
            duplicateCount: classified.duplicateCount,
            malformedCount: classified.malformedCount,
            owner: owner,
            eligibleForFutureImport: status == .availableWithData && classified.candidateCount > 0,
            importExecuted: false
        )
    }
}

private final class InertCapacitorOrigin: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard urlSchemeTask.request.url?.scheme == "capacitor", urlSchemeTask.request.url?.host == "localhost" else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let html = "<!doctype html><meta charset=utf-8><title>legacy-read</title>"
        let body = Data(html.utf8)
        guard let url = urlSchemeTask.request.url,
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/html; charset=utf-8"]) else {
            urlSchemeTask.didFailWithError(URLError(.badServerResponse))
            return
        }
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(body)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
