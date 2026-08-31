import SwiftUI
import UIKit
import Security

@main
struct PoolForgeCaptureApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settings = AppSettings()
    @StateObject private var model = AppModel()
    @StateObject private var uploads = UploadManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(settings)
                .environmentObject(model)
                .environmentObject(uploads)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        UploadManager.shared.backgroundCompletionHandler = completionHandler
        UploadManager.shared.kick()
    }
}

enum Route: Hashable {
    case siteConfirm
    case lapPreview
    case capture
    case uploads
}

final class AppModel: ObservableObject {
    @Published var path: [Route] = []
    @Published var place: PlaceDetails?
    @Published var confirmedFootprint: [LatLng]?
    @Published var lapPlan: LapPlan?
}

struct RootView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var model: AppModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack(path: $model.path) {
            AddressSearchView()
                .navigationTitle("Backyard Capture")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel("Settings")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            model.path.append(.uploads)
                        } label: {
                            Image(systemName: "icloud.and.arrow.up")
                        }
                        .accessibilityLabel("Uploads")
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .siteConfirm: SiteConfirmView()
                    case .lapPreview: LapPreviewView()
                    case .capture: CaptureView()
                    case .uploads: UploadsView()
                    }
                }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .onAppear {
            UploadManager.shared.clientProvider = { [weak settings] in settings?.client }
            UploadManager.shared.refresh()
            UploadManager.shared.kick()
            if settings.client == nil {
                showSettings = true
            }
        }
    }
}

enum DeviceIdentity {
    static var modelIdentifier: String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        var identifier = ""
        for child in mirror.children {
            guard let value = child.value as? Int8, value != 0 else { continue }
            identifier.append(Character(UnicodeScalar(UInt8(value))))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    static var info: DeviceInfo {
        DeviceInfo(model: modelIdentifier,
                   osVersion: UIDevice.current.systemVersion,
                   appVersion: appVersion,
                   hasLidar: CaptureController.lidarAvailable)
    }
}

enum SessionID {
    static func make() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return "bcs_" + bytes.map { String(format: "%02x", $0) }.joined()
    }
}
