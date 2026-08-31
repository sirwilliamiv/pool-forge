import Foundation

// Codable mirrors of the wire shapes in docs/backyard-capture-contract.md.
// The Zod schemas in src/modules/capture-bundle/contract.ts are the arbiter;
// these decode exactly what the routes send, nothing speculative.

struct PlaceSuggestion: Codable, Identifiable, Hashable {
    let placeId: String
    let description: String
    var id: String { placeId }
}

/// `GET /api/mobile/site/autocomplete` answers `{ suggestions: [...] }`.
struct AutocompleteResponse: Codable {
    let suggestions: [PlaceSuggestion]
}

/// One vertex as the site routes write it: an object, not a pair.
struct LatLngDTO: Codable, Hashable {
    let lat: Double
    let lng: Double
}

/// `GET /api/mobile/site/place` answers `{ ok, location, footprint, staticMapUrl }`.
struct PlaceResponse: Codable {
    struct Location: Codable {
        let lat: Double
        let lng: Double
        let formattedAddress: String
    }

    let ok: Bool
    let location: Location
    let footprint: [LatLngDTO]?
    /// Relative path to `/api/mobile/site/staticmap`; fetched with the bearer.
    let staticMapUrl: String?
}

/// `GET /api/mobile/site/reverse` answers `{ ok, address }`, address nullable:
/// standing somewhere without a street address is not an error.
struct ReverseResponse: Codable {
    struct Address: Codable {
        let formattedAddress: String
        let placeId: String
        let lat: Double
        let lng: Double
    }

    let ok: Bool
    let address: Address?
}

/// What the rest of the app consumes, assembled from the responses above.
struct PlaceDetails: Hashable {
    let address: String
    let placeId: String?
    let lat: Double
    let lng: Double
    let footprint: [LatLng]?
    /// Relative path to the authenticated static map proxy.
    let staticMapUrl: String?

    var footprintLatLng: [LatLng]? {
        guard let footprint, footprint.count >= 3 else { return nil }
        return footprint
    }
}

extension PlaceDetails {
    init(placeId: String?, response: PlaceResponse) {
        address = response.location.formattedAddress
        self.placeId = placeId
        lat = response.location.lat
        lng = response.location.lng
        let points = response.footprint?.map { LatLng(lat: $0.lat, lng: $0.lng) }
        footprint = (points?.count ?? 0) >= 3 ? points : nil
        staticMapUrl = response.staticMapUrl
    }
}

struct DeviceInfo: Codable, Hashable {
    let model: String
    let osVersion: String
    let appVersion: String
    let hasLidar: Bool
}

struct SessionCreateRequest: Codable {
    let contractVersion: Int
    let sessionId: String
    let address: String
    let placeId: String?
    let lat: Double
    let lng: Double
    /// `[[lat, lng]]` pairs, exactly as the session-create schema wants them.
    let footprint: [[Double]]?
    let device: DeviceInfo
}

struct SessionCreateResponse: Codable {
    let ok: Bool
    let sessionId: String?
}

struct ChunkRegisterRequest: Codable {
    let seq: Int
    let kind: String
    let bytes: Int
    let sha256: String
}

struct ChunkRegisterResponse: Codable {
    let ok: Bool
    let uploadUrl: String?
}

struct OkResponse: Codable {
    let ok: Bool
}

struct FinalizeRequest: Codable {
    let contractVersion: Int
    let maxSeq: Int
}

struct FinalizeResponse: Codable {
    let ok: Bool
    let missingSeqs: [Int]?
}
