import Foundation
import RealityKit
import UIKit
import simd

// World-anchored waypoint markers.
//
// These used to be flat discs lying on the ground, which meant the only way to
// see the guidance was to aim the phone at your own feet: exactly where the
// camera must not point, because reconstruction needs the yard, the fences and
// the house. A beacon is a 2 m vertical column standing at the station, so it
// is in frame while the phone is held up and aimed outward. The small ground
// ring stays, because standing precisely on the station still matters.
//
// MeshResource.generateCylinder is iOS 18, and this app targets iOS 17, so the
// column is built from crossed vertical planes: three blades at 60 degrees,
// double sided, which reads as a solid glowing post from any approach angle.

enum BeaconRole {
    /// The station the walker should head to next.
    case next
    /// A station not yet visited.
    case pending
    /// A station already stepped on.
    case done
    /// The start marker, which is also the finish.
    case home
}

final class WaypointBeacon {
    static let height: Float = 2.0
    static let bladeWidth: Float = 0.11
    static let baseDiameter: Float = 0.7
    static let homeBaseDiameter: Float = 1.0

    let root: Entity
    private let blades: [ModelEntity]
    private let base: ModelEntity
    private(set) var role: BeaconRole = .pending

    init(position: SIMD3<Float>, isHome: Bool) {
        let root = Entity()
        root.position = position
        self.root = root

        let diameter = isHome ? Self.homeBaseDiameter : Self.baseDiameter
        let baseMesh = MeshResource.generatePlane(width: diameter, depth: diameter,
                                                  cornerRadius: diameter / 2)
        let baseEntity = ModelEntity(mesh: baseMesh, materials: [Self.material(for: .pending)])
        baseEntity.position = SIMD3<Float>(0, 0.005, 0)
        root.addChild(baseEntity)
        base = baseEntity

        let bladeMesh = MeshResource.generatePlane(width: Self.bladeWidth,
                                                   height: Self.height,
                                                   cornerRadius: Self.bladeWidth / 2)
        // Six blades at 60 degrees, which is three physical planes each present
        // twice facing opposite ways. RealityKit's generated planes are single
        // sided and Material.faceCulling is iOS 18, so on iOS 17 the back of a
        // blade is simply not drawn: a beacon built from three would vanish as
        // the walker passed it. Coplanar pairs never z-fight because exactly one
        // of each pair survives back-face culling from any given viewpoint.
        var made: [ModelEntity] = []
        for i in 0..<6 {
            let blade = ModelEntity(mesh: bladeMesh, materials: [Self.material(for: .pending)])
            let yaw = Float(i) * .pi / 3
            blade.orientation = simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))
            // generatePlane centres the mesh, so lift it half its height to
            // stand the blade on the ground rather than bury half of it.
            blade.position = SIMD3<Float>(0, Self.height / 2, 0)
            root.addChild(blade)
            made.append(blade)
        }
        blades = made

        apply(role: isHome ? .home : .pending)
    }

    func apply(role: BeaconRole) {
        guard role != self.role else { return }
        self.role = role
        let material = Self.material(for: role)
        for blade in blades {
            blade.model?.materials = [material]
        }
        base.model?.materials = [Self.baseMaterial(for: role)]
        if role != .next {
            root.scale = SIMD3<Float>(repeating: 1)
        }
    }

    /// Slow breathing pulse so the next target reads at fifty feet. Driven from
    /// the session delegate rather than an animation controller: one property
    /// write per frame, no allocation, and it stops the moment the role changes.
    func pulse(atTime t: TimeInterval) {
        guard role == .next else { return }
        let s = 1.0 + 0.28 * Float(0.5 + 0.5 * sin(t * 3.0))
        root.scale = SIMD3<Float>(s, 1, s)
    }

    // Deliberately no green-for-good, amber-for-bad palette here: a beacon
    // being the next one is not a success or a warning, it is just the one
    // being pointed at. Amber and red stay reserved for actual problems.
    private static func color(for role: BeaconRole) -> UIColor {
        switch role {
        case .next: return .systemCyan
        case .pending: return .systemTeal
        case .done: return .systemGray
        case .home: return .systemIndigo
        }
    }

    private static func alpha(for role: BeaconRole) -> CGFloat {
        switch role {
        case .next: return 0.85
        case .pending: return 0.32
        case .done: return 0.16
        case .home: return 0.5
        }
    }

    private static func material(for role: BeaconRole) -> UnlitMaterial {
        UnlitMaterial(color: color(for: role).withAlphaComponent(alpha(for: role)))
    }

    private static func baseMaterial(for role: BeaconRole) -> UnlitMaterial {
        UnlitMaterial(color: color(for: role)
            .withAlphaComponent(min(alpha(for: role) + 0.15, 0.9)))
    }
}
