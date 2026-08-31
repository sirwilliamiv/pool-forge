import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("https://app.pool-forge.com", text: $settings.serverURLString)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    SecureField("pfc_...", text: $settings.token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Capture token")
                } footer: {
                    Text("Mint one from a signed-in Pool Forge web session (POST /api/mobile/tokens). It is shown once; it lives in the Keychain here.")
                }
                Section {
                    Toggle("Voice guidance", isOn: $settings.voiceGuidanceEnabled)
                } header: {
                    Text("Capture")
                } footer: {
                    Text("Short spoken cues during the walk so you can keep the camera on the yard instead of the screen. Vibration cues stay on either way.")
                }
                if settings.client == nil {
                    Section {
                        Label("Enter a server URL and token to continue.",
                              systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .disabled(settings.client == nil)
                }
            }
        }
    }
}
