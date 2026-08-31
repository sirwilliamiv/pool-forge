import Foundation
import ARKit
import CoreImage
import CoreMotion
import ImageIO
import simd

// Samples ARFrames at ~2 fps and writes the contract's chunk files:
// frames (PFC1 JPEG), poses (JSONL), depth (PFD1, LiDAR only), plus the seq 0
// meta chunk. Rolls chunks at 24 MB or 50 frames and hands each finished file
// to the upload queue.

struct PoseRecord: Codable {
    let i: UInt32
    let t: Double
    let transform: [Float]
    let intrinsics: [Float]
    let trackingState: String
    let gravity: [Double]
}

struct CaptureMeta: Codable {
    let contractVersion: Int
    let sessionId: String
    let address: String
    let lat: Double
    let lng: Double
    let footprintLatLng: [[Double]]?
    let footprintLocalMeters: [[Double]]?
    let lapStationsMeters: [[Double]]?
    let standoffMeters: Double
    let sampleFps: Double
    let device: DeviceInfo
    let createdAt: String
}

final class FrameRecorder {
    static let rollBytes = 24 * 1024 * 1024
    static let rollFrames = 50
    static let sampleInterval: TimeInterval = 0.5

    let sessionId: String
    private let directory: URL
    private let io = DispatchQueue(label: "com.poolforge.capture.recorder")
    private let ciContext = CIContext()
    private let motion = CMMotionManager()
    private let jpegQuality: CGFloat = 0.8

    private var nextSeq = 1 // 0 is the meta chunk
    private var frameIndex: UInt32 = 0
    private var lastSampleTimestamp: TimeInterval = -.infinity

    private var frameEntries: [FrameChunkEntry] = []
    private var frameBytes = 0
    private var poseLines: [String] = []
    private var depthEntries: [DepthChunkEntry] = []
    private var depthBytes = 0
    private var depthFrames = 0

    /// Set once the depth branch has proved it cannot produce contract-shaped
    /// buffers on this device; stops us retrying 60 times a second and stops
    /// half-valid depth reaching the cloud.
    private var depthDisabled = false

    /// Called on the recorder queue with each finished chunk file.
    var onChunkReady: ((QueuedChunk) -> Void)?
    /// Called on the main queue with the running recorded-frame count.
    var onFrameRecorded: ((Int) -> Void)?
    /// Called on the main queue with the running recorded depth-frame count.
    /// Zero on a device without LiDAR; on a Pro device this is the fastest
    /// on-site confirmation that the depth branch is actually running.
    var onDepthRecorded: ((Int) -> Void)?
    /// Called on the main queue, at most once per distinct message, with a
    /// short human sentence about something the recorder had to give up on.
    var onIssue: ((String) -> Void)?

    private var reportedIssues = Set<String>()

    init(sessionId: String) throws {
        self.sessionId = sessionId
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PoolForgeCapture/chunks/\(sessionId)", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        directory = base
        if motion.isDeviceMotionAvailable {
            motion.startDeviceMotionUpdates()
        }
    }

    deinit {
        motion.stopDeviceMotionUpdates()
    }

    func writeMeta(address: String, lat: Double, lng: Double,
                   footprint: [LatLng]?, plan: LapPlan?, device: DeviceInfo) {
        let meta = CaptureMeta(
            contractVersion: 1,
            sessionId: sessionId,
            address: address,
            lat: lat,
            lng: lng,
            footprintLatLng: footprint.map { $0.map { [$0.lat, $0.lng] } },
            footprintLocalMeters: plan.map { $0.footprint.map { [$0.x, $0.y] } },
            lapStationsMeters: plan.map { $0.stations.map { [$0.x, $0.y] } },
            standoffMeters: LapPlanner.standoffMeters,
            sampleFps: 1.0 / Self.sampleInterval,
            device: device,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        io.async { [self] in
            guard let data = try? JSONEncoder().encode(meta) else { return }
            emitChunk(seq: 0, kind: .meta, data: data)
        }
    }

    /// Called from the ARSession delegate with every frame; samples ~2 fps.
    func record(frame: ARFrame) {
        let now = frame.timestamp
        guard now - lastSampleTimestamp >= Self.sampleInterval else { return }
        lastSampleTimestamp = now

        let idx = frameIndex
        frameIndex += 1
        // Snapshot the counter here: frameIndex belongs to the delegate thread,
        // and reading it from the io queue was a data race.
        let recordedCount = Int(frameIndex)
        let pixelBuffer = frame.capturedImage
        let camera = frame.camera
        let transform = Self.columnMajor16(camera.transform)
        let intrinsics = Self.columnMajor9(camera.intrinsics)
        let trackingState: String
        switch camera.trackingState {
        case .normal: trackingState = "normal"
        default: trackingState = "limited"
        }
        let gravity: [Double]
        if let g = motion.deviceMotion?.gravity {
            gravity = [g.x, g.y, g.z]
        } else {
            gravity = [0, 0, -1]
        }
        // Depth is unpacked HERE, on the session delegate's thread, not on the
        // io queue. ARKit hands out sceneDepth buffers from a small recycled
        // pool; carrying an ARDepthData across an async hop keeps those buffers
        // out of the pool for as long as compression takes and can stall the
        // session. Copying 240 KB synchronously costs microseconds, and after
        // it we hold plain Data that belongs to nobody but us.
        let depthPlanes = extractDepth(frame)

        io.async { [self] in
            guard let jpeg = encodeJPEG(pixelBuffer) else { return }
            frameEntries.append(FrameChunkEntry(frameIndex: idx, timestampS: now, jpeg: jpeg))
            frameBytes += jpeg.count

            let pose = PoseRecord(i: idx, t: now, transform: transform, intrinsics: intrinsics,
                                  trackingState: trackingState, gravity: gravity)
            if let line = try? JSONEncoder().encode(pose),
               let text = String(data: line, encoding: .utf8) {
                poseLines.append(text)
            }

            if let depthPlanes {
                appendDepth(depthPlanes, frameIndex: idx, timestamp: now)
            }

            let depthCount = depthFrames
            DispatchQueue.main.async {
                self.onFrameRecorded?(recordedCount)
                self.onDepthRecorded?(depthCount)
            }

            if frameBytes >= Self.rollBytes
                || depthBytes >= Self.rollBytes
                || frameEntries.count >= Self.rollFrames {
                rollAll()
            }
        }
    }

    /// Flush every open chunk. Completion receives the max seq used, on main.
    func finish(completion: @escaping (Int) -> Void) {
        io.async { [self] in
            rollAll()
            let maxSeq = nextSeq - 1
            DispatchQueue.main.async { completion(maxSeq) }
        }
    }

    // MARK: internals (all on io queue)

    private func rollAll() {
        if !frameEntries.isEmpty {
            let data = ChunkCodec.encodeFrames(frameEntries)
            emitRolledChunk(kind: .frames, data: data)
            frameEntries.removeAll()
            frameBytes = 0
        }
        if !poseLines.isEmpty {
            let data = Data((poseLines.joined(separator: "\n") + "\n").utf8)
            emitRolledChunk(kind: .poses, data: data)
            poseLines.removeAll()
        }
        if !depthEntries.isEmpty {
            let data = ChunkCodec.encodeDepth(depthEntries)
            emitRolledChunk(kind: .depth, data: data)
            depthEntries.removeAll()
            depthBytes = 0
        }
    }

    /// The seq is only consumed when the file actually lands on disk. Burning a
    /// seq on a failed write leaves a permanent hole in the manifest, and
    /// finalize then 409s forever on a bundle that can never be completed.
    private func emitRolledChunk(kind: ChunkKind, data: Data) {
        if emitChunk(seq: nextSeq, kind: kind, data: data) {
            nextSeq += 1
        }
    }

    @discardableResult
    private func emitChunk(seq: Int, kind: ChunkKind, data: Data) -> Bool {
        let url = directory.appendingPathComponent("\(seq)-\(kind.rawValue).bin")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            report("A \(kind.rawValue) chunk could not be written to this phone. Check free storage.")
            return false
        }
        let chunk = QueuedChunk(sessionId: sessionId, seq: seq, kind: kind,
                                bytes: data.count, sha256: Hashing.sha256Hex(data),
                                filePath: url.path)
        onChunkReady?(chunk)
        return true
    }

    /// Deduped on the main queue, because callers live on both the ARSession
    /// delegate queue and the recorder's io queue.
    private func report(_ message: String) {
        DispatchQueue.main.async {
            guard !self.reportedIssues.contains(message) else { return }
            self.reportedIssues.insert(message)
            self.onIssue?(message)
        }
    }

    private func encodeJPEG(_ pixelBuffer: CVPixelBuffer) -> Data? {
        let image = CIImage(cvPixelBuffer: pixelBuffer)
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let qualityKey = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        return ciContext.jpegRepresentation(of: image, colorSpace: colorSpace,
                                            options: [qualityKey: jpegQuality])
    }

    /// Raw, uncompressed, contract-shaped depth planes for one frame. Runs on
    /// the ARSession delegate queue so no ARKit-owned buffer is retained past
    /// the callback.
    struct DepthPlanes {
        let depth: Data
        let confidence: Data
    }

    private func extractDepth(_ frame: ARFrame) -> DepthPlanes? {
        guard !depthDisabled, let sceneDepth = frame.sceneDepth else { return nil }
        // Confidence is checked first: without it the PFD1 record cannot be
        // written at all, so unpacking depth would be wasted work.
        guard let confidenceMap = sceneDepth.confidenceMap else {
            report("Depth confidence was missing, so depth is not being recorded.")
            return nil
        }
        do {
            let depth = try DepthPacker.packDepth(sceneDepth.depthMap)
            let confidence = try DepthPacker.packConfidence(confidenceMap)
            return DepthPlanes(depth: depth, confidence: confidence)
        } catch let failure as DepthPacker.Failure {
            // The chunk format pins 256x192; anything else cannot be described,
            // so stop rather than ship bytes the cloud will misread.
            depthDisabled = true
            report("Depth is off for this walk: \(failure.description). RGB and poses are unaffected.")
            return nil
        } catch {
            depthDisabled = true
            report("Depth is off for this walk. RGB and poses are unaffected.")
            return nil
        }
    }

    private func appendDepth(_ planes: DepthPlanes, frameIndex: UInt32, timestamp: TimeInterval) {
        guard let depthZ = try? Zlib.compress(planes.depth),
              let confZ = try? Zlib.compress(planes.confidence) else {
            report("A depth frame could not be compressed and was skipped.")
            return
        }
        depthEntries.append(DepthChunkEntry(frameIndex: frameIndex, timestampS: timestamp,
                                            depthZlib: depthZ, confZlib: confZ))
        depthBytes += depthZ.count + confZ.count + 20
        depthFrames += 1
    }

    static func columnMajor16(_ m: simd_float4x4) -> [Float] {
        [m.columns.0.x, m.columns.0.y, m.columns.0.z, m.columns.0.w,
         m.columns.1.x, m.columns.1.y, m.columns.1.z, m.columns.1.w,
         m.columns.2.x, m.columns.2.y, m.columns.2.z, m.columns.2.w,
         m.columns.3.x, m.columns.3.y, m.columns.3.z, m.columns.3.w]
    }

    static func columnMajor9(_ m: simd_float3x3) -> [Float] {
        [m.columns.0.x, m.columns.0.y, m.columns.0.z,
         m.columns.1.x, m.columns.1.y, m.columns.1.z,
         m.columns.2.x, m.columns.2.y, m.columns.2.z]
    }
}
