import XCTest
import CoreVideo
@testable import PoolForgeCapture

/// The LiDAR depth branch has no simulator to run in and no unit-testable
/// ARDepthData, so everything about it that can be tested lives behind
/// DepthPacker and is tested here against hand-built CVPixelBuffers.
final class DepthPackerTests: XCTestCase {
    /// Builds a buffer with an explicitly chosen bytesPerRow so row padding can
    /// be forced. Padding bytes are filled with 0xFF, which is a value the
    /// payload never uses, so any leak shows up as a mismatch rather than as a
    /// plausible-looking depth value.
    private func makeBuffer(width: Int, height: Int,
                            format: OSType, bytesPerPixel: Int,
                            rowBytes: Int,
                            writeRow: (UnsafeMutableRawPointer, Int) -> Void) throws -> CVPixelBuffer {
        XCTAssertGreaterThanOrEqual(rowBytes, width * bytesPerPixel)
        let total = rowBytes * height
        let raw = UnsafeMutableRawPointer.allocate(byteCount: total, alignment: 16)
        raw.initializeMemory(as: UInt8.self, repeating: 0xFF, count: total)
        for row in 0..<height {
            writeRow(raw.advanced(by: row * rowBytes), row)
        }
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreateWithBytes(
            kCFAllocatorDefault, width, height, format, raw, rowBytes,
            { refcon, _ in refcon?.deallocate() }, raw, nil, &buffer)
        guard status == kCVReturnSuccess, let buffer else {
            raw.deallocate()
            throw XCTSkip("CVPixelBufferCreateWithBytes failed with \(status)")
        }
        return buffer
    }

    private func depthValue(row: Int, column: Int) -> Float {
        Float(row) * 1000 + Float(column)
    }

    private func makeDepthBuffer(width: Int = DepthPacker.expectedWidth,
                                 height: Int = DepthPacker.expectedHeight,
                                 rowBytes: Int? = nil,
                                 format: OSType = kCVPixelFormatType_DepthFloat32) throws -> CVPixelBuffer {
        try makeBuffer(width: width, height: height, format: format, bytesPerPixel: 4,
                       rowBytes: rowBytes ?? width * 4) { rowStart, row in
            let floats = rowStart.bindMemory(to: Float.self, capacity: width)
            for column in 0..<width {
                floats[column] = self.depthValue(row: row, column: column)
            }
        }
    }

    private func makeConfidenceBuffer(width: Int = DepthPacker.expectedWidth,
                                      height: Int = DepthPacker.expectedHeight,
                                      rowBytes: Int? = nil) throws -> CVPixelBuffer {
        try makeBuffer(width: width, height: height,
                       format: kCVPixelFormatType_OneComponent8, bytesPerPixel: 1,
                       rowBytes: rowBytes ?? width) { rowStart, row in
            let bytes = rowStart.bindMemory(to: UInt8.self, capacity: width)
            for column in 0..<width {
                bytes[column] = UInt8((row + column) % 3)
            }
        }
    }

    private func assertDepthPayloadIsCorrect(_ data: Data, file: StaticString = #filePath,
                                             line: UInt = #line) {
        let width = DepthPacker.expectedWidth
        let height = DepthPacker.expectedHeight
        XCTAssertEqual(data.count, width * height * 4, file: file, line: line)
        data.withUnsafeBytes { raw in
            let floats = raw.bindMemory(to: Float.self)
            for row in [0, 1, height / 2, height - 1] {
                for column in [0, 1, width / 2, width - 1] {
                    XCTAssertEqual(floats[row * width + column],
                                   depthValue(row: row, column: column),
                                   file: file, line: line)
                }
            }
        }
    }

    // MARK: stride padding, the classic bug

    /// bytesPerRow on an ARKit depth map is not width * 4. Copying
    /// height * bytesPerRow ships the padding and shears the image, with no
    /// error anywhere: the cloud worker just reads a diagonal mess.
    func testStridePaddedDepthBufferIsPackedTightly() throws {
        let padded = DepthPacker.expectedWidth * 4 + 64
        let buffer = try makeDepthBuffer(rowBytes: padded)
        XCTAssertEqual(CVPixelBufferGetBytesPerRow(buffer), padded)
        let packed = try DepthPacker.packDepth(buffer)
        assertDepthPayloadIsCorrect(packed)
    }

    func testHeavilyPaddedDepthBufferIsPackedTightly() throws {
        let buffer = try makeDepthBuffer(rowBytes: DepthPacker.expectedWidth * 4 * 2)
        let packed = try DepthPacker.packDepth(buffer)
        assertDepthPayloadIsCorrect(packed)
    }

    func testTightDepthBufferIsPackedUnchanged() throws {
        let buffer = try makeDepthBuffer()
        XCTAssertEqual(CVPixelBufferGetBytesPerRow(buffer), DepthPacker.expectedWidth * 4)
        let packed = try DepthPacker.packDepth(buffer)
        assertDepthPayloadIsCorrect(packed)
    }

    func testStridePaddedConfidenceBufferIsPackedTightly() throws {
        let width = DepthPacker.expectedWidth
        let height = DepthPacker.expectedHeight
        let buffer = try makeConfidenceBuffer(rowBytes: width + 44)
        let packed = try DepthPacker.packConfidence(buffer)
        XCTAssertEqual(packed.count, width * height)
        let bytes = [UInt8](packed)
        // No 0xFF padding sentinel anywhere: confidence is only ever 0, 1 or 2.
        XCTAssertNil(bytes.first { $0 > 2 })
        XCTAssertEqual(bytes[0], 0)
        XCTAssertEqual(bytes[width + 1], UInt8(2 % 3))
        XCTAssertEqual(bytes[(height - 1) * width + (width - 1)],
                       UInt8((height - 1 + width - 1) % 3))
    }

    // MARK: contract shape

    func testWrongDimensionsAreRejected() throws {
        let buffer = try makeDepthBuffer(width: 320, height: 240)
        XCTAssertThrowsError(try DepthPacker.packDepth(buffer)) { error in
            XCTAssertEqual(error as? DepthPacker.Failure,
                           .unexpectedSize(width: 320, height: 240))
        }
    }

    func testWrongPixelFormatIsRejected() throws {
        let buffer = try makeConfidenceBuffer()
        XCTAssertThrowsError(try DepthPacker.packDepth(buffer)) { error in
            guard case .unexpectedFormat = error as? DepthPacker.Failure else {
                return XCTFail("expected an unexpectedFormat failure, got \(error)")
            }
        }
    }

    func testDisparityFloat32IsAccepted() throws {
        let buffer = try makeDepthBuffer(format: kCVPixelFormatType_DisparityFloat32)
        XCTAssertNoThrow(try DepthPacker.packDepth(buffer))
    }

    func testFailureDescriptionsAreHumanReadable() {
        XCTAssertTrue(DepthPacker.Failure.unexpectedSize(width: 320, height: 240)
            .description.contains("256x192"))
        XCTAssertFalse(DepthPacker.Failure.noBaseAddress.description.isEmpty)
    }

    /// Packing must leave the buffer's lock count where it found it, or a later
    /// lock eventually traps. A second successful pack proves the pairing.
    func testRepeatedPacksLeaveTheBufferUsable() throws {
        let buffer = try makeDepthBuffer(rowBytes: DepthPacker.expectedWidth * 4 + 16)
        for _ in 0..<5 {
            assertDepthPayloadIsCorrect(try DepthPacker.packDepth(buffer))
        }
        XCTAssertEqual(CVPixelBufferLockBaseAddress(buffer, .readOnly), kCVReturnSuccess)
        XCTAssertEqual(CVPixelBufferUnlockBaseAddress(buffer, .readOnly), kCVReturnSuccess)
    }

    // MARK: PFD1 round trip with real-sized planes

    func testFullSizeDepthFrameSurvivesTheChunkRoundTrip() throws {
        let depthBuffer = try makeDepthBuffer(rowBytes: DepthPacker.expectedWidth * 4 + 128)
        let confBuffer = try makeConfidenceBuffer(rowBytes: DepthPacker.expectedWidth + 32)
        let depthPlane = try DepthPacker.packDepth(depthBuffer)
        let confPlane = try DepthPacker.packConfidence(confBuffer)

        let entry = DepthChunkEntry(frameIndex: 11, timestampS: 4.5,
                                    depthZlib: try Zlib.compress(depthPlane),
                                    confZlib: try Zlib.compress(confPlane))
        let encoded = ChunkCodec.encodeDepth([entry])
        let decoded = try ChunkCodec.decodeDepth(encoded)
        XCTAssertEqual(decoded, [entry])

        let depthBack = try Zlib.decompress(decoded[0].depthZlib, expectedSize: depthPlane.count)
        let confBack = try Zlib.decompress(decoded[0].confZlib, expectedSize: confPlane.count)
        XCTAssertEqual(depthBack, depthPlane)
        XCTAssertEqual(confBack, confPlane)
        assertDepthPayloadIsCorrect(depthBack)
    }

    /// Zlib.compress sizes its destination at input + 12.5% + 256. A depth
    /// plane of incompressible noise is the worst case the recorder will ever
    /// hand it, and it must not fall out as a dropped frame.
    func testIncompressibleFullSizeDepthPlaneStillCompresses() throws {
        var state: UInt64 = 0x9E3779B97F4A7C15
        var noise = Data(capacity: DepthPacker.expectedWidth * DepthPacker.expectedHeight * 4)
        for _ in 0..<(DepthPacker.expectedWidth * DepthPacker.expectedHeight * 4) {
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            noise.append(UInt8(truncatingIfNeeded: state))
        }
        let compressed = try Zlib.compress(noise)
        let back = try Zlib.decompress(compressed, expectedSize: noise.count)
        XCTAssertEqual(back, noise)
    }

    /// The fast adler32 must agree with the textbook one byte at a time form
    /// over a payload the size of a real depth plane.
    func testAdler32MatchesNaiveOverADepthSizedPayload() {
        var state: UInt64 = 12345
        var payload = Data(capacity: 196_608)
        for _ in 0..<196_608 {
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            payload.append(UInt8(truncatingIfNeeded: state))
        }
        var a: UInt32 = 1
        var b: UInt32 = 0
        for byte in payload {
            a = (a + UInt32(byte)) % 65521
            b = (b + a) % 65521
        }
        XCTAssertEqual(Zlib.adler32(payload), (b << 16) | a)
    }
}
