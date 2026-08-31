import SwiftUI

struct UploadsView: View {
    @EnvironmentObject private var uploads: UploadManager
    @State private var finalizeMessage: String?
    @State private var finalizing: Set<String> = []

    var body: some View {
        List {
            if uploads.summaries.isEmpty {
                ContentUnavailableView("No captures yet", systemImage: "icloud.and.arrow.up")
            }
            ForEach(uploads.summaries) { summary in
                sessionRow(summary)
            }
            if let error = uploads.lastError {
                Section {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Uploads")
        .refreshable {
            uploads.refresh()
            uploads.kick()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    uploads.refresh()
                    uploads.kick()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Retry uploads")
            }
        }
        .alert("Finalize", isPresented: messageBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(finalizeMessage ?? "")
        }
        .onAppear {
            uploads.refresh()
            uploads.kick()
        }
    }

    private var messageBinding: Binding<Bool> {
        Binding(get: { finalizeMessage != nil }, set: { if !$0 { finalizeMessage = nil } })
    }

    @ViewBuilder
    private func sessionRow(_ summary: UploadSessionSummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(summary.address)
                .font(.subheadline.weight(.medium))
                .lineLimit(2)
            ProgressView(value: summary.total > 0 ? Double(summary.verified) / Double(summary.total) : 0)
            HStack {
                Text("\(summary.verified) of \(summary.total) chunks verified")
                Spacer()
                if summary.bytesRemaining > 0 {
                    Text(ByteCountFormatter.string(fromByteCount: summary.bytesRemaining,
                                                   countStyle: .file) + " left")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if summary.status == "finalized" {
                Label("Bundle complete", systemImage: "checkmark.seal")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Button {
                    finalize(summary)
                } label: {
                    if finalizing.contains(summary.sessionId) {
                        ProgressView()
                    } else {
                        Text("Finalize")
                    }
                }
                .buttonStyle(.bordered)
                .disabled(summary.total == 0
                          || summary.verified < summary.total
                          || finalizing.contains(summary.sessionId))
            }
        }
        .padding(.vertical, 4)
    }

    private func finalize(_ summary: UploadSessionSummary) {
        finalizing.insert(summary.sessionId)
        Task {
            let error = await uploads.finalize(sessionId: summary.sessionId)
            await MainActor.run {
                finalizing.remove(summary.sessionId)
                if let error {
                    finalizeMessage = error
                } else {
                    finalizeMessage = "Bundle complete. The walk is safely in the cloud."
                }
            }
        }
    }
}
