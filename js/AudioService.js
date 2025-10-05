// --- START OF FILE js/AudioService.js ---

export class AudioService {
    constructor(onStateChange, onProgress, onEnded, onError) {
        this.audio = document.getElementById('audio-player');
        this.audioContext = null;
        this.gainNode = null;
        this.audioSource = null;
        this.audioContextInitialized = false;

        // Callbacks to notify Player
        this.onStateChange = onStateChange;
        this.onProgress = onProgress;
        this.onEnded = onEnded;
        this.onError = onError;

        // Preloading logic is removed for stability
        
        this._bindAudioEvents();
    }

    _bindAudioEvents() {
        this.audio.addEventListener('play', () => this.onStateChange(true));
        this.audio.addEventListener('pause', () => this.onStateChange(false));
        this.audio.addEventListener('ended', () => this.onEnded());
        this.audio.addEventListener('error', () => this.onError());
        this.audio.addEventListener('timeupdate', () => this._handleProgress());
        this.audio.addEventListener('loadedmetadata', () => this._handleProgress());
        this.audio.addEventListener('progress', () => this._handleProgress());
    }

    _handleProgress() {
        const { currentTime, duration, buffered } = this.audio;
        let bufferedPercent = 0;
        if (duration > 0 && buffered.length > 0) {
            bufferedPercent = buffered.end(buffered.length - 1) / duration;
        }
        this.onProgress(currentTime, duration, bufferedPercent);
    }
    
    _initWebAudio() {
        if (this.audioContextInitialized) return;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioSource = this.audioContext.createMediaElementSource(this.audio);
        this.gainNode = this.audioContext.createGain();
        this.audioSource.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.audio.volume = 1; // Control volume via GainNode only
        this.audioContextInitialized = true;
    }
    
    loadTrack(trackSrc) {
        // Caching and preloading are removed
        this.audio.src = trackSrc;
    }

    play() {
        if (!this.audioContextInitialized) this._initWebAudio();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        this.audio.play().catch(e => console.error("Playback failed:", e));
    }
    
    pause() { this.audio.pause(); }
    seek(delta) { this.audio.currentTime = Math.max(0, this.audio.currentTime + delta); }
    seekTo(time) { if (!isNaN(time)) this.audio.currentTime = time; }
    setVolume(value) {
        if (!this.audioContextInitialized) this._initWebAudio();
        this.gainNode.gain.setValueAtTime(value / 100, this.audioContext.currentTime);
    }
    setPlaybackRate(rate) { this.audio.playbackRate = rate; }
    getCurrentSrc() { return this.audio.src; }
}
// --- END OF FILE js/AudioService.js ---