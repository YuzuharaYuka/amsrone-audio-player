// --- START OF FILE js/Player.js ---

import * as pako from 'https://esm.sh/pako@2.1.0';
// 增强：引入新的带回退功能的图片加载器
import { reconstructUrl, loadImageWithFallback } from './utils.js';
import { UIManager } from './UIManager.js';
import { AudioService } from './AudioService.js';
import { EventHandler } from './EventHandler.js';

export class Player {
    constructor() {
        this.state = {
            tracks: [], currentIndex: -1, isPlaying: false,
            duration: 0, currentTime: 0,
            sleepTimerId: null, sleepTimerRemaining: 0, 
            currentVolume: 100, isMuted: false, preMuteVolume: 100,
            playMode: 'sequential', errorTracks: new Set(),
        };
        this.PLAY_MODES = ['sequential', 'repeat_list', 'repeat_one', 'shuffle'];

        this.ui = new UIManager();
        this.audio = new AudioService(
            this.handleAudioStateChange,
            this.handleAudioProgress,
            this.handleTrackEnd,
            this.handleAudioError
        );
        this.events = new EventHandler(this, this.ui);
        
        this._init();
    }

    _init() {
        this.ui.applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        this.ui.setupIcons();
        this.ui.updatePlayModeUI(this.state.playMode);
        this.ui.updateVolumeUI(this.state.currentVolume);
        this.events.bindEventListeners();
        this._parseDataFromURL();
    }
    
    async _parseDataFromURL() {
         try {
            const params = new URLSearchParams(window.location.search);
            const payloadParam = params.get('p');
            if (!payloadParam) { return this.ui.updateStatus('未提供播放数据'); }

            const base64 = payloadParam.replace(/-/g, '+').replace(/_/g, '/');
            const compressed = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            
            const jsonString = pako.inflate(compressed, { to: 'string' });
            const data = JSON.parse(jsonString);

            // --- V12 PAYLOAD IMPLEMENTATION (with backward compatibility) ---
            if (Array.isArray(data)) {
                // V12 Payload (Array format)
                const [workTitle, rjCode_b36, compressedCover, compressedBase, tracksData] = data;
                
                // 1. 立即更新文本信息
                this.ui.updateWorkInfo({
                    title: workTitle,
                    rjCode: 'RJ' + String(parseInt(rjCode_b36, 36)).padStart(8, '0'),
                });

                // 2. 异步加载封面，并使用回退机制
                loadImageWithFallback(compressedCover)
                    .then(url => this.ui.updateCoverArt(url))
                    .catch(err => console.error(err.message));

                const baseUrl = reconstructUrl(compressedBase);
                this.state.tracks = tracksData.map(trackArr => ({
                    src: baseUrl + encodeURIComponent(trackArr[0]),
                    title: trackArr[1]
                }));

            } else {
                // V10/V11 Payload (Object format) - Fallback for old links
                this.ui.updateWorkInfo({
                    title: data.w,
                    rjCode: 'RJ' + String(parseInt(data.r, 36)).padStart(8, '0'),
                    coverUrl: reconstructUrl(data.c), // 旧版直接重构URL
                });

                if (!data.t || !Array.isArray(data.t)) throw new Error('音轨数据格式不正确');

                if (data.b) { // V11
                    this.state.tracks = data.t.map(trackArr => ({
                        src: data.b + encodeURIComponent(trackArr[0]),
                        title: trackArr[1] 
                    }));
                } else { // V10
                    this.state.tracks = data.t.map(trackArr => ({
                        src: reconstructUrl(trackArr[0]), 
                        title: trackArr[1] 
                    }));
                }
            }
            // --- END OF IMPLEMENTATION ---
            
            this.ui.buildPlaylist(this.state.tracks);
            this.loadTrack(0);

        } catch (e) {
            this.ui.updateStatus('加载播放列表失败，链接可能已损坏');
            console.error("Payload processing error:", e);
        }
    }

    loadTrack = (index, autoPlay = false) => {
        if (index < 0 || index >= this.state.tracks.length) return;
        
        this.state.currentIndex = index;
        const track = this.state.tracks[index];
        
        this.audio.loadTrack(track.src);
        this.ui.updateCurrentTrackTitle(track.title);
        this.ui.setActiveTrack(index, this.state.errorTracks);
        
        if (autoPlay) this.audio.play();
    }

    togglePlayPause = () => {
        if (this.state.isPlaying) this.audio.pause(); else this.audio.play();
    }
    
    // --- Event Handlers from AudioService ---
    handleAudioStateChange = (isPlaying) => {
        this.state.isPlaying = isPlaying;
        this.ui.updatePlayPauseUI(isPlaying);
        const statusText = `(音轨 ${this.state.currentIndex + 1}/${this.state.tracks.length})`;
        this.ui.updateStatus(isPlaying ? `播放中... ${statusText}` : `已暂停 ${statusText}`);
    }

    handleAudioProgress = (currentTime, duration, bufferedPercent) => {
        this.state.currentTime = currentTime;
        this.state.duration = duration;
        this.ui.updateProgress(currentTime, duration, bufferedPercent);
    }
    
    handleTrackEnd = () => {
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
                else { this.audio.pause(); }
                break;
            case 'repeat_list': this.nextTrack(); break;
        }
    }

    handleAudioError = () => {
        this.ui.updateStatus(`音轨 ${this.state.currentIndex + 1} 加载失败, 3秒后尝试下一首...`);
        this.state.errorTracks.add(this.state.currentIndex);
        this.ui.setActiveTrack(this.state.currentIndex, this.state.errorTracks);
        
        if (this.state.errorTracks.size >= this.state.tracks.length) {
            return this.ui.updateStatus('所有音轨均加载失败，请检查链接或网络。');
        }
        
        setTimeout(() => {
            let nextIndex = (this.state.currentIndex + 1) % this.state.tracks.length;
            while(this.state.errorTracks.has(nextIndex) && nextIndex !== this.state.currentIndex) {
                nextIndex = (nextIndex + 1) % this.state.tracks.length;
            }
            this.loadTrack(nextIndex, true);
        }, 3000);
    }

    // --- User Actions ---
    nextTrack = () => { this.loadTrack((this.state.currentIndex + 1) % this.state.tracks.length, this.state.isPlaying); }
    prevTrack = () => { this.loadTrack((this.state.currentIndex - 1 + this.state.tracks.length) % this.state.tracks.length, this.state.isPlaying); }
    seek = (delta) => { this.audio.seek(delta); }
    seekTo = (time) => { this.audio.seekTo(time); }
    setPlaybackRate = (rate) => { this.audio.setPlaybackRate(rate); }
    
    setVolume = (value) => {
        this.state.currentVolume = value;
        this.state.isMuted = value === 0;
        this.audio.setVolume(value);
        this.ui.updateVolumeUI(value);
    }

    toggleMute = () => {
        if (this.state.isMuted) {
            const volumeToRestore = this.state.preMuteVolume > 0 ? this.state.preMuteVolume : 100;
            this.setVolume(volumeToRestore);
        } else {
            this.state.preMuteVolume = this.state.currentVolume;
            this.setVolume(0);
        }
    }

    cyclePlayMode = () => {
        const currentModeIndex = this.PLAY_MODES.indexOf(this.state.playMode);
        this.state.playMode = this.PLAY_MODES[(currentModeIndex + 1) % this.PLAY_MODES.length];
        this.ui.updatePlayModeUI(this.state.playMode);
    }

    downloadCurrentTrack = () => {
        if (this.state.currentIndex < 0) return;
        const { title } = this.state.tracks[this.state.currentIndex];
        const src = this.audio.getCurrentSrc();
        const a = document.createElement('a');
        a.href = src; a.download = title || 'audio.wav';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    setSleepTimer = (minutes) => {
        if (this.state.sleepTimerId) clearInterval(this.state.sleepTimerId);
        if (minutes <= 0) {
            this.state.sleepTimerRemaining = 0;
            this.ui.updateSleepTimerDisplay(0);
            return;
        }

        this.state.sleepTimerRemaining = minutes * 60;
        this.ui.updateSleepTimerDisplay(this.state.sleepTimerRemaining);
        
        this.state.sleepTimerId = setInterval(() => {
            this.state.sleepTimerRemaining--;
            this.ui.updateSleepTimerDisplay(this.state.sleepTimerRemaining);
            if (this.state.sleepTimerRemaining <= 0) {
                this.audio.pause();
                clearInterval(this.state.sleepTimerId);
            }
        }, 1000);
    }
}
// --- END OF FILE js/Player.js ---