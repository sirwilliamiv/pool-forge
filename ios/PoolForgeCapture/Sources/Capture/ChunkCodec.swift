import Foundation
import Compression

// PFC1 / PFD1 chunk encoders and decoders, per docs/backyard-capture-contract.md
// section 5. Pure Foundation so the round-trip is unit testable off device.
// All multi-byte integers are little-endian.

enum ChunkKind: String, Codable, CaseIterable {
    case frames
    case poses
    case depth
    case meta
}

enum ChunkCodecError: Error {
    case truncated
    case badMagic
    case compressionFailed
}

struct FrameChunkEntry: Equatable {
    let frameIndex: UInt32
    let timestampS: Double
    let jpeg: Data
}

struct DepthChunkEntry: Equatable {
    let frameIndex: UInt32
    let timestampS: Double
    let depthZlib: Data
    let confZlib: Data
}

extension Data {
    mutating func appendU32LE(_ v: UInt32) {
        var le = v.littleEndian
        Swift.withUnsafeBytes(of: &le) { append(contentsOf: $0) }
    }

    mutating func appendU64LE(_ v: UInt64) {
        var le = v.littleEndian
        Swift.withUnsafeBytes(of: &le) { append(contentsOf: $0) }
    }

    mutating func appendF64LE(_ v: Double) {
        appendU64LE(v.bitPattern)
    }
}

/// Cursor over a byte buffer for decoding. Copies once at init; decode is used
/// by tests and tooling, not the hot capture path.
struct ByteReader {
    private let bytes: [UInt8]
    private(set) var offset = 0

    init(_ data: Data) {
        bytes = [UInt8](data)
    }

    var remaining: Int { bytes.count - offset }

    mutating func expectMagic(_ magic: [UInt8]) throws {
        guard remaining >= magic.count else { throw ChunkCodecError.truncated }
        guard Array(bytes[offset..<(offset + magic.count)]) == magic else {
            throw ChunkCodecError.badMagic
        }
        offset += magic.count
    }

    mutating func u32LE() throws -> UInt32 {
        guard remaining >= 4 else { throw ChunkCodecError.truncated }
        let v = UInt32(bytes[offset])
            | UInt32(bytes[offset + 1]) << 8
            | UInt32(bytes[offset + 2]) << 16
            | UInt32(bytes[offset + 3]) << 24
        offset += 4
        return v
    }

    mutating func u64LE() throws -> UInt64 {
        let lo = try u32LE()
        let hi = try u32LE()
        return UInt64(lo) | (UInt64(hi) << 32)
    }

    mutating func f64LE() throws -> Double {
        Double(bitPattern: try u64LE())
    }

    mutating func data(_ count: Int) throws -> Data {
        guard count >= 0, remaining >= count else { throw ChunkCodecError.truncated }
        let d = Data(bytes[offset..<(offset + count)])
        offset += count
        return d
    }
}

enum ChunkCodec {
    static let framesMagic: [UInt8] = Array("PFC1".utf8)
    static let depthMagic: [UInt8] = Array("PFD1".utf8)

    // frames: magic, then per frame u32 frameIndex, f64 timestampS, u32 jpegLen, jpeg bytes.
    static func encodeFrames(_ entries: [FrameChunkEntry]) -> Data {
        var d = Data()
        d.append(contentsOf: framesMagic)
        for e in entries {
            d.appendU32LE(e.frameIndex)
            d.appendF64LE(e.timestampS)
            d.appendU32LE(UInt32(e.jpeg.count))
            d.append(e.jpeg)
        }
        return d
    }

    static func decodeFrames(_ data: Data) throws -> [FrameChunkEntry] {
        var r = ByteReader(data)
        try r.expectMagic(framesMagic)
        var out: [FrameChunkEntry] = []
        while r.remaining > 0 {
            let idx = try r.u32LE()
            let t = try r.f64LE()
            let len = try r.u32LE()
            let jpeg = try r.data(Int(len))
            out.append(FrameChunkEntry(frameIndex: idx, timestampS: t, jpeg: jpeg))
        }
        return out
    }

    // depth: magic, then per frame u32 frameIndex, f64 timestampS,
    // u32 zlibDepthLen, bytes, u32 zlibConfLen, bytes.
    static func encodeDepth(_ entries: [DepthChunkEntry]) -> Data {
        var d = Data()
        d.append(contentsOf: depthMagic)
        for e in entries {
            d.appendU32LE(e.frameIndex)
            d.appendF64LE(e.timestampS)
            d.appendU32LE(UInt32(e.depthZlib.count))
            d.append(e.depthZlib)
            d.appendU32LE(UInt32(e.confZlib.count))
            d.append(e.confZlib)
        }
        return d
    }

    static func decodeDepth(_ data: Data) throws -> [DepthChunkEntry] {
        var r = ByteReader(data)
        try r.expectMagic(depthMagic)
        var out: [DepthChunkEntry] = []
        while r.remaining > 0 {
            let idx = try r.u32LE()
            let t = try r.f64LE()
            let depthLen = try r.u32LE()
            let depth = try r.data(Int(depthLen))
            let confLen = try r.u32LE()
            let conf = try r.data(Int(confLen))
            out.append(DepthChunkEntry(frameIndex: idx, timestampS: t, depthZlib: depth, confZlib: conf))
        }
        return out
    }
}

/// Real zlib streams (RFC 1950): Apple's Compression framework emits raw
/// DEFLATE for COMPRESSION_ZLIB, so the 2-byte header and adler32 trailer are
/// added here to keep the payload decodable by stock zlib in the cloud worker.
enum Zlib {
    static func compress(_ input: Data) throws -> Data {
        if input.isEmpty {
            // zlib stream of zero bytes: header, empty stored block, adler32(1).
            return Data([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])
        }
        let dstCapacity = input.count + input.count / 8 + 256
        var dst = Data(count: dstCapacity)
        let written = dst.withUnsafeMutableBytes { (dstPtr: UnsafeMutableRawBufferPointer) -> Int in
            input.withUnsafeBytes { (srcPtr: UnsafeRawBufferPointer) -> Int in
                guard let d = dstPtr.bindMemory(to: UInt8.self).baseAddress,
                      let s = srcPtr.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return compression_encode_buffer(d, dstCapacity, s, input.count, nil, COMPRESSION_ZLIB)
            }
        }
        guard written > 0 else { throw ChunkCodecError.compressionFailed }
        var out = Data([0x78, 0x9c])
        out.append(Data(dst.prefix(written)))
        let a = adler32(input)
        out.append(contentsOf: [
            UInt8((a >> 24) & 0xff),
            UInt8((a >> 16) & 0xff),
            UInt8((a >> 8) & 0xff),
            UInt8(a & 0xff),
        ])
        return out
    }

    static func decompress(_ input: Data, expectedSize: Int) throws -> Data {
        guard input.count > 6 else { throw ChunkCodecError.truncated }
        let deflate = Data(input.dropFirst(2).dropLast(4))
        if deflate == Data([0x03, 0x00]) {
            // Raw DEFLATE of zero bytes.
            return Data()
        }
        let capacity = max(expectedSize, 64)
        var dst = Data(count: capacity)
        let written = dst.withUnsafeMutableBytes { (dstPtr: UnsafeMutableRawBufferPointer) -> Int in
            deflate.withUnsafeBytes { (srcPtr: UnsafeRawBufferPointer) -> Int in
                guard let d = dstPtr.bindMemory(to: UInt8.self).baseAddress,
                      let s = srcPtr.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return compression_decode_buffer(d, capacity, s, deflate.count, nil, COMPRESSION_ZLIB)
            }
        }
        guard written > 0 else { throw ChunkCodecError.compressionFailed }
        return Data(dst.prefix(written))
    }

    static func adler32(_ data: Data) -> UInt32 {
        var a: UInt32 = 1
        var b: UInt32 = 0
        for byte in data {
            a = (a + UInt32(byte)) % 65521
            b = (b + a) % 65521
        }
        return (b << 16) | a
    }
}
