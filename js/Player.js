import { ICONS, URL_DICTIONARY } from './constants.js';

export class Player {
    constructor() {
        this.elements = {};
        this.state = {
            tracks: [], currentIndex: -1, isPlaying: false, isSeeking: false,
            sleepTimerId: null, sleepTimerRemaining: 0, 
            currentVolume: 100, isMuted: false, preMuteVolume: 100,
            playMode: 'sequential', errorTracks: new Set(),
            isPreloading: false,
            preloadAbortController: null,
            trackCache: new Map(),
            currentObjectUrl: null,
        };
        this.PLAY_MODES = ['sequential', 'repeat_list', 'repeat_one', 'shuffle'];
        this.audioContext = null; this.gainNode = null; this.audioSource = null;
        this.audioContextInitialized = false;

        this._cacheDOMElements();
        this.audio = this.elements.audio;
        this._init();
    }

    _init() {
        this._applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        this._parseDataFromURL();
        this._setupIcons();
        this._bindEventListeners();
        this._updateVolumeUI();
    }
    
    _cacheDOMElements() {
        const $ = (id) => document.getElementById(id);
        this.elements = {
            progressBuffered: $('progress-buffered'),
            backgroundArt: $('background-art'), status: $('status'), workTitle: $('work-title'),
            coverArt: $('cover-art'), rjCode: $('rj-code-display'), currentTrackTitle: $('current-track-title'),
            audio: $('audio-player'), playlist: $('playlist'), prevBtn: $('prev-track'), nextBtn: $('next-track'),
            rewindBtn: $('rewind-btn'), forwardBtn: $('forward-btn'), rateSelector: $('playback-rate'),
            themeToggleBtn: $('theme-toggle'), downloadBtn: $('download-track'), playPauseBtn: $('play-pause-btn'),
            playIcon: $('play-icon'), pauseIcon: $('pause-icon'), progressContainer: $('progress-bar-container'),
            progressFilled: $('progress-filled'), currentTime: $('current-time'), totalDuration: $('total-duration'),
            playModeBtn: $('play-mode-btn'), sleepTimerSelect: $('sleep-timer-select'), sleepTimerDisplay: $('sleep-timer-display'),
            volumeBtn: $('volume-btn'), volumeSlider: $('volume-slider'),
            customTimerModal: $('custom-timer-modal'), customTimerInput: $('custom-timer-input'),
            customTimerSetBtn: $('custom-timer-set'), customTimerCancelBtn: $('custom-timer-cancel'),
        };
    }

    // --- 修复：更健壮的 URL 重组函数 ---
    _reconstructUrl(data) {
        if (typeof data === 'string') {
            return URL_DICTIONARY[data] || data;
        }
        if (Array.isArray(data)) {
            return data.map(part => this._reconstructUrl(part)).join('');
        }
        return '';
    }

    // --- 修复：集中处理 URL 解析 ---
    _parseDataFromURL() {
         try {
            const params = new URLSearchParams(window.location.search);
            const payloadParam = params.get('p');
            if (payloadParam) {
                const base64 = payloadParam.replace(/-/g, '+').replace(/_/g, '/');
                const compressed = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const jsonString = pako.inflate(compressed, { to: 'string' });
                const data = JSON.parse(jsonString);

                // 1. 集中解码所有 URL
                const baseUrl = this._reconstructUrl(data.b || '');
                const fullCoverUrl = this._reconstructUrl(data.c || '');
                const rjNum = parseInt(data.r, 36);
                const fullRjCode = 'RJ' + String(rjNum).padStart(8, '0');

                // 2. 将最终结果传递给 UI 更新函数
                this._updateWorkInfo({
                    title: data.w,
                    rjCode: fullRjCode,
                    coverUrl: fullCoverUrl,
                });
                
                if (data.t && Array.isArray(data.t)) {
                    // 3. 使用解码后的 baseUrl 构建音轨列表
                    this.state.tracks = data.t.map(trackArr => ({
                        src: baseUrl + trackArr[0], 
                        title: trackArr[1] 
                    }));
                    this._buildPlaylist();
                    this.loadTrack(0);
                } else { throw new Error('Payload中音轨数据格式不正确'); }
            } else { this._setError('未提供播放数据'); }
        } catch (e) {
            this._setError('加载播放列表失败，链接可能已损坏');
            console.error("Payload processing error:", e);
        }
    }

    // --- 修复：简化为纯粹的 UI 更新函数 ---
    _updateWorkInfo({ title, rjCode, coverUrl }) {
        if (coverUrl) {
            this.elements.coverArt.src = coverUrl;
            this.elements.backgroundArt.style.backgroundImage = `url(${coverUrl})`;
            this.elements.backgroundArt.style.opacity = '1';
        }
        if (title) {
            this.elements.workTitle.textContent = title;
            document.title = `${title} | ASMR ONE Player`;
        }
        if (rjCode) {
            this.elements.rjCode.textContent = rjCode;
        }
    }
    
    // ( ... 其余所有方法保持不变 ... )
    _bindEventListeners() {
        this.audio.addEventListener('play', () => {
            this._updatePlayPauseUI(true);
            this._triggerPreload();
        });
        this.audio.addEventListener('progress', this._updateBufferProgress);
        this.audio.addEventListener('ended', this._handleTrackEnd);
        this.audio.addEventListener('timeupdate', this._updateProgress);
        this.audio.addEventListener('loadedmetadata', this._updateProgress);
        this.audio.addEventListener('error', this._handleAudioError);
        
        this.elements.playPauseBtn.addEventListener('click', this.togglePlayPause);
        this.elements.prevBtn.addEventListener('click', this.prevTrack);
        this.elements.nextBtn.addEventListener('click', this.nextTrack);
        this.elements.rewindBtn.addEventListener('click', () => this.seek(-10));
        this.elements.forwardBtn.addEventListener('click', () => this.seek(10));
        this.elements.rateSelector.addEventListener('change', (e) => this.audio.playbackRate = parseFloat(e.target.value));
        this.elements.downloadBtn.addEventListener('click', this._downloadCurrentTrack);
        this.elements.themeToggleBtn.addEventListener('click', () => this._applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
        this.elements.playModeBtn.addEventListener('click', this._cyclePlayMode);
        this.elements.sleepTimerSelect.addEventListener('change', this._handleSleepTimerChange);
        this.elements.volumeBtn.addEventListener('click', this._toggleMute);
        this.elements.volumeSlider.addEventListener('input', (e) => this._setVolume(e.target.value));
        this.elements.playlist.addEventListener('click', this._handlePlaylistClick);
        this.elements.progressContainer.addEventListener('mousedown', this._startSeek);
        window.addEventListener('mousemove', this._seeking);
        window.addEventListener('mouseup', this._endSeek);
        window.addEventListener('keydown', this._handleKeyDown);
        this.elements.customTimerSetBtn.addEventListener('click', this._handleCustomTimerSet);
        this.elements.customTimerCancelBtn.addEventListener('click', this._hideCustomTimerModal);
    }
    togglePlayPause = () => {
        if (!this.audioContextInitialized) this._initWebAudio();
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        if (this.state.isPlaying) {
            this.audio.pause();
            this._updatePlayPauseUI(false);
        } else {
            this.audio.play();
        }
    }
    _initWebAudio() {
        if (this.audioContextInitialized) return;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioSource = this.audioContext.createMediaElementSource(this.audio);
        this.gainNode = this.audioContext.createGain();
        this.audioSource.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
        this.audio.volume = 1;
        this._setVolume(this.state.currentVolume);
        this.audioContextInitialized = true;
    }
    _setVolume(value) {
        const newVolume = parseInt(value, 10);
        this.state.currentVolume = newVolume;
        if (this.audioContextInitialized) { this.gainNode.gain.value = newVolume / 100; }
        if (newVolume > 0) { this.state.isMuted = false; }
        this._updateVolumeUI();
    }
    _toggleMute = () => {
        if (this.state.isMuted) {
            const volumeToRestore = this.state.preMuteVolume > 0 ? this.state.preMuteVolume : 100;
            this._setVolume(volumeToRestore);
            this.state.isMuted = false;
        } else {
            this.state.preMuteVolume = this.state.currentVolume;
            this._setVolume(0);
            this.state.isMuted = true;
        }
    }
    _updateVolumeUI = () => {
        this.elements.volumeSlider.value = this.state.currentVolume;
        if (this.state.currentVolume === 0) { this.elements.volumeBtn.innerHTML = ICONS.volume.off; } 
        else if (this.state.currentVolume < 50) { this.elements.volumeBtn.innerHTML = ICONS.volume.low; } 
        else { this.elements.volumeBtn.innerHTML = ICONS.volume.high; }
    }
    loadTrack(index, autoPlay = false) {
        if (index < 0 || index >= this.state.tracks.length) return;
        this._abortPreload();
        this.state.currentIndex = index;
        const titleEl = this.elements.currentTrackTitle;
        titleEl.classList.add('is-changing');
        setTimeout(() => {
            titleEl.textContent = this.state.tracks[index].title;
            titleEl.classList.remove('is-changing');
        }, 150);
        if (this.state.currentObjectUrl) {
            URL.revokeObjectURL(this.state.currentObjectUrl);
            this.state.currentObjectUrl = null;
        }
        if (this.state.trackCache.has(index)) {
            const blob = this.state.trackCache.get(index);
            const objectUrl = URL.createObjectURL(blob);
            this.state.currentObjectUrl = objectUrl;
            this.audio.src = objectUrl;
            this.elements.progressBuffered.style.width = '100%'; 
            console.log(`Track ${index+1} loaded from cache.`);
        } else {
            this.audio.src = this.state.tracks[index].src;
            this.elements.progressBuffered.style.width = '0%';
            console.log(`Track ${index+1} loaded from network.`);
        }
        this._updatePlaylistActive();
        if (autoPlay) {
            if (!this.audioContextInitialized) this._initWebAudio();
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
            this.audio.play().catch(e => console.error("Playback failed:", e));
        }
    }
    _triggerPreload() {
        setTimeout(() => {
            if (this.state.isPlaying) {
                this._preloadNextTrack();
            }
        }, 2000);
    }
    _abortPreload() {
        if (this.state.isPreloading && this.state.preloadAbortController) {
            this.state.preloadAbortController.abort();
        }
    }
    async _preloadNextTrack() {
        if (this.state.isPreloading) return;
        let nextIndex = -1;
        if (this.state.playMode === 'sequential' || this.state.playMode === 'repeat_list') {
            nextIndex = (this.state.currentIndex + 1) % this.state.tracks.length;
        }
        if (nextIndex === -1 || this.state.trackCache.has(nextIndex) || this.state.errorTracks.has(nextIndex)) {
            return;
        }
        this.state.isPreloading = true;
        this.state.preloadAbortController = new AbortController();
        const nextTrack = this.state.tracks[nextIndex];
        console.log(`Preloading track ${nextIndex + 1}: ${nextTrack.title}`);
        try {
            const response = await fetch(nextTrack.src, { signal: this.state.preloadAbortController.signal });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            this.state.trackCache.clear();
            this.state.trackCache.set(nextIndex, blob);
            console.log(`Track ${nextIndex + 1} successfully preloaded and cached.`);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(`Failed to preload track ${nextIndex + 1}:`, error);
            }
        } finally {
            this.state.isPreloading = false;
            this.state.preloadAbortController = null;
        }
    }
    _updateBufferProgress = () => {
        const audio = this.audio;
        if (audio.duration > 0 && audio.buffered.length > 0) {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const bufferedPercent = (bufferedEnd / audio.duration) * 100;
            this.elements.progressBuffered.style.width = `${bufferedPercent}%`;
        }
    }
    _updateProgress = () => {
        this._updateBufferProgress();
        const { duration, currentTime } = this.audio;
        if (!isNaN(duration)) {
            this.elements.progressFilled.style.width = `${(currentTime / duration) * 100}%`;
            this.elements.currentTime.textContent = this._formatTime(currentTime);
            this.elements.totalDuration.textContent = this._formatTime(duration);
        }
    }
    nextTrack = () => { this.loadTrack((this.state.currentIndex + 1) % this.state.tracks.length, this.state.isPlaying); }
    prevTrack = () => { this.loadTrack((this.state.currentIndex - 1 + this.state.tracks.length) % this.state.tracks.length, this.state.isPlaying); }
    seek = (delta) => { this.audio.currentTime = Math.max(0, this.audio.currentTime + delta); }
    _handleTrackEnd = () => {
        switch (this.state.playMode) {
            case 'repeat_one': this.audio.play(); break;
            case 'shuffle':
                let newIndex;
                if (this.state.tracks.length <= 1) { newIndex = 0; }
                else { do { newIndex = Math.floor(Math.random() * this.state.tracks.length); } while (newIndex === this.state.currentIndex); }
                this.loadTrack(newIndex, true);
                break;
            case 'sequential':
                if (this.state.currentIndex < this.state.tracks.length - 1) { this.nextTrack(); }
                else { this._updatePlayPauseUI(false); }
                break;
            case 'repeat_list': this.nextTrack(); break;
        }
    }
    _buildPlaylist() {
        this.elements.playlist.innerHTML = this.state.tracks.map((track, i) => `<li data-index="${i}"><span class="track-index">${i + 1}.</span><span class="track-title">${track.title}</span></li>`).join('');
    }
    _updatePlaylistActive() {
         this.elements.playlist.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === this.state.currentIndex));
    }
    _updatePlayPauseUI = (playing) => {
        this.state.isPlaying = playing;
        this.elements.playIcon.style.display = this.state.isPlaying ? 'none' : 'block';
        this.elements.pauseIcon.style.display = this.state.isPlaying ? 'block' : 'none';
        const statusText = `(音轨 ${this.state.currentIndex + 1}/${this.state.tracks.length})`;
        this.elements.status.textContent = this.state.isPlaying ? `播放中... ${statusText}` : `已暂停 ${statusText}`;
    }
    _updatePlayModeUI = () => {
        const mode = ICONS.playModes[this.state.playMode];
        this.elements.playModeBtn.innerHTML = mode.icon;
        this.elements.playModeBtn.title = mode.title;
    }
    _setupIcons() {
        this.elements.rewindBtn.innerHTML = ICONS.rewind;
        this.elements.forwardBtn.innerHTML = ICONS.forward;
        this.elements.prevBtn.innerHTML = ICONS.prev;
        this.elements.nextBtn.innerHTML = ICONS.next;
        this.elements.downloadBtn.innerHTML = ICONS.download;
        this._updatePlayModeUI();
    }
    _handlePlaylistClick = (e) => {
        const targetLi = e.target.closest('li');
        if (targetLi && !targetLi.classList.contains('track-error')) {
            const index = parseInt(targetLi.dataset.index, 10);
            this.loadTrack(index, true);
        }
    }
    _startSeek = (e) => { this.state.isSeeking = true; this._handleProgressSeek(e); }
    _seeking = (e) => { if (this.state.isSeeking) { this._handleProgressSeek(e); this._updateProgress(); } }
    _endSeek = () => { if (this.state.isSeeking) this.state.isSeeking = false; }
    _handleProgressSeek = (e) => {
        const rect = this.elements.progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = Math.max(0, Math.min(1, clickX / rect.width)) * this.audio.duration;
        if (!isNaN(newTime)) this.audio.currentTime = newTime;
    }
    _handleKeyDown = (e) => {
        if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.key === ' ') { e.preventDefault(); this.togglePlayPause(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.seek(10); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.seek(-10); }
    }
    _cyclePlayMode = () => {
        const currentModeIndex = this.PLAY_MODES.indexOf(this.state.playMode);
        this.state.playMode = this.PLAY_MODES[(currentModeIndex + 1) % this.PLAY_MODES.length];
        this._updatePlayModeUI();
    }
    _handleSleepTimerChange = (e) => {
        const minutes = parseInt(e.target.value, 10);
        if (minutes === -1) { this._showCustomTimerModal(); }
        else if (minutes > 0) { this._setSleepTimer(minutes); }
        else { this._clearSleepTimer(); }
    }
    _handleAudioError = () => {
        this._setError(`音轨 ${this.state.currentIndex + 1} 加载失败, 3秒后尝试下一首...`);
        this.state.errorTracks.add(this.state.currentIndex);
        const erroredLi = this.elements.playlist.querySelector(`li[data-index="${this.state.currentIndex}"]`);
        if (erroredLi) erroredLi.classList.add('track-error');
        if (this.state.errorTracks.size >= this.state.tracks.length) {
            this._setError('所有音轨均加载失败，请检查链接或网络。');
            return;
        }
        setTimeout(() => {
            let nextIndex = (this.state.currentIndex + 1) % this.state.tracks.length;
            while(this.state.errorTracks.has(nextIndex) && nextIndex !== this.state.currentIndex) {
                nextIndex = (nextIndex + 1) % this.state.tracks.length;
            }
            this.loadTrack(nextIndex, true);
        }, 3000);
    }
    _applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }
    _setError(msg) { this.elements.status.textContent = msg; }
    _formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const date = new Date(null); date.setSeconds(seconds);
        const isoString = date.toISOString();
        return seconds >= 3600 ? isoString.substr(11, 8) : isoString.substr(14, 5);
    }
    _downloadCurrentTrack = () => {
        if (this.state.currentIndex < 0) return;
        const { src, title } = this.state.tracks[this.state.currentIndex];
        const a = document.createElement('a'); a.href = this.audio.src; a.download = title || 'audio.wav';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    _setSleepTimer(minutes) {
        this._clearSleepTimer();
        this.state.sleepTimerRemaining = minutes * 60;
        this.state.sleepTimerId = setInterval(this._updateSleepTimerDisplay, 1000);
    }
    _clearSleepTimer() {
        if (this.state.sleepTimerId) { clearInterval(this.state.sleepTimerId); this.state.sleepTimerId = null; }
        this.elements.sleepTimerDisplay.textContent = '';
    }
    _updateSleepTimerDisplay = () => {
        if (this.state.sleepTimerRemaining <= 0) {
            this.audio.pause();
            this._updatePlayPauseUI(false);
            this.elements.sleepTimerSelect.value = "0";
            this._clearSleepTimer();
        } else {
            this.state.sleepTimerRemaining--;
            const mins = Math.floor(this.state.sleepTimerRemaining / 60);
            const secs = this.state.sleepTimerRemaining % 60;
            this.elements.sleepTimerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
    }
    _showCustomTimerModal = () => {
        this.elements.customTimerInput.value = '';
        this.elements.customTimerModal.classList.add('visible');
        this.elements.customTimerInput.focus();
    }
    _hideCustomTimerModal = () => {
        this.elements.customTimerModal.classList.remove('visible');
        if (this.elements.sleepTimerSelect.value === "-1") {
            this.elements.sleepTimerSelect.value = "0";
        }
    }
    _handleCustomTimerSet = () => {
        const minutes = parseInt(this.elements.customTimerInput.value, 10);
        if (!isNaN(minutes) && minutes > 0) {
            this._setSleepTimer(minutes);
            this._hideCustomTimerModal();
        } else {
            this.elements.customTimerInput.style.border = '1px solid red';
            setTimeout(() => { this.elements.customTimerInput.style.border = ''; }, 1500);
        }
    }
}