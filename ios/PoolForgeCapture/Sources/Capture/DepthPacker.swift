import Foundation
import CoreVideo

// Packs ARKit's sceneDepth buffers into the tight, row-padding-free byte layout
// the PFD1 chunk format declares. Pure CoreVideo so it is unit testable in the
// simulator, which matters: the LiDAR branch cannot be exercised anywhere else.
//
// Two things this guards that a naive implementation gets wrong:
//
//  * bytesPerRow is padded. CVPixelBufferGetBytesPerRow(depthMap) is commonly
//    512 for a 256-wide Float32 map but is free to be 1024 or anything else
//    aligned. Copying height * bytesPerRow ships the padding, and the cloud
//    worker then reads a sheared depth image with no error anywhere.
//  * The PFD1 record carries no width or height, so 256x192 is a contract term,
//    not a hint. A buffer of another size cannot be described by the format and
//    must be dropped rather than silently mis-parsed downstream.

enum DepthPacker {
    static let expectedWidth = 256
    static let expectedHeight = 192

    enum Failure: Error, Equatable, CustomStringConvertible {
        case lockFailed(CVReturn)
        case noBaseAddress
        case planar
        case unexpectedSize(width: Int, height: Int)
        case unexpectedFormat(OSType)

        var description: String {
            switch self {
            case .lockFailed(let code):
                return "the depth buffer could not be locked (\(code))"
            case .noBaseAddress:
                return "the depth buffer had no base address"
            case .planar:
                return "the depth buffer was planar"
            case .unexpectedSize(let w, let h):
                return "depth is \(w)x\(h), not \(DepthPacker.expectedWidth)x\(DepthPacker.expectedHeight)"
            case .unexpectedFormat(let f):
                return "unexpected depth pixel format \(f)"
            }
        }
    }

    /// 256x192 Float32 depth, tightly packed, row major.
    static func packDepth(_ pixelBuffer: CVPixelBuffer) throws -> Data {
        try pack(pixelBuffer, bytesPerPixel: 4,
                 allowedFormats: [kCVPixelFormatType_DepthFloat32,
                                  kCVPixelFormatType_DisparityFloat32],
                 width: expectedWidth, height: expectedHeight)
    }

    /// 256x192 UInt8 confidence, tightly packed, row major.
    static func packConfidence(_ pixelBuffer: CVPixelBuffer) throws -> Data {
        try pack(pixelBuffer, bytesPerPixel: 1,
                 allowedFormats: [kCVPixelFormatType_OneComponent8],
                 width: expectedWidth, height: expectedHeight)
    }

    /// Copies a non-planar buffer into a tight `width * height * bytesPerPixel`
    /// buffer, dropping any row padding. `width`/`height` are asserted, not
    /// discovered, because the wire format cannot express anything else.
    static func pack(_ pixelBuffer: CVPixelBuffer,
                     bytesPerPixel: Int,
                     allowedFormats: [OSType],
                     width: Int,
                     height: Int) throws -> Data {
        let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
        guard allowedFormats.contains(format) else {
            throw Failure.unexpectedFormat(format)
        }
        let actualWidth = CVPixelBufferGetWidth(pixelBuffer)
        let actualHeight = CVPixelBufferGetHeight(pixelBuffer)
        guard actualWidth == width, actualHeight == height else {
            throw Failure.unexpectedSize(width: actualWidth, height: actualHeight)
        }
        guard !CVPixelBufferIsPlanar(pixelBuffer) else { throw Failure.planar }

        let lock = CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        guard lock == kCVReturnSuccess else { throw Failure.lockFailed(lock) }
        // Only unlock what was actually locked: an unbalanced unlock corrupts
        // CoreVideo's lock count and eventually traps.
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            throw Failure.noBaseAddress
        }
        let rowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let tightRow = width * bytesPerPixel
        guard rowBytes >= tightRow else {
            // A stride narrower than the row would read past the allocation.
            throw Failure.unexpectedSize(width: rowBytes / max(bytesPerPixel, 1),
                                         height: actualHeight)
        }

        var out = Data(count: tightRow * height)
        out.withUnsafeMutableBytes { (dst: UnsafeMutableRawBufferPointer) in
            guard let dstBase = dst.baseAddress else { return }
            if rowBytes == tightRow {
                dstBase.copyMemory(from: base, byteCount: tightRow * height)
            } else {
                for row in 0..<height {
                    dstBase.advanced(by: row * tightRow)
                        .copyMemory(from: base.advanced(by: row * rowBytes),
                                    byteCount: tightRow)
                }
            }
        }
        return out
    }
}
