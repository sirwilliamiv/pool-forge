import XCTest
@testable import PoolForgeCapture

final class LapPlannerTests: XCTestCase {
    private let origin = LatLng(lat: 33.1, lng: -96.8)

    /// Builds a lat/lng polygon from local meter coordinates around a fixed
    /// origin, using the same equirectangular constants as the planner.
    private func latLngPolygon(fromMeters points: [(Double, Double)]) -> [LatLng] {
        let metersPerDegLat = 111_132.0
        let metersPerDegLng = 111_320.0 * cos(origin.lat * .pi / 180)
        return points.map {
            LatLng(lat: origin.lat + $0.1 / metersPerDegLat,
                   lng: origin.lng + $0.0 / metersPerDegLng)
        }
    }

    private var square: [LatLng] {
        latLngPolygon(fromMeters: [(0, 0), (20, 0), (20, 20), (0, 20)])
    }

    private var lShape: [LatLng] {
        latLngPolygon(fromMeters: [(0, 0), (20, 0), (20, 10), (10, 10), (10, 20), (0, 20)])
    }

    /// 30 m square with a 6 m wide, 8 m deep notch cut into the top edge.
    private var notched: [LatLng] {
        latLngPolygon(fromMeters: [
            (0, 0), (30, 0), (30, 30), (18, 30), (18, 22), (12, 22), (12, 30), (0, 30),
        ])
    }

    // MARK: shapes

    func testSquareOffsetCorners() throws {
        let plan = try XCTUnwrap(LapPlanner.plan(footprint: square))
        XCTAssertEqual(plan.offsetPolygon.count, 4)
        // Every offset corner sits exactly standoff * sqrt(2) from its source
        // corner (mitered right angle).
        let expected = LapPlanner.standoffMeters * 2.0.squareRoot()
        for (corner, offset) in zip(plan.footprint, plan.offsetPolygon) {
            XCTAssertEqual(corner.distance(to: offset), expected, accuracy: 0.02)
        }
        // Offset square edges are 20 + 2 * 2.7 = 25.4 m.
        for i in 0..<4 {
            let a = plan.offsetPolygon[i]
            let b = plan.offsetPolygon[(i + 1) % 4]
            XCTAssertEqual(a.distance(to: b), 25.4, accuracy: 0.05)
        }
    }

    func testSquareStationSpacing() throws {
        let plan = try XCTUnwrap(LapPlanner.plan(footprint: square))
        // 25.4 m edges need ceil(25.4 / 8) = 4 segments: 3 mid stations each.
        XCTAssertEqual(plan.stations.count, 4 * 4 + 1)
        for i in 0..<(plan.stations.count - 1) {
            let gap = plan.stations[i].distance(to: plan.stations[i + 1])
            XCTAssertLessThanOrEqual(gap, LapPlanner.maxGapMeters + 1e-9)
        }
    }

    func testLShapeConcaveCornerStaysClear() throws {
        let plan = try XCTUnwrap(LapPlanner.plan(footprint: lShape))
        XCTAssertEqual(plan.offsetPolygon.count, 6)
        // The concave corner at meters (10, 10) offsets into the notch to
        // roughly (12.7, 12.7). Express both in the plan's centroid frame.
        let expected = plan.frame.toLocal(latLngPolygon(fromMeters: [(12.7, 12.7)])[0])
        let concaveOffset = plan.offsetPolygon.min { a, b in
            a.distance(to: expected) < b.distance(to: expected)
        }
        let found = try XCTUnwrap(concaveOffset)
        XCTAssertEqual(found.x, expected.x, accuracy: 0.05)
        XCTAssertEqual(found.y, expected.y, accuracy: 0.05)
    }

    func testNotchedFootprintProducesLap() throws {
        let plan = try XCTUnwrap(LapPlanner.plan(footprint: notched))
        XCTAssertEqual(plan.offsetPolygon.count, 8)
        XCTAssertGreaterThan(plan.stations.count, 8)
    }

    // MARK: properties

    func testEveryStationKeepsStandoffFromEveryFootprintEdge() throws {
        for footprint in [square, lShape, notched] {
            let plan = try XCTUnwrap(LapPlanner.plan(footprint: footprint))
            for station in plan.stations {
                let d = LapPlanner.distanceToPolygonEdges(station, polygon: plan.footprint)
                XCTAssertGreaterThanOrEqual(d, 2.5,
                    "station \(station) is \(d) m from the footprint")
            }
        }
    }

    func testLapIsClosed() throws {
        for footprint in [square, lShape, notched] {
            let plan = try XCTUnwrap(LapPlanner.plan(footprint: footprint))
            let first = try XCTUnwrap(plan.stations.first)
            let last = try XCTUnwrap(plan.stations.last)
            XCTAssertEqual(first.distance(to: last), 0, accuracy: 1e-9)
            XCTAssertGreaterThan(plan.stations.count, 3)
        }
    }

    func testDeterministic() throws {
        let a = try XCTUnwrap(LapPlanner.plan(footprint: notched))
        let b = try XCTUnwrap(LapPlanner.plan(footprint: notched))
        XCTAssertEqual(a, b)
    }

    func testWindingDirectionDoesNotMatter() throws {
        let cw = Array(square.reversed())
        let a = try XCTUnwrap(LapPlanner.plan(footprint: square))
        let b = try XCTUnwrap(LapPlanner.plan(footprint: cw))
        XCTAssertEqual(a.stations.count, b.stations.count)
        for station in b.stations {
            let d = LapPlanner.distanceToPolygonEdges(station, polygon: b.footprint)
            XCTAssertGreaterThanOrEqual(d, 2.5)
        }
    }

    func testDegeneratePolygonsRejected() {
        XCTAssertNil(LapPlanner.plan(footprint: []))
        XCTAssertNil(LapPlanner.plan(footprint: Array(square.prefix(2))))
    }

    func testLocalFrameRoundTrip() {
        let frame = LocalFrame(centroidOf: square)
        for p in square {
            let back = frame.toLatLng(frame.toLocal(p))
            XCTAssertEqual(back.lat, p.lat, accuracy: 1e-9)
            XCTAssertEqual(back.lng, p.lng, accuracy: 1e-9)
        }
    }
}
