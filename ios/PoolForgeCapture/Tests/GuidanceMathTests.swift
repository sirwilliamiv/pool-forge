import XCTest
import simd
@testable import PoolForgeCapture

final class GuidanceMathTests: XCTestCase {
    /// Builds a camera transform looking along `forward` from `position`.
    /// ARKit cameras look down -Z, so columns.2 is -forward.
    private func camera(at position: SIMD3<Float>, looking forward: SIMD3<Float>) -> simd_float4x4 {
        let f = simd_normalize(forward)
        let worldUp = abs(f.y) > 0.999 ? SIMD3<Float>(0, 0, 1) : SIMD3<Float>(0, 1, 0)
        let right = simd_normalize(simd_cross(f, worldUp))
        let up = simd_cross(right, f)
        return simd_float4x4(
            SIMD4<Float>(right, 0),
            SIMD4<Float>(up, 0),
            SIMD4<Float>(-f, 0),
            SIMD4<Float>(position, 1)
        )
    }

    // MARK: elevation and tilt band

    func testLevelCameraIsZeroTilt() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, 0, -1))
        XCTAssertEqual(GuidanceMath.elevationDegrees(m), 0, accuracy: 0.001)
        XCTAssertEqual(GuidanceMath.downTiltDegrees(m), 0, accuracy: 0.001)
    }

    func testLookingDownIsPositiveDownTilt() {
        // 30 degrees below horizontal, facing north.
        let a: Float = 30 * .pi / 180
        let m = camera(at: .zero, looking: SIMD3<Float>(0, -sin(a), -cos(a)))
        XCTAssertEqual(GuidanceMath.downTiltDegrees(m), 30, accuracy: 0.01)
        XCTAssertEqual(GuidanceMath.elevationDegrees(m), -30, accuracy: 0.01)
    }

    func testLookingUpIsNegativeDownTilt() {
        let a: Float = 15 * .pi / 180
        let m = camera(at: .zero, looking: SIMD3<Float>(0, sin(a), -cos(a)))
        XCTAssertEqual(GuidanceMath.downTiltDegrees(m), -15, accuracy: 0.01)
    }

    func testStraightDownIsNinetyDegrees() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, -1, 0))
        XCTAssertEqual(GuidanceMath.downTiltDegrees(m), 90, accuracy: 0.01)
    }

    /// The real field capture sat at a median of -31 degrees elevation, which
    /// the band must call good; the whole point of the gauge is telling the
    /// walker that, instead of leaving them guessing.
    func testFieldCaptureMedianIsInBand() {
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: 31), .inBand)
    }

    func testTiltBandBoundaries() {
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: 19.9), .tooShallow)
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: 20), .inBand)
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: 40), .inBand)
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: 40.1), .tooSteep)
        XCTAssertEqual(GuidanceMath.tiltState(downTiltDegrees: -10), .tooShallow)
    }

    func testDirectivesAreNotStateColoured() {
        // In band gets a calm statement, never a congratulation.
        XCTAssertEqual(GuidanceMath.tiltDirective(.inBand), "Angle is good")
        XCTAssertNil(GuidanceMath.tiltSpoken(.inBand))
        XCTAssertNotNil(GuidanceMath.tiltSpoken(.tooShallow))
        XCTAssertNotNil(GuidanceMath.tiltSpoken(.tooSteep))
    }

    // MARK: relative direction
    // ARKit gravityAndHeading: +x east, -z north, +y up.

    func testTargetAheadWhenFacingIt() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, 0, -1))   // north
        let target = SIMD3<Float>(0, 0, -10)                          // north
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m, to: target), .ahead)
    }

    func testTargetToTheRight() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, 0, -1))   // facing north
        let target = SIMD3<Float>(10, 0, 0)                           // due east
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m, to: target), .right)
        let bearing = GuidanceMath.bearingDegrees(cameraTransform: m, to: target)
        XCTAssertEqual(try XCTUnwrap(bearing), 90, accuracy: 0.01)
    }

    func testTargetToTheLeft() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, 0, -1))   // facing north
        let target = SIMD3<Float>(-10, 0, 0)                          // due west
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m, to: target), .left)
    }

    func testTargetBehind() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, 0, -1))
        let target = SIMD3<Float>(0, 0, 10)                           // due south
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m, to: target), .behind)
    }

    func testDirectionIgnoresHeight() {
        let m = camera(at: SIMD3<Float>(0, 1.5, 0), looking: SIMD3<Float>(0, 0, -1))
        let target = SIMD3<Float>(10, -1.5, 0)
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m, to: target), .right)
    }

    /// A steeply tilted camera still has usable yaw; only a truly vertical one
    /// needs the up-axis fallback, and it must not return nil there.
    func testSteepDownTiltStillResolvesDirection() {
        let a: Float = 70 * .pi / 180
        let m = camera(at: .zero, looking: SIMD3<Float>(0, -sin(a), -cos(a)))
        XCTAssertEqual(GuidanceMath.relativeDirection(cameraTransform: m,
                                                      to: SIMD3<Float>(10, 0, 0)), .right)
    }

    func testStraightDownFallsBackToCameraUpAxis() {
        let m = camera(at: .zero, looking: SIMD3<Float>(0, -1, 0))
        let direction = GuidanceMath.relativeDirection(cameraTransform: m,
                                                       to: SIMD3<Float>(0, 0, -10))
        XCTAssertNotNil(direction)
    }

    func testTargetUnderfootHasNoDirection() {
        let m = camera(at: SIMD3<Float>(1, 1.5, 2), looking: SIMD3<Float>(0, 0, -1))
        XCTAssertNil(GuidanceMath.relativeDirection(cameraTransform: m,
                                                    to: SIMD3<Float>(1, 0, 2)))
    }

    func testBearingBuckets() {
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: 0), .ahead)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: 34), .ahead)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: 36), .right)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: -36), .left)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: 134), .right)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: 136), .behind)
        XCTAssertEqual(GuidanceMath.direction(fromBearingDegrees: -180), .behind)
    }

    func testGroundDistanceIgnoresHeight() {
        let a = SIMD3<Float>(0, 1.6, 0)
        let b = SIMD3<Float>(3, -4, 4)
        XCTAssertEqual(GuidanceMath.groundDistance(a, b), 5, accuracy: 0.001)
    }

    // MARK: cue pacing

    func testCueThrottleBlocksInsideTheInterval() {
        var throttle = CueThrottle(interval: 5)
        XCTAssertTrue(throttle.allow(at: 100))
        XCTAssertFalse(throttle.allow(at: 101))
        XCTAssertFalse(throttle.allow(at: 104.9))
        XCTAssertTrue(throttle.allow(at: 105))
        XCTAssertFalse(throttle.allow(at: 109))
    }

    func testCueThrottleResetAllowsImmediately() {
        var throttle = CueThrottle(interval: 5)
        XCTAssertTrue(throttle.allow(at: 100))
        throttle.reset()
        XCTAssertTrue(throttle.allow(at: 100.1))
    }

    func testSustainedAlarmNeedsTheHoldWindow() {
        var alarm = SustainedConditionAlarm(holdSeconds: 3, repeatInterval: 5)
        XCTAssertFalse(alarm.update(conditionHolds: true, at: 0))
        XCTAssertFalse(alarm.update(conditionHolds: true, at: 1))
        XCTAssertFalse(alarm.update(conditionHolds: true, at: 2.9))
        XCTAssertTrue(alarm.update(conditionHolds: true, at: 3))
    }

    func testSustainedAlarmCannotBuzzContinuously() {
        var alarm = SustainedConditionAlarm(holdSeconds: 3, repeatInterval: 5)
        _ = alarm.update(conditionHolds: true, at: 0)
        XCTAssertTrue(alarm.update(conditionHolds: true, at: 3))
        // Sixty frames a second of the same bad tilt must stay silent.
        for i in 1...120 {
            let t = 3 + Double(i) / 60.0
            guard t < 8 else { break }
            XCTAssertFalse(alarm.update(conditionHolds: true, at: t))
        }
        XCTAssertTrue(alarm.update(conditionHolds: true, at: 8))
    }

    func testSustainedAlarmRearmsAfterTheConditionClears() {
        var alarm = SustainedConditionAlarm(holdSeconds: 3, repeatInterval: 5)
        _ = alarm.update(conditionHolds: true, at: 0)
        XCTAssertTrue(alarm.update(conditionHolds: true, at: 3))
        XCTAssertFalse(alarm.update(conditionHolds: false, at: 4))
        // Back out of band: the hold window starts over, no instant buzz.
        XCTAssertFalse(alarm.update(conditionHolds: true, at: 5))
        XCTAssertFalse(alarm.update(conditionHolds: true, at: 7))
        XCTAssertTrue(alarm.update(conditionHolds: true, at: 8))
    }
}
