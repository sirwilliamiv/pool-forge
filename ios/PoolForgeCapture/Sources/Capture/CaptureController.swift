import Foundation
import ARKit
import RealityKit
import UIKit
import Combine

// Drives the AR walk: waypoint rings on the ground along the lap, coverage
// paint under the camera, distance hints against the footprint, and the
// return-to-start final leg. Capability gating is runtime-only; nothing here
// checks model strings.

extension float4x4 {
    var translationVector: SIMD3<Float> {
        SIMD3(columns.3.x, columns.3.y, columns.3.z)
    }
}

final class CaptureController: NSObject, ObservableObject, ARSessionDelegate {
    static var arSupported: Bool { ARWorldTrackingConfiguration.isSupported }
    static var lidarAvailable: Bool {
        ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    let arView = ARView(frame: .zero)

    @Published var status = "Point the camera at open ground and move slowly."
    @Published var hint: String?
    @Published var warning: String?       // amber: guidance corrections only
    @Published var anchored = false
    @Published var recording = false
    @Published var returningToStart = false
    @Published var reachedStart = false
    @Published var recordedFrames = 0
    @Published var currentStation = 0
    @Published var stationTotal = 0

    private var plan: LapPlan?
    private var recorder: FrameRecorder?
    private var stationWorld: [SIMD3<Float>] = []
    private var footprintWorld: [SIMD3<Float>] = []
    private var ringEntities: [ModelEntity] = []
    private var sceneAnchor: AnchorEntity?
    private var lastPaintPosition: SIMD3<Float>?

    private let advanceRadius: Float = 1.5
    private let paintSpacing: Float = 0.5
    private let tooCloseMeters: Float = 2.0
    private let tooFarMeters: Float = 4.5

    func start(plan: LapPlan?, recorder: FrameRecorder) {
        guard Self.arSupported else { return }
        self.plan = plan
        self.recorder = recorder
        stationTotal = plan.map { max($0.stations.count - 1, 0) } ?? 0

        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravityAndHeading
        config.planeDetection = [.horizontal]
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }

        let anchor = AnchorEntity(world: SIMD3<Float>(0, 0, 0))
        arView.scene.addAnchor(anchor)
        sceneAnchor = anchor

        arView.session.delegate = self
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])

        if plan == nil {
            status = "No footprint for this site. Tap the ground where you are standing to start recording."
        } else {
            status = "Walk to the first ring position, then tap the ground there. North of the house is a good start."
        }
    }

    func stop() {
        arView.session.pause()
    }

    func handleTap(at point: CGPoint) {
        guard !anchored else { return }
        guard let hit = arView.raycast(from: point, allowing: .estimatedPlane,
                                       alignment: .horizontal).first else {
            warning = "No ground found there yet. Aim at open ground and try again."
            return
        }
        warning = nil
        anchorPlan(at: hit.worldTransform.translationVector)
    }

    private func anchorPlan(at origin: SIMD3<Float>) {
        anchored = true
        recording = true
        if let plan, let start = plan.stations.first {
            // gravityAndHeading: +x is east, -z is north. Stations are local
            // meters relative to the tapped start station.
            let stationsOpen = Array(plan.stations.dropLast())
            stationWorld = stationsOpen.map { s in
                origin + SIMD3<Float>(Float(s.x - start.x), 0, Float(-(s.y - start.y)))
            }
            footprintWorld = plan.footprint.map { p in
                origin + SIMD3<Float>(Float(p.x - start.x), 0, Float(-(p.y - start.y)))
            }
            placeRings()
            currentStation = 1 % max(stationWorld.count, 1)
            status = "Walk the lap. Step on each ring as you go."
        } else {
            status = "Recording. Walk a slow loop around the yard and finish where you started."
        }
    }

    private func placeRings() {
        guard let sceneAnchor else { return }
        ringEntities = stationWorld.enumerated().map { index, position in
            let isStart = index == 0
            let diameter: Float = isStart ? 1.0 : 0.7
            let mesh = MeshResource.generatePlane(width: diameter, depth: diameter,
                                                  cornerRadius: diameter / 2)
            let color = isStart ? UIColor.systemGreen : UIColor.systemTeal
            let material = UnlitMaterial(color: color.withAlphaComponent(0.7))
            let entity = ModelEntity(mesh: mesh, materials: [material])
            entity.position = position
            sceneAnchor.addChild(entity)
            return entity
        }
    }

    private func markStationDone(_ index: Int) {
        guard index < ringEntities.count else { return }
        let material = UnlitMaterial(color: UIColor.systemGray.withAlphaComponent(0.35))
        ringEntities[index].model?.materials = [material]
    }

    // MARK: ARSessionDelegate (main queue)

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        updateTrackingStatus(frame.camera.trackingState)
        if recording {
            recorder?.record(frame: frame)
        }
        let cameraPosition = frame.camera.transform.translationVector
        if recording {
            paintCoverage(under: cameraPosition)
        }
        guard anchored, !stationWorld.isEmpty else { return }
        updateWaypointProgress(cameraPosition)
        updateDistanceHint(cameraPosition)
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        status = "The camera session stopped. Go back and reopen capture."
    }

    private func updateTrackingStatus(_ state: ARCamera.TrackingState) {
        switch state {
        case .notAvailable:
            hint = "Tracking is not available yet."
        case .limited(.initializing):
            hint = "Hold still for a moment while tracking starts."
        case .limited(.excessiveMotion):
            hint = "Slow down a little."
        case .limited(.insufficientFeatures):
            hint = "Aim at textured ground, not blank surfaces."
        case .limited:
            hint = "Tracking is limited. Move slowly."
        case .normal:
            hint = nil
        }
    }

    private func paintCoverage(under cameraPosition: SIMD3<Float>) {
        if let last = lastPaintPosition {
            let dx = cameraPosition.x - last.x
            let dz = cameraPosition.z - last.z
            guard (dx * dx + dz * dz).squareRoot() >= paintSpacing else { return }
        }
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        guard let hit = arView.raycast(from: center, allowing: .estimatedPlane,
                                       alignment: .horizontal).first else { return }
        lastPaintPosition = cameraPosition
        guard let sceneAnchor else { return }
        let mesh = MeshResource.generatePlane(width: 0.8, depth: 0.8, cornerRadius: 0.4)
        let material = UnlitMaterial(color: UIColor.systemGreen.withAlphaComponent(0.3))
        let disc = ModelEntity(mesh: mesh, materials: [material])
        disc.position = hit.worldTransform.translationVector + SIMD3<Float>(0, 0.005, 0)
        sceneAnchor.addChild(disc)
    }

    private func updateWaypointProgress(_ cameraPosition: SIMD3<Float>) {
        guard !reachedStart else { return }
        let targetIndex = returningToStart ? 0 : currentStation
        guard targetIndex < stationWorld.count else { return }
        let target = stationWorld[targetIndex]
        let dx = cameraPosition.x - target.x
        let dz = cameraPosition.z - target.z
        let distance = (dx * dx + dz * dz).squareRoot()
        guard distance <= advanceRadius else { return }
        if returningToStart {
            reachedStart = true
            status = "You are back at your start marker. End the capture when you are ready."
            return
        }
        markStationDone(targetIndex)
        currentStation += 1
        if currentStation >= stationWorld.count {
            returningToStart = true
            status = "Last ring done. Return to your start marker."
        } else {
            status = "Ring \(currentStation) of \(stationTotal). Keep the house in view as you walk."
        }
    }

    private func updateDistanceHint(_ cameraPosition: SIMD3<Float>) {
        guard footprintWorld.count >= 2 else { return }
        var best = Float.greatestFiniteMagnitude
        let n = footprintWorld.count
        for i in 0..<n {
            let a = footprintWorld[i]
            let b = footprintWorld[(i + 1) % n]
            best = min(best, Self.horizontalDistance(from: cameraPosition, toSegment: a, b))
        }
        if best < tooCloseMeters {
            warning = "Too close to the house. Step back a little."
        } else if best > tooFarMeters {
            warning = "A little far from the house. Move in closer."
        } else {
            warning = nil
        }
    }

    static func horizontalDistance(from p: SIMD3<Float>, toSegment a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        let pa = SIMD2<Float>(p.x - a.x, p.z - a.z)
        let ab = SIMD2<Float>(b.x - a.x, b.z - a.z)
        let denom = simd_dot(ab, ab)
        guard denom > 1e-9 else { return simd_length(pa) }
        let t = simd_clamp(simd_dot(pa, ab) / denom, 0, 1)
        return simd_length(pa - ab * t)
    }
}
