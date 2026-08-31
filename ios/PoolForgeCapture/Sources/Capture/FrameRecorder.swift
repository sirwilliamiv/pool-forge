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

    /// Called on the recorder queue with each finished chunk file.
    var onChunkReady: ((QueuedChunk) -> Void)?
    /// Called on the main queue with the running recorded-frame count.
    var onFrameRecorded: ((Int) -> Void)?

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
        let depth = frame.sceneDepth

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

            if let depth {
                appendDepth(depth, frameIndex: idx, timestamp: now)
            }

            let count = Int(frameIndex)
            DispatchQueue.main.async { self.onFrameRecorded?(count) }

            if frameBytes >= Self.rollBytes || frameEntries.count >= Self.rollFrames {
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
            emitChunk(seq: takeSeq(), kind: .frames, data: data)
            frameEntries.removeAll()
            frameBytes = 0
        }
        if !poseLines.isEmpty {
            let data = Data((poseLines.joined(separator: "\n") + "\n").utf8)
            emitChunk(seq: takeSeq(), kind: .poses, data: data)
            poseLines.removeAll()
        }
        if !depthEntries.isEmpty {
            let data = ChunkCodec.encodeDepth(depthEntries)
            emitChunk(seq: takeSeq(), kind: .depth, data: data)
            depthEntries.removeAll()
        }
    }

    private func takeSeq() -> Int {
        let seq = nextSeq
        nextSeq += 1
        return seq
    }

    private func emitChunk(seq: Int, kind: ChunkKind, data: Data) {
        let url = directory.appendingPathComponent("\(seq)-\(kind.rawValue).bin")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }
        let chunk = QueuedChunk(sessionId: sessionId, seq: seq, kind: kind,
                                bytes: data.count, sha256: Hashing.sha256Hex(data),
                                filePath: url.path)
        onChunkReady?(chunk)
    }

    private func encodeJPEG(_ pixelBuffer: CVPixelBuffer) -> Data? {
        let image = CIImage(cvPixelBuffer: pixelBuffer)
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let qualityKey = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        return ciContext.jpegRepresentation(of: image, colorSpace: colorSpace,
                                            options: [qualityKey: jpegQuality])
    }

    private func appendDepth(_ depth: ARDepthData, frameIndex: UInt32, timestamp: TimeInterval) {
        let depthBytes = Self.pixelBufferBytes(depth.depthMap, bytesPerPixel: 4)
        guard let confidenceMap = depth.confidenceMap else { return }
        let confBytes = Self.pixelBufferBytes(confidenceMap, bytesPerPixel: 1)
        guard let depthZ = try? Zlib.compress(depthBytes),
              let confZ = try? Zlib.compress(confBytes) else { return }
        depthEntries.append(DepthChunkEntry(frameIndex: frameIndex, timestampS: timestamp,
                                            depthZlib: depthZ, confZlib: confZ))
    }

    static func pixelBufferBytes(_ pb: CVPixelBuffer, bytesPerPixel: Int) -> Data {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return Data() }
        let width = CVPixelBufferGetWidth(pb)
        let height = CVPixelBufferGetHeight(pb)
        let rowBytes = CVPixelBufferGetBytesPerRow(pb)
        var out = Data(capacity: width * height * bytesPerPixel)
        for row in 0..<height {
            out.append(Data(bytes: base + row * rowBytes, count: width * bytesPerPixel))
        }
        return out
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
