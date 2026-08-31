import SwiftUI
import RealityKit
import ARKit

struct ARViewContainer: UIViewRepresentable {
    let controller: CaptureController

    func makeUIView(context: Context) -> ARView {
        let view = controller.arView
        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.handleTap(_:)))
        view.addGestureRecognizer(tap)
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(controller: controller)
    }

    final class Coordinator: NSObject {
        let controller: CaptureController
        init(controller: CaptureController) {
            self.controller = controller
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            controller.handleTap(at: recognizer.location(in: recognizer.view))
        }
    }
}

struct CaptureView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var settings: AppSettings
    @StateObject private var controller = CaptureController()

    @State private var recorder: FrameRecorder?
    @State private var sessionId: String?
    @State private var starting = true
    @State private var startError: String?
    @State private var ending = false

    var body: some View {
        Group {
            if !CaptureController.arSupported {
                ContentUnavailableView {
                    Label("AR is not available here", systemImage: "camera.metering.unknown")
                } description: {
                    Text("This device cannot run AR world tracking, so the capture walk needs a real iPhone.")
                }
            } else if let startError {
                ContentUnavailableView {
                    Label("Could not start", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(startError)
                } actions: {
                    Button("Try again") {
                        self.startError = nil
                        starting = true
                        Task { await begin() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                captureBody
            }
        }
        .navigationTitle("Capture")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(controller.recording)
        .task {
            await begin()
        }
        .onDisappear {
            controller.stop()
        }
    }

    private var captureBody: some View {
        ZStack {
            ARViewContainer(controller: controller)
                .ignoresSafeArea()

            VStack {
                VStack(spacing: 6) {
                    Text(controller.status)
                        .font(.subheadline.weight(.medium))
                        .multilineTextAlignment(.center)
                    if let hint = controller.hint {
                        Text(hint)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let warning = controller.warning {
                        Text(warning)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding()

                Spacer()

                HStack {
                    if controller.recording {
                        Label("\(controller.recordedFrames) frames", systemImage: "record.circle")
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.red)
                    }
                    Spacer()
                    if controller.recording {
                        Button {
                            endCapture()
                        } label: {
                            Text(controller.reachedStart ? "Finish capture" : "End capture early")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(ending)
                    }
                }
                .padding(12)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding()
            }

            if starting {
                ProgressView("Opening capture session")
                    .padding(20)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func begin() async {
        guard CaptureController.arSupported, sessionId == nil else {
            starting = false
            return
        }
        guard let client = settings.client, let place = model.place else {
            starting = false
            startError = APIError.notConfigured.errorDescription
            return
        }
        let id = SessionID.make()
        let device = DeviceIdentity.info
        let footprint = model.confirmedFootprint
        let request = SessionCreateRequest(
            contractVersion: 1,
            sessionId: id,
            address: place.address,
            placeId: place.placeId,
            lat: place.lat,
            lng: place.lng,
            footprint: footprint.map { $0.map { [$0.lat, $0.lng] } },
            device: device
        )
        do {
            try await client.createSession(request)
        } catch {
            starting = false
            startError = (error as? LocalizedError)?.errorDescription
                ?? "Could not open a capture session."
            return
        }
        do {
            let rec = try FrameRecorder(sessionId: id)
            rec.onChunkReady = { chunk in
                UploadManager.shared.enqueue(chunk)
            }
            rec.onFrameRecorded = { count in
                controller.recordedFrames = count
            }
            rec.writeMeta(address: place.address, lat: place.lat, lng: place.lng,
                          footprint: footprint, plan: model.lapPlan, device: device)
            UploadManager.shared.startSession(id: id, address: place.address)
            sessionId = id
            recorder = rec
            controller.start(plan: model.lapPlan, recorder: rec)
            starting = false
        } catch {
            starting = false
            startError = "Could not set up local recording storage on this phone."
        }
    }

    private func endCapture() {
        guard let recorder else { return }
        ending = true
        controller.stop()
        recorder.finish { _ in
            UploadManager.shared.kick()
            ending = false
            model.path.append(.uploads)
        }
    }
}
