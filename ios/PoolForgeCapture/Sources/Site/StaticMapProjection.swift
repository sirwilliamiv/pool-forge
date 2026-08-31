import Foundation
import CoreGraphics

// Web-mercator math for drawing the footprint over a Google Static Maps image.
// The map's center, zoom and size are parsed straight out of the staticMapUrl
// the server returns, so the app never needs those fields on the wire.

struct StaticMapProjection {
    let centerLat: Double
    let centerLng: Double
    let zoom: Double
    let widthPt: Double
    let heightPt: Double

    init?(url: URL, fallbackCenter: LatLng? = nil) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = components.queryItems else { return nil }
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }
        var lat = fallbackCenter?.lat
        var lng = fallbackCenter?.lng
        // The proxy path writes `lat`/`lng`/`w`/`h`; Google's own URL writes
        // `center` and `size`. Both are accepted so a wire change on one side
        // degrades to the fallback center instead of a blank overlay.
        if let a = value("lat").flatMap(Double.init), let b = value("lng").flatMap(Double.init) {
            lat = a
            lng = b
        } else if let center = value("center") {
            let parts = center.split(separator: ",")
            if parts.count == 2, let a = Double(parts[0]), let b = Double(parts[1]) {
                lat = a
                lng = b
            }
        }
        guard let lat, let lng, let zoom = value("zoom").flatMap(Double.init) else { return nil }
        var w = value("w").flatMap(Double.init)
        var h = value("h").flatMap(Double.init)
        if w == nil || h == nil, let size = value("size") {
            let dims = size.lowercased().split(separator: "x")
            if dims.count == 2 {
                w = Double(dims[0])
                h = Double(dims[1])
            }
        }
        guard let w, let h, w > 0, h > 0 else { return nil }
        centerLat = lat
        centerLng = lng
        self.zoom = zoom
        widthPt = w
        heightPt = h
    }

    var aspectRatio: CGFloat { CGFloat(widthPt / heightPt) }

    private var worldPixels: Double { 256 * pow(2, zoom) }

    private func worldPoint(_ p: LatLng) -> (x: Double, y: Double) {
        let x = (p.lng + 180) / 360 * worldPixels
        let phi = p.lat * .pi / 180
        let clamped = min(max(sin(phi), -0.9999), 0.9999)
        let y = (0.5 - log((1 + clamped) / (1 - clamped)) / (4 * .pi)) * worldPixels
        return (x, y)
    }

    /// Screen point for a coordinate, given the size the map image is actually
    /// displayed at (aspect-fit of the size= parameter).
    func point(for coord: LatLng, displayedSize: CGSize) -> CGPoint {
        let scale = Double(displayedSize.width) / widthPt
        let c = worldPoint(LatLng(lat: centerLat, lng: centerLng))
        let p = worldPoint(coord)
        return CGPoint(x: Double(displayedSize.width) / 2 + (p.x - c.x) * scale,
                       y: Double(displayedSize.height) / 2 + (p.y - c.y) * scale)
    }

    /// Inverse of the screen mapping for drag nudges: how many degrees a pixel
    /// delta on screen moves the footprint.
    func latLngDelta(forScreenDelta delta: CGSize, atLat lat: Double, displayedSize: CGSize) -> (dLat: Double, dLng: Double) {
        let scale = Double(displayedSize.width) / widthPt
        guard scale > 0 else { return (0, 0) }
        let dWorldX = Double(delta.width) / scale
        let dWorldY = Double(delta.height) / scale
        let dLng = dWorldX * 360 / worldPixels
        let phi = lat * .pi / 180
        let dLat = -dWorldY * 360 / worldPixels * cos(phi)
        return (dLat, dLng)
    }
}
