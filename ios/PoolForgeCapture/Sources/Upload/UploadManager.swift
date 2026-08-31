import Foundation

// Worker loop over the SQLite queue:
//   pending -> POST chunks (register) -> registered
//   registered -> PUT bytes to the GCS resumable URI -> uploaded
//   uploaded -> POST complete -> verified, local file deleted
// Uploads run on a background-capable URLSession so an app suspend mid-walk
// does not stall the tail. On relaunch the queue is rebuilt from the DB and
// kick() picks up where it left off.

final class UploadManager: NSObject, ObservableObject {
    static let shared = UploadManager()

    /// Set by the app so the worker always sees current Settings.
    var clientProvider: (() -> APIClient?)?
    /// Stored from handleEventsForBackgroundURLSession, called when the
    /// background session drains.
    var backgroundCompletionHandler: (() -> Void)?

    @Published private(set) var summaries: [UploadSessionSummary] = []
    @Published private(set) var lastError: String?

    let queue: UploadQueue

    private lazy var backgroundSession: URLSession = {
        let cfg = URLSessionConfiguration.background(withIdentifier: "com.poolforge.capture.upload")
        cfg.sessionSendsLaunchEvents = true
        cfg.isDiscretionary = false
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    private let stateLock = NSLock()
    private var activeKeys: Set<String> = []

    override init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PoolForgeCapture", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let path = dir.appendingPathComponent("uploads.db").path
        if let q = try? UploadQueue(path: path) {
            queue = q
        } else {
            // Last resort so the app still launches; uploads will not persist.
            queue = try! UploadQueue(path: ":memory:")
        }
        super.init()
        _ = backgroundSession // create eagerly so relaunch events reattach
    }

    static func chunkKey(_ sessionId: String, _ seq: Int) -> String { "\(sessionId)#\(seq)" }

    // MARK: public surface

    func startSession(id: String, address: String) {
        try? queue.createSession(id: id, address: address)
        refresh()
    }

    func enqueue(_ chunk: QueuedChunk) {
        do {
            try queue.enqueue(chunk)
        } catch {
            report(error)
        }
        refresh()
        kick()
    }

    func kick() {
        Task { await self.pump() }
    }

    /// Returns an error sentence, or nil when the session finalized cleanly.
    func finalize(sessionId: String) async -> String? {
        guard let client = clientProvider?() else { return APIError.notConfigured.errorDescription }
        guard let maxSeq = queue.maxSeq(sessionId: sessionId) else {
            return "Nothing was recorded for this session yet."
        }
        do {
            let missing = try await client.finalize(sessionId: sessionId, maxSeq: maxSeq)
            if missing.isEmpty {
                try? queue.setSessionStatus(sessionId, "finalized")
                refresh()
                return nil
            }
            try? queue.resetToPending(sessionId: sessionId, seqs: missing)
            refresh()
            kick()
            let noun = missing.count == 1 ? "chunk" : "chunks"
            return "The server is still missing \(missing.count) \(noun). They were queued again; finalize once uploads finish."
        } catch {
            return sentence(for: error)
        }
    }

    // MARK: worker

    private func pump() async {
        guard let client = clientProvider?() else {
            await MainActor.run { lastError = APIError.notConfigured.errorDescription }
            return
        }
        let work = queue.unverifiedChunks()
        for chunk in work {
            let key = Self.chunkKey(chunk.sessionId, chunk.seq)
            guard claim(key) else { continue }
            switch chunk.status {
            case .pending:
                await register(chunk, client: client, key: key)
            case .registered:
                await startUpload(chunk, key: key)
            case .uploaded:
                await complete(chunk, client: client, key: key)
            case .verified:
                release(key)
            }
        }
        refresh()
    }

    private func register(_ chunk: QueuedChunk, client: APIClient, key: String) async {
        do {
            let url = try await client.registerChunk(sessionId: chunk.sessionId, seq: chunk.seq,
                                                     kind: chunk.kind.rawValue, bytes: chunk.bytes,
                                                     sha256: chunk.sha256)
            try queue.setStatus(sessionId: chunk.sessionId, seq: chunk.seq,
                                status: .registered, uploadUrl: url.absoluteString)
            var updated = chunk
            updated.status = .registered
            updated.uploadUrl = url.absoluteString
            await startUpload(updated, key: key)
        } catch APIError.conflict {
            // Registered again after verification: the server already has it.
            markVerified(sessionId: chunk.sessionId, seq: chunk.seq, filePath: chunk.filePath)
            release(key)
        } catch {
            report(error)
            release(key)
        }
    }

    private func startUpload(_ chunk: QueuedChunk, key: String) async {
        guard let urlString = chunk.uploadUrl, let url = URL(string: urlString) else {
            // Lost the URI somehow; go back through register.
            try? queue.setStatus(sessionId: chunk.sessionId, seq: chunk.seq, status: .pending)
            release(key)
            kick()
            return
        }
        let fileURL = URL(fileURLWithPath: chunk.filePath)
        guard FileManager.default.fileExists(atPath: chunk.filePath) else {
            await MainActor.run {
                lastError = "A recorded chunk file went missing before upload. That walk cannot be completed."
            }
            release(key)
            return
        }
        if chunk.attempts == 0 {
            var req = URLRequest(url: url)
            req.httpMethod = "PUT"
            let task = backgroundSession.uploadTask(with: req, fromFile: fileURL)
            task.taskDescription = key
            task.resume()
        } else {
            await resumeUpload(chunk, url: url, fileURL: fileURL, key: key)
        }
    }

    /// GCS resumable resume: ask the session URI how much it has, then PUT the
    /// remainder with a Content-Range header.
    private func resumeUpload(_ chunk: QueuedChunk, url: URL, fileURL: URL, key: String) async {
        do {
            var probe = URLRequest(url: url)
            probe.httpMethod = "PUT"
            probe.setValue("bytes */\(chunk.bytes)", forHTTPHeaderField: "Content-Range")
            let (_, response) = try await URLSession.shared.data(for: probe)
            guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
            if (200...299).contains(http.statusCode) {
                try? queue.setStatus(sessionId: chunk.sessionId, seq: chunk.seq, status: .uploaded)
                release(key)
                kick()
                return
            }
            guard http.statusCode == 308 else { throw APIError.server(http.statusCode) }
            var committed = 0
            if let range = http.value(forHTTPHeaderField: "Range"),
               let dash = range.lastIndex(of: "-"),
               let last = Int(range[range.index(after: dash)...]) {
                committed = last + 1
            }
            if committed >= chunk.bytes {
                try? queue.setStatus(sessionId: chunk.sessionId, seq: chunk.seq, status: .uploaded)
                release(key)
                kick()
                return
            }
            let sliceURL = try sliceFile(fileURL, from: committed, key: key)
            var req = URLRequest(url: url)
            req.httpMethod = "PUT"
            req.setValue("bytes \(committed)-\(chunk.bytes - 1)/\(chunk.bytes)",
                         forHTTPHeaderField: "Content-Range")
            let task = backgroundSession.uploadTask(with: req, fromFile: sliceURL)
            task.taskDescription = key
            task.resume()
        } catch {
            try? queue.incrementAttempts(sessionId: chunk.sessionId, seq: chunk.seq)
            report(error)
            release(key)
            scheduleRetry(after: chunk.attempts)
        }
    }

    private func sliceFile(_ fileURL: URL, from offset: Int, key: String) throws -> URL {
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("resume-\(key.replacingOccurrences(of: "#", with: "-")).bin")
        try? FileManager.default.removeItem(at: tmp)
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let rest = try handle.readToEnd() ?? Data()
        try rest.write(to: tmp, options: .atomic)
        return tmp
    }

    private func complete(_ chunk: QueuedChunk, client: APIClient, key: String) async {
        do {
            try await client.completeChunk(sessionId: chunk.sessionId, seq: chunk.seq)
            markVerified(sessionId: chunk.sessionId, seq: chunk.seq, filePath: chunk.filePath)
            release(key)
            refresh()
        } catch APIError.conflict {
            markVerified(sessionId: chunk.sessionId, seq: chunk.seq, filePath: chunk.filePath)
            release(key)
            refresh()
        } catch {
            report(error)
            release(key)
            scheduleRetry(after: chunk.attempts)
        }
    }

    private func markVerified(sessionId: String, seq: Int, filePath: String) {
        try? queue.setStatus(sessionId: sessionId, seq: seq, status: .verified)
        try? FileManager.default.removeItem(atPath: filePath)
    }

    // MARK: bookkeeping

    private func claim(_ key: String) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard !activeKeys.contains(key) else { return false }
        activeKeys.insert(key)
        return true
    }

    private func release(_ key: String) {
        stateLock.lock()
        activeKeys.remove(key)
        stateLock.unlock()
    }

    private func scheduleRetry(after attempts: Int) {
        let delay = min(60.0, pow(2.0, Double(min(attempts, 6))))
        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.kick()
        }
    }

    func refresh() {
        let s = queue.summaries()
        DispatchQueue.main.async { [weak self] in
            self?.summaries = s
        }
    }

    private func report(_ error: Error) {
        let text = sentence(for: error)
        DispatchQueue.main.async { [weak self] in
            self?.lastError = text
        }
    }

    private func sentence(for error: Error) -> String {
        if let api = error as? APIError {
            return api.errorDescription ?? "Something went wrong talking to the server."
        }
        if error is URLError {
            return APIError.network.errorDescription ?? "Network trouble."
        }
        return (error as? LocalizedError)?.errorDescription ?? "Something went wrong. Try again."
    }
}

extension UploadManager: URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let key = task.taskDescription else { return }
        let parts = key.split(separator: "#", maxSplits: 1)
        guard parts.count == 2, let seq = Int(parts[1]) else { return }
        let sessionId = String(parts[0])
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? -1
        let failed = error != nil
        Task {
            await self.handleUploadResult(sessionId: sessionId, seq: seq, key: key,
                                          status: status, failed: failed)
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [weak self] in
            self?.backgroundCompletionHandler?()
            self?.backgroundCompletionHandler = nil
        }
    }

    private func handleUploadResult(sessionId: String, seq: Int, key: String,
                                    status: Int, failed: Bool) async {
        defer { release(key) }
        guard let chunk = queue.chunk(sessionId: sessionId, seq: seq) else { return }
        if !failed && (200...299).contains(status) {
            try? queue.setStatus(sessionId: sessionId, seq: seq, status: .uploaded)
            kick()
            return
        }
        // 308 means the resumable session took a partial body; retry resumes.
        try? queue.incrementAttempts(sessionId: sessionId, seq: seq)
        if failed || status == 308 || (500...599).contains(status) || status == 408 || status == -1 {
            scheduleRetry(after: chunk.attempts)
        } else {
            // Permanent-looking failure: the URI may have expired. Re-register.
            try? queue.setStatus(sessionId: sessionId, seq: seq, status: .pending)
            scheduleRetry(after: chunk.attempts)
        }
        refresh()
    }
}
