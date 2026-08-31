import SwiftUI

// 2D preview of the walk before AR starts: footprint, offset lap, stations,
// start marker. Pure drawing over LapPlan; no ARKit here.

struct LapPreviewView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 16) {
            if let plan = model.lapPlan {
                Canvas { context, size in
                    draw(plan: plan, in: context, size: size)
                }
                .aspectRatio(1, contentMode: .fit)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 6) {
                    Label("Stand about 9 ft off the walls and step on each ring.", systemImage: "figure.walk")
                    Label("\(max(plan.stations.count - 1, 0)) stations, ending back at the start.", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)

                Button {
                    model.path.append(.capture)
                } label: {
                    Text("Start capture")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
            } else {
                ContentUnavailableView("No lap plan", systemImage: "map")
            }
            Spacer(minLength: 0)
        }
        .navigationTitle("The lap")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func draw(plan: LapPlan, in context: GraphicsContext, size: CGSize) {
        let all = plan.footprint + plan.offsetPolygon + plan.stations
        guard !all.isEmpty else { return }
        let minX = all.map(\.x).min() ?? 0
        let maxX = all.map(\.x).max() ?? 1
        let minY = all.map(\.y).min() ?? 0
        let maxY = all.map(\.y).max() ?? 1
        let spanX = max(maxX - minX, 1e-6)
        let spanY = max(maxY - minY, 1e-6)
        let pad = 24.0
        let scale = min((size.width - 2 * pad) / spanX, (size.height - 2 * pad) / spanY)

        func toScreen(_ p: LocalPoint) -> CGPoint {
            CGPoint(x: pad + (p.x - minX) * scale + (size.width - 2 * pad - spanX * scale) / 2,
                    y: size.height - pad - (p.y - minY) * scale - (size.height - 2 * pad - spanY * scale) / 2)
        }

        var footprintPath = Path()
        footprintPath.addLines(plan.footprint.map(toScreen))
        footprintPath.closeSubpath()
        context.fill(footprintPath, with: .color(.blue.opacity(0.2)))
        context.stroke(footprintPath, with: .color(.blue), lineWidth: 2)

        var lapPath = Path()
        lapPath.addLines(plan.stations.map(toScreen))
        context.stroke(lapPath, with: .color(.green),
                       style: StrokeStyle(lineWidth: 2, dash: [6, 4]))

        for (index, station) in plan.stations.dropLast().enumerated() {
            let point = toScreen(station)
            let radius: CGFloat = index == 0 ? 7 : 4
            let rect = CGRect(x: point.x - radius, y: point.y - radius,
                              width: radius * 2, height: radius * 2)
            let color: Color = index == 0 ? .green : .teal
            context.fill(Path(ellipseIn: rect), with: .color(color))
        }
    }
}
