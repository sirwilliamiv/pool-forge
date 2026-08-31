import Foundation
import SQLite3

// Minimal wrapper over the raw SQLite3 C API. Deliberately no SPM dependency;
// the queue schema is four columns and a state machine.

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

enum SQLiteError: Error, LocalizedError {
    case open(String)
    case prepare(String, sql: String)
    case step(String, sql: String)

    var errorDescription: String? {
        switch self {
        case .open(let m): return "Could not open the local upload database (\(m))."
        case .prepare(let m, _): return "Local database error (\(m))."
        case .step(let m, _): return "Local database error (\(m))."
        }
    }
}

final class SQLiteDB {
    private var db: OpaquePointer?
    private let lock = NSLock()

    init(path: String) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path, &db, flags, nil) == SQLITE_OK else {
            let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            sqlite3_close(db)
            throw SQLiteError.open(message)
        }
        sqlite3_busy_timeout(db, 2000)
    }

    deinit {
        sqlite3_close(db)
    }

    private var message: String {
        db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
    }

    @discardableResult
    func run(_ sql: String, _ params: [Any?] = []) throws -> Int {
        lock.lock()
        defer { lock.unlock() }
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }
        let rc = sqlite3_step(stmt)
        guard rc == SQLITE_DONE || rc == SQLITE_ROW else {
            throw SQLiteError.step(message, sql: sql)
        }
        return Int(sqlite3_changes(db))
    }

    func rows(_ sql: String, _ params: [Any?] = []) throws -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        let stmt = try prepare(sql, params)
        defer { sqlite3_finalize(stmt) }
        var out: [[String: Any]] = []
        while true {
            let rc = sqlite3_step(stmt)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else {
                throw SQLiteError.step(message, sql: sql)
            }
            var row: [String: Any] = [:]
            let count = sqlite3_column_count(stmt)
            for i in 0..<count {
                let name = String(cString: sqlite3_column_name(stmt, i))
                switch sqlite3_column_type(stmt, i) {
                case SQLITE_INTEGER:
                    row[name] = sqlite3_column_int64(stmt, i)
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(stmt, i)
                case SQLITE_TEXT:
                    row[name] = String(cString: sqlite3_column_text(stmt, i))
                case SQLITE_BLOB:
                    if let base = sqlite3_column_blob(stmt, i) {
                        row[name] = Data(bytes: base, count: Int(sqlite3_column_bytes(stmt, i)))
                    }
                default:
                    break
                }
            }
            out.append(row)
        }
        return out
    }

    private func prepare(_ sql: String, _ params: [Any?]) throws -> OpaquePointer {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let prepared = stmt else {
            throw SQLiteError.prepare(message, sql: sql)
        }
        for (i, param) in params.enumerated() {
            let idx = Int32(i + 1)
            switch param {
            case nil:
                sqlite3_bind_null(prepared, idx)
            case let v as String:
                sqlite3_bind_text(prepared, idx, v, -1, SQLITE_TRANSIENT)
            case let v as Int:
                sqlite3_bind_int64(prepared, idx, Int64(v))
            case let v as Int64:
                sqlite3_bind_int64(prepared, idx, v)
            case let v as Double:
                sqlite3_bind_double(prepared, idx, v)
            case let v as Data:
                _ = v.withUnsafeBytes { ptr in
                    sqlite3_bind_blob(prepared, idx, ptr.baseAddress, Int32(v.count), SQLITE_TRANSIENT)
                }
            case let v as Bool:
                sqlite3_bind_int64(prepared, idx, v ? 1 : 0)
            default:
                sqlite3_finalize(prepared)
                throw SQLiteError.prepare("unsupported bind type", sql: sql)
            }
        }
        return prepared
    }
}
