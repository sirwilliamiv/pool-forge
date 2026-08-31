import Foundation
import ARKit
import RealityKit
import UIKit
import Combine
import simd

// Drives the AR walk: vertical waypoint beacons along the lap, coverage paint
// under the camera, distance hints against the footprint, a tilt gauge, spoken
// and haptic cues, and the return-to-start final leg. Capability gating is
// runtime-only; nothing here checks model strings.
//
// The guiding rule after the first field test: guidance must never compete with
// where the camera should point. The camera belongs aimed outward and slightly
// down at the yard, so world-anchored guidance stands up at eye level, angle
// feedback is a 2D HUD off to the side, and everything else is a sound or a
// buzz.

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

    @Published var status = "Hold the phone up and aim across the yard, tilted slightly down."
    @Published var hint: String?
    @Published var warning: String?       // amber: guidance corrections only
    @Published var anchored = false
    @Published var recording = false
    @Published var returningToStart = false
    @Published var reachedStart = false
    @Published var recordedFrames = 0
    @Published var recordedDepthFrames = 0
    @Published var currentStation = 0
    @Published var stationTotal = 0

    /// Degrees below horizontal, smoothed. Drives the on-screen gauge.
    @Published var tiltDownDegrees: Float = 0
    @Published var tiltState: GuidanceMath.TiltState = .inBand
    /// Where the next beacon is relative to where the camera faces.
    @Published var nextDirection: GuidanceMath.RelativeDirection?

    let feedback = CaptureFeedback()

    var voiceEnabled: Bool {
        get { feedback.voiceEnabled }
        set {
            feedback.voiceEnabled = newValue
            if !newValue { feedback.stop() }
        }
    }

    private var plan: LapPlan?
    private var recorder: FrameRecorder?
    private var stationWorld: [SIMD3<Float>] = []
    private var footprintWorld: [SIMD3<Float>] = []
    private var beacons: [WaypointBeacon] = []
    private var sceneAnchor: AnchorEntity?
    private var lastPaintPosition: SIMD3<Float>?

    private var smoothedTilt: Float?
    private var lastPublishedTilt: Float = .nan
    private var hudPublishThrottle = CueThrottle(interval: 1.0 / 12.0)

    private let advanceRadius: Float = 1.5
    private let paintSpacing: Float = 0.5
    private let tooCloseMeters: Float = 2.0
    private let tooFarMeters: Float = 4.5
    /// Do not chatter a direction cue while standing right on top of the target.
    private let directionCueMinMeters: Float = 2.5

    func start(plan: LapPlan?, recorder: FrameRecorder, voiceEnabled: Bool) {
        guard Self.arSupported else { return }
        self.plan = plan
        self.recorder = recorder
        feedback.voiceEnabled = voiceEnabled
        feedback.prepareHaptics()
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
            status = "Walk to where the first marker should stand, then tap the ground there."
        }
    }

    func stop() {
        feedback.stop()
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
            placeBeacons()
            currentStation = 1 % max(stationWorld.count, 1)
            refreshBeaconRoles()
            status = "Walk the lap. Keep the house and fences in frame, not the grass."
            feedback.lapStarted()
        } else {
            status = "Recording. Walk a slow loop around the yard and finish where you started."
        }
    }

    private func placeBeacons() {
        guard let sceneAnchor else { return }
        beacons = stationWorld.enumerated().map { index, position in
            let beacon = WaypointBeacon(position: position, isHome: index == 0)
            sceneAnchor.addChild(beacon.root)
            return beacon
        }
    }

    /// One beacon is the target, the visited ones fade back, the rest stay
    /// quiet. Recomputed rather than mutated so the state can never drift.
    private func refreshBeaconRoles() {
        let targetIndex = returningToStart ? 0 : currentStation
        for (index, beacon) in beacons.enumerated() {
            let role: BeaconRole
            if !reachedStart && index == targetIndex {
                role = .next
            } else if index == 0 {
                role = .home
            } else if index < currentStation {
                role = .done
            } else {
                role = .pending
            }
            beacon.apply(role: role)
        }
    }

    // MARK: ARSessionDelegate (main queue)

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        updateTrackingStatus(frame.camera.trackingState)
        if recording {
            recorder?.record(frame: frame)
        }
        let transform = frame.camera.transform
        let cameraPosition = transform.translationVector
        updateTilt(transform, at: frame.timestamp)
        if recording {
            paintCoverage(under: cameraPosition)
        }
        guard anchored, !stationWorld.isEmpty else { return }
        pulseTargetBeacon(at: frame.timestamp)
        updateNextDirection(transform)
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
            hint = "Aim at something with texture: a fence, a wall, planting."
        case .limited:
            hint = "Tracking is limited. Move slowly."
        case .normal:
            hint = nil
        }
    }

    /// Smoothed so the gauge does not jitter with every footfall, and published
    /// at about 12 Hz so SwiftUI is not asked to redraw sixty times a second.
    private func updateTilt(_ transform: simd_float4x4, at time: TimeInterval) {
        let raw = GuidanceMath.downTiltDegrees(transform)
        let smoothed: Float
        if let previous = smoothedTilt {
            smoothed = previous + (raw - previous) * 0.15
        } else {
            smoothed = raw
        }
        smoothedTilt = smoothed

        let state = GuidanceMath.tiltState(downTiltDegrees: smoothed)
        // Haptic and spoken correction only matter while actually capturing.
        if recording {
            feedback.updateTilt(state: state)
        }

        guard hudPublishThrottle.allow(at: time) else { return }
        if state != tiltState { tiltState = state }
        if !(abs(smoothed - lastPublishedTilt) < 0.25) {
            lastPublishedTilt = smoothed
            tiltDownDegrees = smoothed
        }
    }

    private func pulseTargetBeacon(at time: TimeInterval) {
        let targetIndex = returningToStart ? 0 : currentStation
        guard targetIndex < beacons.count else { return }
        beacons[targetIndex].pulse(atTime: time)
    }

    private func updateNextDirection(_ transform: simd_float4x4) {
        guard !reachedStart else {
            if nextDirection != nil { nextDirection = nil }
            return
        }
        let targetIndex = returningToStart ? 0 : currentStation
        guard targetIndex < stationWorld.count else { return }
        let target = stationWorld[targetIndex]
        guard let direction = GuidanceMath.relativeDirection(cameraTransform: transform,
                                                            to: target) else { return }
        if direction != nextDirection { nextDirection = direction }
        let distance = GuidanceMath.groundDistance(transform.translationVector, target)
        guard recording, distance > directionCueMinMeters else { return }
        feedback.announceDirection(direction)
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
        // Faint and neutral: the paint is a record of ground already seen, not
        // a thing to look at. Looking at it is the failure mode being fixed.
        let material = UnlitMaterial(color: UIColor.systemTeal.withAlphaComponent(0.22))
        let disc = ModelEntity(mesh: mesh, materials: [material])
        disc.position = hit.worldTransform.translationVector + SIMD3<Float>(0, 0.005, 0)
        sceneAnchor.addChild(disc)
    }

    private func updateWaypointProgress(_ cameraPosition: SIMD3<Float>) {
        guard !reachedStart else { return }
        let targetIndex = returningToStart ? 0 : currentStation
        guard targetIndex < stationWorld.count else { return }
        let target = stationWorld[targetIndex]
        let distance = GuidanceMath.groundDistance(cameraPosition, target)
        guard distance <= advanceRadius else { return }
        if returningToStart {
            reachedStart = true
            nextDirection = nil
            refreshBeaconRoles()
            status = "You are back at your start marker. End the capture when you are ready."
            feedback.captureComplete()
            return
        }
        currentStation += 1
        if currentStation >= stationWorld.count {
            returningToStart = true
            refreshBeaconRoles()
            status = "Last marker done. Head back to your start marker."
            feedback.returnLegStarted()
        } else {
            refreshBeaconRoles()
            status = "Marker \(currentStation) of \(stationTotal). Keep the house in view as you walk."
            feedback.waypointReached(remaining: stationWorld.count - currentStation)
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
