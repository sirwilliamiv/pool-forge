import Foundation
import Combine

final class AppSettings: ObservableObject {
    private static let serverKey = "serverURL"
    private static let tokenKey = "captureToken"
    private static let voiceKey = "voiceGuidanceEnabled"

    @Published var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: Self.serverKey) }
    }

    @Published var token: String {
        didSet { Keychain.set(token, key: Self.tokenKey) }
    }

    /// Spoken cues during the capture walk. Haptics are not affected by this.
    @Published var voiceGuidanceEnabled: Bool {
        didSet { UserDefaults.standard.set(voiceGuidanceEnabled, forKey: Self.voiceKey) }
    }

    init() {
        serverURLString = UserDefaults.standard.string(forKey: Self.serverKey) ?? ""
        token = Keychain.get(Self.tokenKey) ?? ""
        // Defaults to on, so the absent key must not read as false.
        voiceGuidanceEnabled = UserDefaults.standard.object(forKey: Self.voiceKey) as? Bool ?? true
    }

    var client: APIClient? {
        let trimmed = serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        let tokenTrimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tokenTrimmed.isEmpty, let url = URL(string: trimmed),
              url.scheme == "https" || url.scheme == "http" else { return nil }
        return APIClient(baseURL: url, token: tokenTrimmed)
    }
}
