// One session clock and loop position; views own rendering, never separate time.
import { PlaybackClock } from './three-d-core.js';

export class CoachingSession {
    constructor() {
        this.clock = new PlaybackClock();
        this.holdSeconds = 1;
        this.owner = 'guided';
        this.intentRevision = 0;
        this.intentPlaying = false;
        this.scrub = null;
        this.reset(0);
    }
    get playing() { return this.intentPlaying; }
    // Compatibility for saved viewer preferences and older diagnostic callers.
    // Playback policy is unconditional and this value cannot be disabled.
    get loop() { return true; }
    set loop(_value) { /* Restored legacy viewer preference is intentionally ignored. */ }
    reset(duration) {
        this.clock.pause();
        this.clock.restart();
        this.duration = Math.max(0, duration);
        this.holding = false;
        this.holdElapsed = 0;
        this.iteration = 0;
        this.complete = false;
        this.intentPlaying = false;
        this.scrub = null;
        this.intentRevision += 1;
    }
    seek(seconds, { preserveIntent = false, timestamp = performance.now() } = {}) {
        const resume = preserveIntent && this.intentPlaying && this.duration > 0;
        this.clock.pause();
        this.clock.elapsed = Math.max(0, Math.min(this.duration, seconds));
        this.holding = false;
        this.holdElapsed = 0;
        this.complete = false;
        if (!preserveIntent) {
            this.intentPlaying = false;
            this.intentRevision += 1;
        }
        if (resume && !this.scrub) this.clock.play(timestamp);
        return this.clock.elapsed;
    }
    play(timestamp = performance.now()) {
        if (this.duration <= 0) {
            this.pause(timestamp);
            return false;
        }
        if (!this.holding && this.clock.elapsed >= this.duration) {
            this.clock.pause();
            this.clock.elapsed = 0;
            this.holdElapsed = 0;
        }
        this.complete = false;
        this.intentPlaying = true;
        this.intentRevision += 1;
        if (!this.scrub) this.clock.play(timestamp);
        return true;
    }
    pause(timestamp = performance.now(), timeScale = 1) {
        // A held scene has no RAF; capture its consumed hold before cancelling wakeup.
        if (this.holding && this.clock.playing) this.tick(timestamp, timeScale);
        this.clock.pause();
        this.intentPlaying = false;
        this.intentRevision += 1;
        if (this.scrub) this.scrub.resume = false;
        return this.clock.elapsed;
    }
    // Legacy viewer calls may still arrive from restored documents. They do not
    // alter the owner-approved always-repeat playback contract.
    setLoop() { return true; }
    suspend(timestamp = performance.now(), timeScale = 1) {
        if (this.clock.playing) this.tick(timestamp, timeScale);
        const token = Object.freeze({ revision: this.intentRevision, resume: this.intentPlaying });
        this.clock.pause();
        return token;
    }
    resumeSuspension(token, timestamp = performance.now()) {
        if (!token || token.revision !== this.intentRevision || !token.resume || !this.intentPlaying || this.scrub) return false;
        this.clock.play(timestamp);
        return true;
    }
    beginScrub(id, timestamp = performance.now(), timeScale = 1) {
        if (id == null) return false;
        if (this.scrub && this.scrub.id !== id) this.cancelScrub(this.scrub.id);
        if (this.clock.playing) this.tick(timestamp, timeScale);
        this.clock.pause();
        this.scrub = { id, revision: this.intentRevision, resume: this.intentPlaying };
        return true;
    }
    scrubSeek(id, seconds) {
        if (!this.scrub || this.scrub.id !== id) return false;
        this.clock.elapsed = Math.max(0, Math.min(this.duration, Number(seconds) || 0));
        this.holding = false;
        this.holdElapsed = 0;
        this.complete = false;
        return this.clock.elapsed;
    }
    endScrub(id, timestamp = performance.now()) {
        if (!this.scrub || this.scrub.id !== id) return false;
        const operation = this.scrub;
        this.scrub = null;
        if (operation.resume && operation.revision === this.intentRevision && this.intentPlaying) this.clock.play(timestamp);
        return true;
    }
    cancelScrub(id) {
        if (!this.scrub || this.scrub.id !== id) return false;
        this.scrub = null;
        this.clock.pause();
        this.intentPlaying = false;
        this.intentRevision += 1;
        return true;
    }
    tick(timestamp, timeScale = 1) {
        if (!this.clock.playing) return this.clock.elapsed;
        const before = this.clock.elapsed;
        const delta = (this.clock.update(timestamp) - before) / Math.max(0.001, timeScale);
        let position = before + (this.holding ? this.holdElapsed : 0) + delta;
        if (this.duration <= 0) {
            this.clock.elapsed = 0;
            this.clock.pause();
            this.intentPlaying = false;
            return this.clock.elapsed;
        }
        const cycle = this.duration + this.holdSeconds;
        const crossed = Math.floor(position / cycle);
        if (crossed) { this.iteration += crossed; position %= cycle; }
        if (Math.abs(position) < 1e-9) position = 0;
        else if (cycle - position < 1e-9) { this.iteration += 1; position = 0; }
        this.holding = position >= this.duration;
        this.holdElapsed = Math.max(0, position - this.duration);
        this.clock.elapsed = Math.min(position, this.duration);
        return this.clock.elapsed;
    }
    remainingHoldMs(timeScale = 1) {
        return Math.max(0, this.holdSeconds - this.holdElapsed) * 1000 * timeScale / this.clock.playbackRate;
    }
}
