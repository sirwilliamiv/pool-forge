import XCTest
@testable import PoolForgeCapture

final class HashingTests: XCTestCase {
    func testSha256KnownVector() {
        XCTAssertEqual(
            Hashing.sha256Hex(Data("abc".utf8)),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        XCTAssertEqual(
            Hashing.sha256Hex(Data()),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
    }

    func testStreamedFileHashMatchesInMemoryHash() throws {
        var payload = Data(capacity: 3 * (1 << 20) + 17)
        var state: UInt64 = 0xDEADBEEF
        for _ in 0..<(3 * (1 << 20) + 17) {
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            payload.append(UInt8(truncatingIfNeeded: state))
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("hash-test-\(UUID().uuidString).bin")
        try payload.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(try Hashing.sha256HexOfFile(at: url), Hashing.sha256Hex(payload))
    }
}
