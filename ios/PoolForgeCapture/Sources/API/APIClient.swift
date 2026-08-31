import Foundation

// Typed client for the /api/mobile surface. Errors always come out as
// sentences a person can act on; raw server payloads never reach the UI.

enum APIError: LocalizedError {
    case notConfigured
    case badURL
    case unauthorized
    case conflict
    case server(Int)
    case network
    case badResponse

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Set the server address and capture token in Settings first."
        case .badURL:
            return "The server address in Settings is not a valid URL."
        case .unauthorized:
            return "The capture token was rejected. Mint a new one from Pool Forge and paste it in Settings."
        case .conflict:
            return "The server already has this item."
        case .server(let code):
            return "The server could not handle that request (status \(code)). Try again in a moment."
        case .network:
            return "Could not reach the server. Check your connection and the server address in Settings."
        case .badResponse:
            return "The server sent something unexpected. Try again, and update the app if it keeps happening."
        }
    }
}

struct APIClient {
    let baseURL: URL
    let token: String
    var urlSession: URLSession = .shared

    // MARK: site

    func autocomplete(query: String, session: String) async throws -> [PlaceSuggestion] {
        let data = try await get("/api/mobile/site/autocomplete", query: [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "session", value: session),
        ])
        guard let decoded = try? JSONDecoder().decode(AutocompleteResponse.self, from: data) else {
            throw APIError.badResponse
        }
        return decoded.suggestions
    }

    func place(placeId: String, session: String) async throws -> PlaceDetails {
        let data = try await get("/api/mobile/site/place", query: [
            URLQueryItem(name: "placeId", value: placeId),
            URLQueryItem(name: "session", value: session),
        ])
        guard let decoded = try? JSONDecoder().decode(PlaceResponse.self, from: data), decoded.ok else {
            throw APIError.badResponse
        }
        return PlaceDetails(placeId: placeId, response: decoded)
    }

    /// Reverse-geocodes the current location, then resolves the full place
    /// (footprint + map) through the place route. `nil` means the spot has no
    /// street address, which the caller answers by asking the person to type.
    func reverse(lat: Double, lng: Double, session: String) async throws -> PlaceDetails? {
        let data = try await get("/api/mobile/site/reverse", query: [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lng", value: String(lng)),
        ])
        guard let decoded = try? JSONDecoder().decode(ReverseResponse.self, from: data), decoded.ok else {
            throw APIError.badResponse
        }
        guard let address = decoded.address else { return nil }
        return try await place(placeId: address.placeId, session: session)
    }

    /// Fetches the satellite bitmap through the authenticated proxy. The path
    /// is the relative `staticMapUrl` the place route returned; AsyncImage
    /// cannot send the bearer, so the bytes come through here.
    func imageData(relativePath: String) async throws -> Data {
        guard let components = URLComponents(string: relativePath) else { throw APIError.badResponse }
        let req = try request(path: components.path, query: components.queryItems)
        return try await send(req)
    }

    // MARK: capture sessions

    func createSession(_ body: SessionCreateRequest) async throws {
        let data = try await post("/api/mobile/capture/sessions", body: body)
        guard let decoded = try? JSONDecoder().decode(SessionCreateResponse.self, from: data), decoded.ok else {
            throw APIError.badResponse
        }
    }

    func registerChunk(sessionId: String, seq: Int, kind: String, bytes: Int, sha256: String) async throws -> URL {
        let body = ChunkRegisterRequest(seq: seq, kind: kind, bytes: bytes, sha256: sha256)
        let data = try await post("/api/mobile/capture/sessions/\(sessionId)/chunks", body: body)
        guard let decoded = try? JSONDecoder().decode(ChunkRegisterResponse.self, from: data),
              decoded.ok, let urlString = decoded.uploadUrl, let url = URL(string: urlString) else {
            throw APIError.badResponse
        }
        return url
    }

    func completeChunk(sessionId: String, seq: Int) async throws {
        let data = try await post("/api/mobile/capture/sessions/\(sessionId)/chunks/\(seq)/complete",
                                  body: OkResponse(ok: true))
        guard let decoded = try? JSONDecoder().decode(OkResponse.self, from: data), decoded.ok else {
            throw APIError.badResponse
        }
    }

    /// Returns the seqs the server is still missing; empty means finalized.
    func finalize(sessionId: String, maxSeq: Int) async throws -> [Int] {
        let data: Data
        do {
            data = try await post("/api/mobile/capture/sessions/\(sessionId)/finalize",
                                  body: FinalizeRequest(contractVersion: 1, maxSeq: maxSeq))
        } catch APIError.server(let code) where code == 409 || code == 422 {
            // Some finalize implementations answer missing seqs with a non-2xx
            // status; the caller retries after re-upload either way.
            throw APIError.server(code)
        }
        guard let decoded = try? JSONDecoder().decode(FinalizeResponse.self, from: data) else {
            throw APIError.badResponse
        }
        if decoded.ok { return [] }
        return decoded.missingSeqs ?? []
    }

    // MARK: plumbing

    private func request(path: String, query: [URLQueryItem]?) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.badURL
        }
        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = basePath + path
        if let query, !query.isEmpty {
            components.queryItems = query
        }
        guard let url = components.url else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return req
    }

    private func get(_ path: String, query: [URLQueryItem]) async throws -> Data {
        let req = try request(path: path, query: query)
        return try await send(req)
    }

    private func post<B: Encodable>(_ path: String, body: B) async throws -> Data {
        var req = try request(path: path, query: nil)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch {
            throw APIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        switch http.statusCode {
        case 200...299:
            return data
        case 401, 403:
            throw APIError.unauthorized
        case 409:
            throw APIError.conflict
        default:
            // Try to surface missing seqs from structured error bodies before
            // collapsing to a status sentence.
            if let decoded = try? JSONDecoder().decode(FinalizeResponse.self, from: data),
               decoded.missingSeqs != nil {
                return data
            }
            throw APIError.server(http.statusCode)
        }
    }
}
