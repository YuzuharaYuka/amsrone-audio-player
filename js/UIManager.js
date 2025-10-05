// --- START OF FILE js/UIManager.js ---

import { ICONS } from './constants.js';
import { formatTime } from './utils.js';

export class UIManager {
    constructor() {
        this.elements = this._cacheDOMElements();
    }

    _cacheDOMElements() {
        const $ = (id) => document.getElementById(id);
        return {
            backgroundArt: $('background-art'), status: $('status'), workTitle: $('work-title'),
            coverArt: $('cover-art'), rjCode: $('rj-code-display'), currentTrackTitle: $('current-track-title'),
            playlist: $('playlist'), playPauseBtn: $('play-pause-btn'), playIcon: $('play-icon'), 
            pauseIcon: $('pause-icon'), progressContainer: $('progress-bar-container'),
            progressFilled: $('progress-filled'), progressBuffered: $('progress-buffered'),
            currentTime: $('current-time'), totalDuration: $('total-duration'),
            rewindBtn: $('rewind-btn'), forwardBtn: $('forward-btn'), prevBtn: $('prev-track'), 
            nextBtn: $('next-track'), downloadBtn: $('download-track'), playModeBtn: $('play-mode-btn'),
            volumeBtn: $('volume-btn'), volumeSlider: $('volume-slider'), 
            sleepTimerSelect: $('sleep-timer-select'), sleepTimerDisplay: $('sleep-timer-display'),
            themeToggleBtn: $('theme-toggle'), iconSun: $('icon-sun'), iconMoon: $('icon-moon'),
            customTimerModal: $('custom-timer-modal'), customTimerInput: $('custom-timer-input'),
            customTimerSetBtn: $('custom-timer-set'), customTimerCancelBtn: $('custom-timer-cancel'),
            // **FIX**: Add the missing rateSelector element.
            rateSelector: $('playback-rate'),
        };
    }

    setupIcons() {
        this.elements.rewindBtn.innerHTML = ICONS.rewind;
        this.elements.forwardBtn.innerHTML = ICONS.forward;
        this.elements.prevBtn.innerHTML = ICONS.prev;
        this.elements.nextBtn.innerHTML = ICONS.next;
        this.elements.downloadBtn.innerHTML = ICONS.download;
    }

    updateWorkInfo({ title, rjCode, coverUrl }) {
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

    updatePlayPauseUI(isPlaying) {
        this.elements.playIcon.classList.toggle('hidden', isPlaying);
        this.elements.pauseIcon.classList.toggle('hidden', !isPlaying);
    }

    updateStatus(text) {
        this.elements.status.textContent = text;
    }

    updateCurrentTrackTitle(title) {
        const titleEl = this.elements.currentTrackTitle;
        titleEl.classList.add('is-changing');
        setTimeout(() => {
            titleEl.textContent = title;
            titleEl.classList.remove('is-changing');
        }, 150);
    }
    
    updateProgress(currentTime, duration, buffered) {
        if (!isNaN(duration)) {
            this.elements.progressFilled.style.width = `${(currentTime / duration) * 100}%`;
            this.elements.currentTime.textContent = formatTime(currentTime);
            this.elements.totalDuration.textContent = formatTime(duration);
        }
        if (buffered) {
            this.elements.progressBuffered.style.width = `${buffered * 100}%`;
        }
    }

    buildPlaylist(tracks) {
        this.elements.playlist.innerHTML = tracks.map((track, i) => 
            `<li data-index="${i}"><span class="track-index">${i + 1}.</span><span class="track-title">${track.title}</span></li>`
        ).join('');
    }

    setActiveTrack(index, errorTracks) {
        this.elements.playlist.querySelectorAll('li').forEach((li, i) => {
            const isActive = i === index;
            const isError = errorTracks.has(i);
            li.classList.toggle('active', isActive);
            li.classList.toggle('track-error', isError);
            if(isError) li.title = "加载失败";
        });
    }

    updatePlayModeUI(playMode) {
        const mode = ICONS.playModes[playMode];
        this.elements.playModeBtn.innerHTML = mode.icon;
        this.elements.playModeBtn.title = mode.title;
    }
    
    updateVolumeUI(volume) {
        this.elements.volumeSlider.value = volume;
        if (volume === 0) this.elements.volumeBtn.innerHTML = ICONS.volume.off;
        else if (volume < 50) this.elements.volumeBtn.innerHTML = ICONS.volume.low;
        else this.elements.volumeBtn.innerHTML = ICONS.volume.high;
    }
    
    applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.elements.iconSun.classList.toggle('hidden', isDark);
        this.elements.iconMoon.classList.toggle('hidden', !isDark);
    }

    updateSleepTimerDisplay(remainingSeconds) {
        if (remainingSeconds <= 0) {
            this.elements.sleepTimerDisplay.textContent = '';
            this.elements.sleepTimerSelect.value = "0";
        } else {
            const mins = Math.floor(remainingSeconds / 60);
            const secs = remainingSeconds % 60;
            this.elements.sleepTimerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
    }

    toggleCustomTimerModal(show) {
        if (show) {
            this.elements.customTimerInput.value = '';
            this.elements.customTimerModal.classList.add('visible');
            this.elements.customTimerInput.focus();
        } else {
            this.elements.customTimerModal.classList.remove('visible');
            if (this.elements.sleepTimerSelect.value === "-1") {
                this.elements.sleepTimerSelect.value = "0";
            }
        }
    }
}
// --- END OF FILE js/UIManager.js ---