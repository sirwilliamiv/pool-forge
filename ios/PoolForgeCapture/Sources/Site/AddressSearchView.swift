import SwiftUI

struct AddressSearchView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var model: AppModel
    @StateObject private var location = LocationProvider()

    @State private var query = ""
    @State private var suggestions: [PlaceSuggestion] = []
    @State private var searchTask: Task<Void, Never>?
    @State private var sessionToken = UUID().uuidString
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                TextField("Street address", text: $query)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .onChange(of: query) { _, newValue in
                        scheduleSearch(newValue)
                    }
                Button {
                    useCurrentLocation()
                } label: {
                    Label("Use current location", systemImage: "location")
                }
                .disabled(busy)
            } footer: {
                Text("Find the property, confirm the building footprint, then walk the lap.")
            }

            if !suggestions.isEmpty {
                Section("Matches") {
                    ForEach(suggestions) { suggestion in
                        Button {
                            select(suggestion)
                        } label: {
                            Text(suggestion.description)
                                .foregroundStyle(.primary)
                        }
                        .disabled(busy)
                    }
                }
            }
        }
        .overlay {
            if busy {
                ProgressView()
            }
        }
        .alert("Cannot continue", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    private func scheduleSearch(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else {
            suggestions = []
            return
        }
        guard let client = settings.client else { return }
        let token = sessionToken
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            do {
                let results = try await client.autocomplete(query: trimmed, session: token)
                guard !Task.isCancelled else { return }
                await MainActor.run { suggestions = results }
            } catch is CancellationError {
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run { errorMessage = friendly(error) }
            }
        }
    }

    private func select(_ suggestion: PlaceSuggestion) {
        guard let client = settings.client else {
            errorMessage = APIError.notConfigured.errorDescription
            return
        }
        busy = true
        let token = sessionToken
        Task {
            defer { Task { @MainActor in busy = false } }
            do {
                let place = try await client.place(placeId: suggestion.placeId, session: token)
                await MainActor.run {
                    model.place = place
                    model.confirmedFootprint = place.footprintLatLng
                    sessionToken = UUID().uuidString
                    suggestions = []
                    query = place.address
                    model.path.append(.siteConfirm)
                }
            } catch {
                await MainActor.run { errorMessage = friendly(error) }
            }
        }
    }

    private func useCurrentLocation() {
        guard let client = settings.client else {
            errorMessage = APIError.notConfigured.errorDescription
            return
        }
        busy = true
        Task {
            defer { Task { @MainActor in busy = false } }
            do {
                let coord = try await location.current()
                guard let place = try await client.reverse(
                    lat: coord.latitude, lng: coord.longitude, session: sessionToken
                ) else {
                    await MainActor.run {
                        errorMessage = "No street address was found here. Type the address instead."
                    }
                    return
                }
                await MainActor.run {
                    model.place = place
                    model.confirmedFootprint = place.footprintLatLng
                    query = place.address
                    model.path.append(.siteConfirm)
                }
            } catch {
                await MainActor.run { errorMessage = friendly(error) }
            }
        }
    }

    private func friendly(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription
            ?? APIError.network.errorDescription
            ?? "Something went wrong."
    }
}
