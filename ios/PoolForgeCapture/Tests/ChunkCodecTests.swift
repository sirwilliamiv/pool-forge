import XCTest
@testable import PoolForgeCapture

final class ChunkCodecTests: XCTestCase {
    private func pseudoRandomData(count: Int, seed: UInt64) -> Data {
        var state = seed
        var out = Data(capacity: count)
        for _ in 0..<count {
            // xorshift64
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            out.append(UInt8(truncatingIfNeeded: state))
        }
        return out
    }

    // MARK: PFC1

    func testFramesRoundTrip() throws {
        let entries = [
            FrameChunkEntry(frameIndex: 0, timestampS: 0.5, jpeg: pseudoRandomData(count: 1024, seed: 1)),
            FrameChunkEntry(frameIndex: 1, timestampS: 1.0, jpeg: pseudoRandomData(count: 2048, seed: 2)),
            FrameChunkEntry(frameIndex: 2, timestampS: 1.5, jpeg: Data()),
        ]
        let encoded = ChunkCodec.encodeFrames(entries)
        let decoded = try ChunkCodec.decodeFrames(encoded)
        XCTAssertEqual(decoded, entries)
    }

    func testFramesBinaryLayoutIsLittleEndian() {
        let jpeg = Data([0xAA, 0xBB, 0xCC])
        let entry = FrameChunkEntry(frameIndex: 0x0102_0304, timestampS: 1.0, jpeg: jpeg)
        let encoded = ChunkCodec.encodeFrames([entry])
        let bytes = [UInt8](encoded)
        XCTAssertEqual(Array(bytes[0..<4]), Array("PFC1".utf8))
        // u32 frameIndex little-endian
        XCTAssertEqual(Array(bytes[4..<8]), [0x04, 0x03, 0x02, 0x01])
        // f64 timestamp 1.0 little-endian bit pattern 0x3FF0000000000000
        XCTAssertEqual(Array(bytes[8..<16]), [0, 0, 0, 0, 0, 0, 0xF0, 0x3F])
        // u32 jpegLen little-endian
        XCTAssertEqual(Array(bytes[16..<20]), [0x03, 0, 0, 0])
        XCTAssertEqual(Array(bytes[20..<23]), [0xAA, 0xBB, 0xCC])
        XCTAssertEqual(bytes.count, 23)
    }

    func testFramesDecodeRejectsBadMagic() {
        var data = ChunkCodec.encodeFrames([])
        data[0] = 0x00
        XCTAssertThrowsError(try ChunkCodec.decodeFrames(data))
    }

    func testFramesDecodeRejectsTruncation() {
        let entries = [FrameChunkEntry(frameIndex: 0, timestampS: 0.5,
                                       jpeg: pseudoRandomData(count: 128, seed: 3))]
        let encoded = ChunkCodec.encodeFrames(entries)
        XCTAssertThrowsError(try ChunkCodec.decodeFrames(encoded.dropLast(10)))
    }

    // MARK: PFD1 + zlib

    func testDepthRoundTrip() throws {
        // Synthetic depth planes; the codec does not care about dimensions.
        let depthPlane = pseudoRandomData(count: 256 * 192 / 16, seed: 7)
        let confPlane = Data(repeating: 2, count: 256 * 192 / 64)
        let entries = [
            DepthChunkEntry(frameIndex: 5, timestampS: 2.25,
                            depthZlib: try Zlib.compress(depthPlane),
                            confZlib: try Zlib.compress(confPlane)),
        ]
        let encoded = ChunkCodec.encodeDepth(entries)
        XCTAssertEqual(Array(encoded.prefix(4)), Array("PFD1".utf8))
        let decoded = try ChunkCodec.decodeDepth(encoded)
        XCTAssertEqual(decoded, entries)
        let depthBack = try Zlib.decompress(decoded[0].depthZlib, expectedSize: depthPlane.count)
        let confBack = try Zlib.decompress(decoded[0].confZlib, expectedSize: confPlane.count)
        XCTAssertEqual(depthBack, depthPlane)
        XCTAssertEqual(confBack, confPlane)
    }

    func testZlibStreamHasHeaderAndAdler() throws {
        let payload = Data(repeating: 0x41, count: 1000)
        let compressed = try Zlib.compress(payload)
        // RFC 1950 header.
        XCTAssertEqual(compressed[compressed.startIndex], 0x78)
        XCTAssertEqual(compressed[compressed.index(after: compressed.startIndex)], 0x9c)
        // Repetitive input actually compresses.
        XCTAssertLessThan(compressed.count, payload.count)
        // Trailer is adler32 of the raw payload, big-endian.
        let a = Zlib.adler32(payload)
        let trailer = Array(compressed.suffix(4))
        XCTAssertEqual(trailer, [
            UInt8((a >> 24) & 0xff), UInt8((a >> 16) & 0xff),
            UInt8((a >> 8) & 0xff), UInt8(a & 0xff),
        ])
        let back = try Zlib.decompress(compressed, expectedSize: payload.count)
        XCTAssertEqual(back, payload)
    }

    func testZlibEmptyRoundTrip() throws {
        let compressed = try Zlib.compress(Data())
        let back = try Zlib.decompress(compressed, expectedSize: 0)
        XCTAssertEqual(back, Data())
    }

    func testAdler32KnownVector() {
        // adler32("Wikipedia") == 0x11E60398
        XCTAssertEqual(Zlib.adler32(Data("Wikipedia".utf8)), 0x11E6_0398)
    }
}
