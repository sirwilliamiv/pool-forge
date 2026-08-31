import SwiftUI

// Satellite backdrop with the Solar footprint drawn over it. Drag nudges the
// footprint, pinch resizes it about its centroid; Confirm freezes it for the
// lap plan.

struct SiteConfirmView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var settings: AppSettings

    @State private var mapImage: UIImage?
    @State private var committedOffset = CGSize.zero
    @State private var liveOffset = CGSize.zero
    @State private var committedScale: CGFloat = 1
    @State private var liveScale: CGFloat = 1
    @State private var displayedSize = CGSize(width: 1, height: 1)

    var body: some View {
        VStack(spacing: 16) {
            if let place = model.place {
                mapArea(for: place)
                if place.footprintLatLng == nil {
                    Label("No building footprint was found for this address. Capture still works; the guided lap is skipped.",
                          systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(.horizontal)
                } else {
                    Text("Drag to nudge the footprint. Pinch to resize.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Text(place.address)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button {
                    confirm(place)
                } label: {
                    Text("Confirm site")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
            } else {
                ContentUnavailableView("No site selected", systemImage: "map")
            }
            Spacer(minLength: 0)
        }
        .navigationTitle("Confirm the site")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func projection(for place: PlaceDetails) -> StaticMapProjection? {
        place.staticMapUrl
            .flatMap(URL.init(string:))
            .flatMap { StaticMapProjection(url: $0, fallbackCenter: LatLng(lat: place.lat, lng: place.lng)) }
    }

    @ViewBuilder
    private func mapArea(for place: PlaceDetails) -> some View {
        let proj = projection(for: place)
        ZStack {
            // The map path is relative and behind the bearer, so the bytes come
            // through the API client rather than AsyncImage.
            if let mapImage {
                Image(uiImage: mapImage).resizable().scaledToFit()
            } else {
                Rectangle()
                    .fill(Color(.secondarySystemBackground))
                    .overlay(place.staticMapUrl == nil ? nil : ProgressView())
                    .task {
                        guard let path = place.staticMapUrl, let client = settings.client,
                              let data = try? await client.imageData(relativePath: path) else { return }
                        mapImage = UIImage(data: data)
                    }
            }
            if let proj {
                footprintCanvas(projection: proj)
            }
        }
        .aspectRatio(proj?.aspectRatio ?? 1, contentMode: .fit)
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { displayedSize = geo.size }
                    .onChange(of: geo.size) { _, newSize in displayedSize = newSize }
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .gesture(dragGesture)
        .simultaneousGesture(pinchGesture)
    }

    private func footprintCanvas(projection: StaticMapProjection) -> some View {
        Canvas { context, size in
            let footprint = nudgedFootprint(projection: projection, displayedSize: size)
            guard footprint.count >= 3 else { return }
            var path = Path()
            let points = footprint.map { projection.point(for: $0, displayedSize: size) }
            path.addLines(points)
            path.closeSubpath()
            context.fill(path, with: .color(.blue.opacity(0.25)))
            context.stroke(path, with: .color(.blue), lineWidth: 2)
        }
        .allowsHitTesting(false)
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                liveOffset = value.translation
            }
            .onEnded { value in
                committedOffset.width += value.translation.width
                committedOffset.height += value.translation.height
                liveOffset = .zero
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                liveScale = value
            }
            .onEnded { value in
                committedScale = max(0.5, min(2.0, committedScale * value))
                liveScale = 1
            }
    }

    /// The base footprint with the current pinch scale (about the centroid) and
    /// drag offset applied, in lat/lng.
    private func nudgedFootprint(projection: StaticMapProjection, displayedSize: CGSize) -> [LatLng] {
        guard let base = model.place?.footprintLatLng else { return [] }
        let scale = Double(max(0.5, min(2.0, committedScale * liveScale)))
        let count = Double(base.count)
        let centroidLat = base.reduce(0.0) { $0 + $1.lat } / count
        let centroidLng = base.reduce(0.0) { $0 + $1.lng } / count
        let totalOffset = CGSize(width: committedOffset.width + liveOffset.width,
                                 height: committedOffset.height + liveOffset.height)
        let delta = projection.latLngDelta(forScreenDelta: totalOffset,
                                           atLat: centroidLat, displayedSize: displayedSize)
        return base.map { p in
            LatLng(lat: centroidLat + (p.lat - centroidLat) * scale + delta.dLat,
                   lng: centroidLng + (p.lng - centroidLng) * scale + delta.dLng)
        }
    }

    private func confirm(_ place: PlaceDetails) {
        let footprint: [LatLng]?
        if let proj = projection(for: place), place.footprintLatLng != nil {
            let nudged = nudgedFootprint(projection: proj, displayedSize: displayedSize)
            footprint = nudged.count >= 3 ? nudged : nil
        } else {
            footprint = place.footprintLatLng
        }
        model.confirmedFootprint = footprint
        model.lapPlan = footprint.flatMap { LapPlanner.plan(footprint: $0) }
        if model.lapPlan != nil {
            model.path.append(.lapPreview)
        } else {
            model.path.append(.capture)
        }
    }
}
