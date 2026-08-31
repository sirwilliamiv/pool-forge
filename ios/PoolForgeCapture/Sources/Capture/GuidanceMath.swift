import Foundation
import simd

// Pure guidance geometry and cue pacing. No ARKit, no UIKit, no RealityKit, so
// every rule here is unit tested off device. The capture controller feeds it
// raw ARKit camera transforms and consumes the answers verbatim.

enum GuidanceMath {
    /// The useful oblique band for terrain capture, as degrees BELOW horizontal.
    /// Field data: a real walk sat at a median of 31 degrees down and
    /// reconstructed well, but the tester had no way to know that was right.
    static let bandMinDegrees: Float = 20
    static let bandMaxDegrees: Float = 40

    /// Full sweep the on-screen gauge draws, in degrees below horizontal.
    static let gaugeMinDegrees: Float = 0
    static let gaugeMaxDegrees: Float = 60

    enum TiltState: Equatable {
        /// Pointing far enough down: in the band.
        case inBand
        /// Not tilted down enough (including pointing above horizontal).
        case tooShallow
        /// Tilted too far down, mostly seeing ground.
        case tooSteep

        var isInBand: Bool { self == .inBand }
    }

    enum RelativeDirection: String, Equatable {
        case ahead
        case left
        case right
        case behind

        var spoken: String {
            switch self {
            case .ahead: return "next marker ahead"
            case .left: return "next marker on your left"
            case .right: return "next marker on your right"
            case .behind: return "next marker behind you"
            }
        }

        var onScreen: String {
            switch self {
            case .ahead: return "Ahead"
            case .left: return "On your left"
            case .right: return "On your right"
            case .behind: return "Behind you"
            }
        }
    }

    /// The direction the camera looks: ARKit cameras look down their own -Z.
    /// With a column-major transform that is -(columns.2.xyz).
    static func viewDirection(_ m: simd_float4x4) -> SIMD3<Float> {
        SIMD3(-m.columns.2.x, -m.columns.2.y, -m.columns.2.z)
    }

    /// Camera elevation in degrees. Negative means looking below horizontal.
    static func elevationDegrees(_ m: simd_float4x4) -> Float {
        let v = viewDirection(m)
        let length = simd_length(v)
        guard length > 1e-6 else { return 0 }
        let sinE = max(-1, min(1, v.y / length))
        return asin(sinE) * 180 / .pi
    }

    /// How far below horizontal the camera points, in degrees. Positive is
    /// down, which is the direction the whole gauge is calibrated in.
    static func downTiltDegrees(_ m: simd_float4x4) -> Float {
        -elevationDegrees(m)
    }

    static func tiltState(downTiltDegrees d: Float) -> TiltState {
        if d < bandMinDegrees { return .tooShallow }
        if d > bandMaxDegrees { return .tooSteep }
        return .inBand
    }

    /// Short on-screen directive. Never green-vs-red: the in-band case is a
    /// calm statement, not a reward.
    static func tiltDirective(_ state: TiltState) -> String {
        switch state {
        case .inBand: return "Angle is good"
        case .tooShallow: return "Tilt down"
        case .tooSteep: return "Too low, raise the phone"
        }
    }

    /// Spoken form, kept under six words.
    static func tiltSpoken(_ state: TiltState) -> String? {
        switch state {
        case .inBand: return nil
        case .tooShallow: return "tilt the phone down"
        case .tooSteep: return "raise the phone up"
        }
    }

    /// Forward direction projected onto the ground plane (x east, z south in
    /// ARKit's gravityAndHeading frame). When the camera points almost straight
    /// down the view vector carries no usable yaw, so the camera's own up axis
    /// (columns.1) is used instead: it points where the top of the phone leans.
    static func groundForward(_ m: simd_float4x4) -> SIMD2<Float>? {
        let v = viewDirection(m)
        var flat = SIMD2<Float>(v.x, v.z)
        if simd_length(flat) < 0.05 {
            flat = SIMD2<Float>(m.columns.1.x, m.columns.1.z)
        }
        let length = simd_length(flat)
        guard length > 1e-5 else { return nil }
        return flat / length
    }

    /// Signed bearing from where the camera faces to a world target, in
    /// degrees. Positive is to the right, negative to the left.
    static func bearingDegrees(cameraTransform m: simd_float4x4,
                               to target: SIMD3<Float>) -> Float? {
        guard let forward = groundForward(m) else { return nil }
        let position = SIMD3<Float>(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        let toTarget = SIMD2<Float>(target.x - position.x, target.z - position.z)
        guard simd_length(toTarget) > 1e-4 else { return nil }
        let t = simd_normalize(toTarget)
        let dot = forward.x * t.x + forward.y * t.y
        let det = forward.x * t.y - forward.y * t.x
        return atan2(det, dot) * 180 / .pi
    }

    static func direction(fromBearingDegrees bearing: Float) -> RelativeDirection {
        let a = abs(bearing)
        if a <= 35 { return .ahead }
        if a >= 135 { return .behind }
        return bearing > 0 ? .right : .left
    }

    static func relativeDirection(cameraTransform m: simd_float4x4,
                                  to target: SIMD3<Float>) -> RelativeDirection? {
        guard let bearing = bearingDegrees(cameraTransform: m, to: target) else { return nil }
        return direction(fromBearingDegrees: bearing)
    }

    /// Horizontal distance, ignoring height. Walking is a 2D problem.
    static func groundDistance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        let dx = a.x - b.x
        let dz = a.z - b.z
        return (dx * dx + dz * dz).squareRoot()
    }
}

/// A cue that may fire at most once per `interval`, with an explicit clock so
/// the pacing is testable without waiting in real time.
struct CueThrottle {
    let interval: TimeInterval
    private var lastFired: TimeInterval?

    init(interval: TimeInterval) {
        self.interval = interval
    }

    /// Returns true and arms the cooldown, or false while still cooling down.
    mutating func allow(at now: TimeInterval) -> Bool {
        if let lastFired, now - lastFired < interval { return false }
        lastFired = now
        return true
    }

    mutating func reset() {
        lastFired = nil
    }
}

/// Tracks how long a condition has held continuously and fires at most one
/// alert per `repeatInterval` while it keeps holding. Used for the out-of-band
/// tilt buzz so it can never turn into a continuous rattle.
struct SustainedConditionAlarm {
    let holdSeconds: TimeInterval
    let repeatInterval: TimeInterval

    private var since: TimeInterval?
    private var throttle: CueThrottle

    init(holdSeconds: TimeInterval, repeatInterval: TimeInterval) {
        self.holdSeconds = holdSeconds
        self.repeatInterval = repeatInterval
        self.throttle = CueThrottle(interval: repeatInterval)
    }

    /// Feed the condition every frame. Returns true on the frames where an
    /// alert should fire.
    mutating func update(conditionHolds: Bool, at now: TimeInterval) -> Bool {
        guard conditionHolds else {
            since = nil
            throttle.reset()
            return false
        }
        guard let start = since else {
            since = now
            return false
        }
        guard now - start >= holdSeconds else { return false }
        return throttle.allow(at: now)
    }
}
