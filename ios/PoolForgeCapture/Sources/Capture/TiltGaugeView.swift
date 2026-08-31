import SwiftUI

// A 2D HUD, deliberately not world anchored: the whole point is that it stays
// glanceable while the camera is aimed at the yard. It lives on the trailing
// edge so the middle of the viewfinder, which is what the walker is actually
// composing, stays clear.
//
// The scale is degrees below horizontal. The marked band is 20 to 40, which is
// the oblique range that reconstructs terrain well. In band it is neutral and
// quiet; out of band it goes amber, because that is a real correction to make.

struct TiltGaugeView: View {
    let downTiltDegrees: Float
    let state: GuidanceMath.TiltState

    private let trackHeight: CGFloat = 190
    private let trackWidth: CGFloat = 8

    private var isOutOfBand: Bool { !state.isInBand }

    private var accent: Color { isOutOfBand ? .orange : .primary }

    private func offset(forDegrees d: Float) -> CGFloat {
        let span = GuidanceMath.gaugeMaxDegrees - GuidanceMath.gaugeMinDegrees
        let clamped = min(max(d, GuidanceMath.gaugeMinDegrees), GuidanceMath.gaugeMaxDegrees)
        let t = CGFloat((clamped - GuidanceMath.gaugeMinDegrees) / span)
        return t * trackHeight
    }

    private var bandTop: CGFloat { offset(forDegrees: GuidanceMath.bandMinDegrees) }
    private var bandHeight: CGFloat {
        offset(forDegrees: GuidanceMath.bandMaxDegrees) - bandTop
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            HStack(alignment: .top, spacing: 6) {
                VStack(alignment: .trailing, spacing: 0) {
                    Spacer().frame(height: max(bandTop - 7, 0))
                    Text("20")
                    Spacer().frame(height: max(bandHeight - 14, 0))
                    Text("40")
                    Spacer(minLength: 0)
                }
                .font(.system(size: 10, weight: .medium).monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(height: trackHeight)

                ZStack(alignment: .top) {
                    Capsule()
                        .fill(.quaternary)
                        .frame(width: trackWidth, height: trackHeight)

                    Capsule()
                        .fill(.tertiary)
                        .frame(width: trackWidth, height: bandHeight)
                        .offset(y: bandTop)

                    Capsule()
                        .fill(accent)
                        .frame(width: 26, height: 3)
                        .offset(y: offset(forDegrees: downTiltDegrees) - 1.5)
                        .animation(.easeOut(duration: 0.12), value: downTiltDegrees)
                }
                .frame(width: 26, height: trackHeight, alignment: .top)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Int(downTiltDegrees.rounded()))\u{00B0}")
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(accent)
                Text(GuidanceMath.tiltDirective(state))
                    .font(.caption2.weight(isOutOfBand ? .semibold : .regular))
                    .foregroundStyle(isOutOfBand ? Color.orange : Color.secondary)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Camera tilt")
        .accessibilityValue("\(Int(downTiltDegrees.rounded())) degrees below horizontal. "
                            + GuidanceMath.tiltDirective(state))
    }
}
