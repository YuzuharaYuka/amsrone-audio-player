// --- START OF FILE js/EventHandler.js ---

export class EventHandler {
    constructor(player, ui) {
        this.player = player;
        this.ui = ui;
        this.elements = ui.elements;
        this.isSeeking = false;
    }

    bindEventListeners() {
        this.elements.playPauseBtn.addEventListener('click', this.player.togglePlayPause);
        this.elements.prevBtn.addEventListener('click', this.player.prevTrack);
        this.elements.nextBtn.addEventListener('click', this.player.nextTrack);
        this.elements.rewindBtn.addEventListener('click', () => this.player.seek(-10));
        this.elements.forwardBtn.addEventListener('click', () => this.player.seek(10));
        this.elements.downloadBtn.addEventListener('click', this.player.downloadCurrentTrack);
        this.elements.playModeBtn.addEventListener('click', this.player.cyclePlayMode);
        this.elements.volumeBtn.addEventListener('click', this.player.toggleMute);
        this.elements.themeToggleBtn.addEventListener('click', () => this.ui.applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

        this.elements.rateSelector.addEventListener('change', (e) => this.player.setPlaybackRate(parseFloat(e.target.value)));
        this.elements.volumeSlider.addEventListener('input', (e) => this.player.setVolume(parseInt(e.target.value, 10)));
        this.elements.playlist.addEventListener('click', this._handlePlaylistClick);
        
        // Progress bar seeking
        this.elements.progressContainer.addEventListener('mousedown', this._startSeek);
        window.addEventListener('mousemove', this._seeking);
        window.addEventListener('mouseup', this._endSeek);

        // Sleep timer
        this.elements.sleepTimerSelect.addEventListener('change', this._handleSleepTimerChange);
        this.elements.customTimerSetBtn.addEventListener('click', this._handleCustomTimerSet);
        this.elements.customTimerCancelBtn.addEventListener('click', () => this.ui.toggleCustomTimerModal(false));
        
        // Keyboard shortcuts
        window.addEventListener('keydown', this._handleKeyDown);
    }
    
    _handlePlaylistClick = (e) => {
        const targetLi = e.target.closest('li');
        if (targetLi && !targetLi.classList.contains('track-error')) {
            this.player.loadTrack(parseInt(targetLi.dataset.index, 10), true);
        }
    }

    _startSeek = (e) => { this.isSeeking = true; this._handleProgressSeek(e); }
    _seeking = (e) => { if (this.isSeeking) this._handleProgressSeek(e); }
    _endSeek = () => { if (this.isSeeking) this.isSeeking = false; }
    
    _handleProgressSeek = (e) => {
        const rect = this.elements.progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = Math.max(0, Math.min(1, clickX / rect.width)) * this.player.state.duration;
        this.player.seekTo(newTime);
    }

    _handleKeyDown = (e) => {
        if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
        e.preventDefault();
        switch (e.key) {
            case ' ': this.player.togglePlayPause(); break;
            case 'ArrowRight': this.player.seek(10); break;
            case 'ArrowLeft': this.player.seek(-10); break;
            case 'ArrowUp': this.player.setVolume(Math.min(200, this.player.state.currentVolume + 5)); break;
            case 'ArrowDown': this.player.setVolume(Math.max(0, this.player.state.currentVolume - 5)); break;
        }
    }

    _handleSleepTimerChange = (e) => {
        const minutes = parseInt(e.target.value, 10);
        if (minutes === -1) this.ui.toggleCustomTimerModal(true);
        else this.player.setSleepTimer(minutes);
    }

    _handleCustomTimerSet = () => {
        const minutes = parseInt(this.elements.customTimerInput.value, 10);
        if (!isNaN(minutes) && minutes > 0) {
            this.player.setSleepTimer(minutes);
            this.ui.toggleCustomTimerModal(false);
        } else {
            this.elements.customTimerInput.style.border = '1px solid red';
            setTimeout(() => { this.elements.customTimerInput.style.border = ''; }, 1500);
        }
    }
}

// --- END OF FILE js/EventHandler.js ---