import Foundation
import CryptoKit

enum Hashing {
    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Streams the file in 1 MB slices so a 24 MB chunk never has to sit in
    /// memory twice.
    static func sha256HexOfFile(at url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            guard let slice = try handle.read(upToCount: 1 << 20), !slice.isEmpty else { break }
            hasher.update(data: slice)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
