import Foundation

// Pure Swift lap planner. No ARKit, no UIKit. Everything here is deterministic
// and unit tested; the capture screen consumes the output verbatim.

struct LatLng: Codable, Hashable {
    var lat: Double
    var lng: Double

    init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// Local tangent-plane point, meters. x is east, y is north.
struct LocalPoint: Codable, Hashable {
    var x: Double
    var y: Double

    init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

func + (a: LocalPoint, b: LocalPoint) -> LocalPoint { LocalPoint(x: a.x + b.x, y: a.y + b.y) }
func - (a: LocalPoint, b: LocalPoint) -> LocalPoint { LocalPoint(x: a.x - b.x, y: a.y - b.y) }
func * (a: LocalPoint, s: Double) -> LocalPoint { LocalPoint(x: a.x * s, y: a.y * s) }

extension LocalPoint {
    var length: Double { (x * x + y * y).squareRoot() }

    var normalized: LocalPoint {
        let l = length
        guard l > 1e-12 else { return LocalPoint(x: 0, y: 0) }
        return LocalPoint(x: x / l, y: y / l)
    }

    func dot(_ o: LocalPoint) -> Double { x * o.x + y * o.y }

    func distance(to o: LocalPoint) -> Double { (self - o).length }
}

/// Equirectangular projection around the footprint centroid. Good to
/// millimeters at backyard scale, and trivially invertible.
struct LocalFrame: Codable, Hashable {
    let origin: LatLng
    let metersPerDegreeLat: Double
    let metersPerDegreeLng: Double

    init(centroidOf points: [LatLng]) {
        let count = Double(max(points.count, 1))
        let lat0 = points.reduce(0.0) { $0 + $1.lat } / count
        let lng0 = points.reduce(0.0) { $0 + $1.lng } / count
        origin = LatLng(lat: lat0, lng: lng0)
        metersPerDegreeLat = 111_132.0
        metersPerDegreeLng = 111_320.0 * cos(lat0 * .pi / 180)
    }

    func toLocal(_ p: LatLng) -> LocalPoint {
        LocalPoint(x: (p.lng - origin.lng) * metersPerDegreeLng,
                   y: (p.lat - origin.lat) * metersPerDegreeLat)
    }

    func toLatLng(_ p: LocalPoint) -> LatLng {
        LatLng(lat: origin.lat + p.y / metersPerDegreeLat,
               lng: origin.lng + p.x / metersPerDegreeLng)
    }
}

struct LapPlan: Codable, Hashable {
    let frame: LocalFrame
    /// Footprint in local meters, counter-clockwise.
    let footprint: [LocalPoint]
    /// Footprint offset outward by the standoff distance.
    let offsetPolygon: [LocalPoint]
    /// Ordered waypoint stations. Closed: the last element equals the first.
    let stations: [LocalPoint]
}

enum LapPlanner {
    /// How far off the building surfaces the walker should stand (about 9 ft).
    static let standoffMeters = 2.7
    /// No two consecutive stations further apart than this.
    static let maxGapMeters = 8.0
    /// Miter length clamp, as a multiple of the standoff.
    static let miterLimitFactor = 3.0

    static func plan(footprint latLngFootprint: [LatLng]) -> LapPlan? {
        guard latLngFootprint.count >= 3 else { return nil }
        let frame = LocalFrame(centroidOf: latLngFootprint)
        var local = latLngFootprint.map { frame.toLocal($0) }
        // Drop a duplicated closing vertex if the source polygon carries one.
        if let first = local.first, let last = local.last,
           local.count > 3, first.distance(to: last) < 1e-9 {
            local.removeLast()
        }
        guard local.count >= 3 else { return nil }
        let ccw = signedArea(local) >= 0 ? local : local.reversed()
        let offsetPoly = offset(polygon: ccw, by: standoffMeters)
        guard offsetPoly.count >= 3 else { return nil }
        let lap = stations(alongClosed: offsetPoly, maxGap: maxGapMeters)
        return LapPlan(frame: frame, footprint: ccw, offsetPolygon: offsetPoly, stations: lap)
    }

    /// Offsets a counter-clockwise polygon outward by `d` meters with mitered
    /// corners. Concave (reflex) vertices fall out of the same miter formula;
    /// near-degenerate spikes are clamped to `miterLimitFactor * d`.
    static func offset(polygon: [LocalPoint], by d: Double) -> [LocalPoint] {
        let n = polygon.count
        guard n >= 3 else { return polygon }
        var out: [LocalPoint] = []
        out.reserveCapacity(n)
        for i in 0..<n {
            let prev = polygon[(i + n - 1) % n]
            let v = polygon[i]
            let next = polygon[(i + 1) % n]
            let d1 = (v - prev).normalized
            let d2 = (next - v).normalized
            // Outward normal of a CCW polygon edge is to the right of travel.
            let n1 = LocalPoint(x: d1.y, y: -d1.x)
            let n2 = LocalPoint(x: d2.y, y: -d2.x)
            let denom = 1 + n1.dot(n2)
            var miter: LocalPoint
            if denom < 1e-9 {
                // Edges double back on themselves; fall back to one normal.
                miter = n1 * d
            } else {
                miter = (n1 + n2) * (d / denom)
                let maxLen = d * miterLimitFactor
                if miter.length > maxLen {
                    miter = miter.normalized * maxLen
                }
            }
            out.append(v + miter)
        }
        return out
    }

    /// Places stations at every vertex of the closed polygon plus evenly spaced
    /// mid-span stations so no gap along the lap exceeds `maxGap`. The result
    /// is closed: the first station is appended again at the end.
    static func stations(alongClosed polygon: [LocalPoint], maxGap: Double) -> [LocalPoint] {
        let n = polygon.count
        guard n >= 2, maxGap > 0 else { return polygon }
        var out: [LocalPoint] = []
        for i in 0..<n {
            let a = polygon[i]
            let b = polygon[(i + 1) % n]
            out.append(a)
            let len = a.distance(to: b)
            let segments = max(1, Int(ceil(len / maxGap)))
            if segments > 1 {
                for k in 1..<segments {
                    let t = Double(k) / Double(segments)
                    out.append(a + (b - a) * t)
                }
            }
        }
        if let first = out.first {
            out.append(first)
        }
        return out
    }

    static func signedArea(_ poly: [LocalPoint]) -> Double {
        let n = poly.count
        guard n >= 3 else { return 0 }
        var sum = 0.0
        for i in 0..<n {
            let a = poly[i]
            let b = poly[(i + 1) % n]
            sum += a.x * b.y - b.x * a.y
        }
        return sum / 2
    }

    static func distance(from p: LocalPoint, toSegment a: LocalPoint, _ b: LocalPoint) -> Double {
        let ab = b - a
        let denom = ab.dot(ab)
        guard denom > 1e-12 else { return p.distance(to: a) }
        let t = min(1, max(0, (p - a).dot(ab) / denom))
        return p.distance(to: a + ab * t)
    }

    static func distanceToPolygonEdges(_ p: LocalPoint, polygon: [LocalPoint]) -> Double {
        let n = polygon.count
        guard n >= 2 else { return .infinity }
        var best = Double.infinity
        for i in 0..<n {
            best = min(best, distance(from: p, toSegment: polygon[i], polygon[(i + 1) % n]))
        }
        return best
    }
}
