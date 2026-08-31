import Foundation
import AVFoundation
import UIKit

// Audio and haptic guidance, so the walker can keep the camera pointed at the
// yard instead of at the screen. Everything here is rate limited: a cue that
// fires continuously is noise, and noise gets muted.
//
// The audio session is only activated around an utterance and deactivated
// again afterwards, so background audio ducks for two seconds rather than
// staying ducked for the whole walk. ARWorldTrackingConfiguration does not
// request audio (providesAudioData is never set), so nothing here contends
// with the ARSession.

final class CaptureFeedback: NSObject, AVSpeechSynthesizerDelegate {
    /// Voice can be muted; haptics always stay on.
    var voiceEnabled: Bool = true

    private let synthesizer = AVSpeechSynthesizer()
    private let audioQueue = DispatchQueue(label: "com.poolforge.capture.voice")
    private let impact = UIImpactFeedbackGenerator(style: .medium)
    private let notify = UINotificationFeedbackGenerator()

    /// One utterance at a time, and never two inside this window.
    private var speechThrottle = CueThrottle(interval: 2.5)
    /// Floor between any two direction cues, so turning on the spot cannot
    /// produce a stream of left/ahead/right.
    private var directionFloor = CueThrottle(interval: 6)
    /// Longer cooldown for repeating a direction that has not changed.
    private var directionThrottle = CueThrottle(interval: 14)
    private var tiltSpeechThrottle = CueThrottle(interval: 12)
    private var tiltHaptic = SustainedConditionAlarm(holdSeconds: 3, repeatInterval: 5)

    private var audioActive = false
    private var lastSpokenDirection: GuidanceMath.RelativeDirection?

    override init() {
        super.init()
        synthesizer.delegate = self
        impact.prepare()
        notify.prepare()
    }

    /// Cheap enough to call on every frame; the generators cache their state.
    func prepareHaptics() {
        impact.prepare()
        notify.prepare()
    }

    // MARK: cues

    func waypointReached(remaining: Int) {
        impact.impactOccurred()
        impact.prepare()
        _ = speak(remaining > 0 ? "marker reached" : "last marker reached", at: now)
        // A new leg starts, so the direction cue may repeat straight away.
        directionThrottle.reset()
        directionFloor.reset()
        lastSpokenDirection = nil
    }

    func announceDirection(_ direction: GuidanceMath.RelativeDirection) {
        let t = now
        if direction == lastSpokenDirection {
            // Same direction as last time: only repeat after the long cooldown.
            guard directionThrottle.allow(at: t) else { return }
        } else {
            guard directionFloor.allow(at: t) else { return }
            directionThrottle.reset()
            _ = directionThrottle.allow(at: t)
        }
        // Only remember it as said if it actually got said.
        if speak(direction.spoken, at: t) {
            lastSpokenDirection = direction
        } else {
            directionThrottle.reset()
            directionFloor.reset()
        }
    }

    /// Feed every frame. Fires the haptic pulse once the tilt has been out of
    /// band continuously for three seconds, at most once every five.
    func updateTilt(state: GuidanceMath.TiltState) {
        let t = now
        if tiltHaptic.update(conditionHolds: !state.isInBand, at: t) {
            notify.notificationOccurred(.warning)
            notify.prepare()
            if let phrase = GuidanceMath.tiltSpoken(state), tiltSpeechThrottle.allow(at: t) {
                _ = speak(phrase, at: t)
            }
        }
    }

    func returnLegStarted() {
        impact.impactOccurred()
        impact.prepare()
        _ = speak("head back to the start", at: now)
    }

    func captureComplete() {
        notify.notificationOccurred(.success)
        notify.prepare()
        _ = speak("back at the start", at: now)
    }

    func lapStarted() {
        _ = speak("walk to the first marker", at: now)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        deactivateAudio()
    }

    // MARK: speech plumbing

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }

    @discardableResult
    private func speak(_ text: String, at t: TimeInterval) -> Bool {
        guard voiceEnabled else { return false }
        // Never talk over ourselves: drop the cue rather than queue it.
        guard !synthesizer.isSpeaking else { return false }
        guard speechThrottle.allow(at: t) else { return false }
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.volume = 1
        utterance.postUtteranceDelay = 0
        audioQueue.async { [weak self] in
            self?.activateAudio()
            DispatchQueue.main.async { [weak self] in
                guard let self, self.voiceEnabled else { return }
                self.synthesizer.speak(utterance)
            }
        }
        return true
    }

    /// Ducks other audio rather than stopping it, and mixes so nothing else on
    /// the phone is interrupted by a two word cue.
    private func activateAudio() {
        guard !audioActive else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .voicePrompt,
                                    options: [.duckOthers, .mixWithOthers])
            try session.setActive(true)
            audioActive = true
        } catch {
            audioActive = false
        }
    }

    private func deactivateAudio() {
        audioQueue.async { [weak self] in
            guard let self, self.audioActive else { return }
            self.audioActive = false
            try? AVAudioSession.sharedInstance()
                .setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didFinish utterance: AVSpeechUtterance) {
        deactivateAudio()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didCancel utterance: AVSpeechUtterance) {
        deactivateAudio()
    }
}
