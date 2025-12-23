// ===== CONFIGURATION =====
const CONFIG = {
    API_BASE: 'https://saavn.sumit.co/api',
    ADMIN_EMAIL: 'astrohari09@outlook.com',
    STORAGE_KEYS: {
        USERS: 'nexus_users',
        SESSION: 'nexus_session',
        SETTINGS: 'nexus_settings',
        LIBRARY: 'nexus_library',
        PLAYLISTS: 'nexus_playlists'
    }
};

// ===== AUDIO CONTEXT FOR EQUALIZER =====
let audioContext = null;
let sourceNode = null;
let gainNode = null;
let filters = [];
let masterGain = null;

// ===== APP STATE =====
const app = {
    data: {
        user: null,
        users: [],
        currentTrack: null,
        queue: [],
        queueIndex: 0,
        isPlaying: false,
        isMuted: false,
        volume: 70,
        repeatMode: 'off', // off, one, all
        shuffle: false,
        settings: {
            quality: '96',
            eqPreset: 'flat',
            eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            bassBoost: false,
            sound3D: false,
            loudness: false,
            normalize: false,
            bassLevel: 50,
            trebleLevel: 50,
            volumeBoost: 0,
            lowDataMode: true,
            cacheAudio: false,
            autoQuality: false
        },
        library: [],
        playlists: []
    },

    els: {
        audio: document.getElementById('audio-element'),
        authOverlay: document.getElementById('auth-overlay'),
        appContainer: document.getElementById('app-container'),
        settingsPanel: document.getElementById('settings-panel'),
        queuePanel: document.getElementById('queue-panel'),
        lyricsPanel: document.getElementById('lyrics-panel'),
        toast: document.getElementById('toast'),
        searchInput: document.getElementById('search-input'),
        playerArtwork: document.getElementById('player-img'),
        playerTitle: document.getElementById('player-title'),
        playerArtist: document.getElementById('player-artist'),
        playPauseBtn: document.getElementById('play-pause-btn'),
        playIcon: document.getElementById('play-icon'),
        progressBar: document.getElementById('progress-bar'),
        progressFilled: document.getElementById('progress-filled'),
        progressHandle: document.getElementById('progress-handle'),
        timeCurrent: document.getElementById('time-current'),
        timeTotal: document.getElementById('time-total'),
        volumeSlider: document.getElementById('volume-slider'),
        muteBtn: document.getElementById('mute-btn'),
        qualityBadge: document.getElementById('quality-badge'),
        likeBtn: document.getElementById('like-btn'),
        repeatBtn: document.getElementById('repeat-btn'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        queueList: document.getElementById('queue-list'),
        lyricsContent: document.getElementById('lyrics-content')
    },

    // ===== INITIALIZATION =====
    init() {
        this.loadUsers();
        this.loadSettings();
        this.loadLibrary();
        this.loadPlaylists();
        this.checkSession();
        this.setupAudioContext();
        this.setupEventListeners();
        this.loadHomeContent();
    },

    // ===== AUDIO CONTEXT SETUP =====
    setupAudioContext() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupAudioGraph();
        } catch (e) {
            console.warn('AudioContext not supported:', e);
        }
    },

    setupAudioGraph() {
        if (!audioContext) return;
        
        try {
            sourceNode = audioContext.createMediaElementSource(this.els.audio);
            masterGain = audioContext.createGain();
            
            // Create 10-band equalizer
            const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
            let lastNode = sourceNode;
            
            frequencies.forEach((freq, i) => {
                const filter = audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                filters[i] = filter;
                lastNode.connect(filter);
                lastNode = filter;
            });
            
            lastNode.connect(masterGain);
            masterGain.connect(audioContext.destination);
            
            // Update equalizer
            this.updateEqualizer();
        } catch (e) {
            console.warn('Audio graph setup failed:', e);
        }
    },

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        // Audio events
        this.els.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.els.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.els.audio.addEventListener('ended', () => this.handleTrackEnd());
        this.els.audio.addEventListener('error', (e) => this.handleAudioError(e));
        this.els.audio.addEventListener('play', () => this.updatePlayState(true));
        this.els.audio.addEventListener('pause', () => this.updatePlayState(false));

        // Progress bar
        this.els.progressBar.addEventListener('click', (e) => this.seek(e));
        this.els.progressBar.addEventListener('mousemove', (e) => this.updateHoverTime(e));

        // Volume
        this.els.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigate(page);
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });

        // Settings
        document.querySelectorAll('input[name="quality"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.data.settings.quality = e.target.value;
                this.saveSettings();
                if (this.data.currentTrack) {
                    this.loadTrack(this.data.queueIndex);
                }
            });
        });

        // Equalizer sliders
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const band = parseInt(e.target.dataset.band);
                this.data.settings.eqBands[band] = parseInt(e.target.value);
                this.data.settings.eqPreset = 'custom';
                this.updateEqualizer();
                this.saveSettings();
            });
        });

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyEQPreset(btn.dataset.preset);
            });
        });

        // Enhancement toggles
        document.getElementById('bass-boost').addEventListener('change', (e) => {
            this.data.settings.bassBoost = e.target.checked;
            this.applyEnhancements();
            this.saveSettings();
        });

        document.getElementById('3d-sound').addEventListener('change', (e) => {
            this.data.settings.sound3D = e.target.checked;
            this.applyEnhancements();
            this.saveSettings();
        });

        document.getElementById('loudness').addEventListener('change', (e) => {
            this.data.settings.loudness = e.target.checked;
            this.applyEnhancements();
            this.saveSettings();
        });

        document.getElementById('normalize').addEventListener('change', (e) => {
            this.data.settings.normalize = e.target.checked;
            this.applyEnhancements();
            this.saveSettings();
        });

        // Enhancement controls
        document.getElementById('bass-level').addEventListener('input', (e) => {
            this.data.settings.bassLevel = parseInt(e.target.value);
            this.applyEnhancements();
            this.saveSettings();
        });

        document.getElementById('treble-level').addEventListener('input', (e) => {
            this.data.settings.trebleLevel = parseInt(e.target.value);
            this.applyEnhancements();
            this.saveSettings();
        });

        document.getElementById('volume-boost').addEventListener('input', (e) => {
            this.data.settings.volumeBoost = parseInt(e.target.value);
            this.applyEnhancements();
            this.saveSettings();
        });

        // Data optimization
        document.getElementById('low-data').addEventListener('change', (e) => {
            this.data.settings.lowDataMode = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('cache-audio').addEventListener('change', (e) => {
            this.data.settings.cacheAudio = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('auto-quality').addEventListener('change', (e) => {
            this.data.settings.autoQuality = e.target.checked;
            this.saveSettings();
        });
    },

    // ===== USER MANAGEMENT =====
    loadUsers() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.USERS);
        if (stored) {
            this.data.users = JSON.parse(stored);
        } else {
            this.data.users = [
                {
                    name: 'Admin',
                    email: CONFIG.ADMIN_EMAIL,
                    pass: 'admin123',
                    isPremium: true,
                    isAdmin: true,
                    trialRequest: null
                },
                {
                    name: 'User',
                    email: 'user@demo.com',
                    pass: '123456',
                    isPremium: false,
                    isAdmin: false,
                    trialRequest: null
                }
            ];
            this.saveUsers();
        }
    },

    saveUsers() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.USERS, JSON.stringify(this.data.users));
    },

    checkSession() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
        if (stored) {
            this.data.user = JSON.parse(stored);
            this.els.authOverlay.classList.add('hidden');
            this.els.appContainer.classList.remove('hidden');
            this.updateUI();
        }
    },

    // ===== AUTHENTICATION =====
    switchAuth(mode) {
        document.getElementById('login-box').classList.toggle('hidden', mode === 'signup');
        document.getElementById('signup-box').classList.toggle('hidden', mode === 'login');
    },

    login() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const user = this.data.users.find(u => u.email === email && u.pass === pass);
        
        if (user) {
            this.data.user = user;
            localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(user));
            this.els.authOverlay.classList.add('hidden');
            this.els.appContainer.classList.remove('hidden');
            this.updateUI();
            this.showToast(`Welcome back, ${user.name}!`);
        } else {
            this.showToast('Invalid credentials');
        }
    },

    signup() {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-pass').value;
        
        if (!name || !email || !pass) {
            this.showToast('Please fill all fields');
            return;
        }
        
        if (this.data.users.find(u => u.email === email)) {
            this.showToast('Email already exists');
            return;
        }
        
        const user = {
            name,
            email,
            pass,
            isPremium: false,
            isAdmin: email === CONFIG.ADMIN_EMAIL,
            trialRequest: null
        };
        
        this.data.users.push(user);
        this.saveUsers();
        this.data.user = user;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(user));
        this.els.authOverlay.classList.add('hidden');
        this.els.appContainer.classList.remove('hidden');
        this.updateUI();
        this.showToast(`Welcome, ${user.name}!`);
    },

    logout() {
        this.data.user = null;
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
        this.els.appContainer.classList.add('hidden');
        this.els.authOverlay.classList.remove('hidden');
        this.stop();
    },

    // ===== UI UPDATES =====
    updateUI() {
        if (!this.data.user) return;
        
        document.getElementById('user-name').textContent = this.data.user.name;
        document.getElementById('user-avatar').textContent = this.data.user.name[0].toUpperCase();
        document.getElementById('user-badge').textContent = this.data.user.isPremium ? 'Premium' : 'Free';
        
        const adminLink = document.getElementById('admin-link');
        if (this.data.user.isAdmin) {
            adminLink.classList.remove('hidden');
        } else {
            adminLink.classList.add('hidden');
        }
        
        const premiumBtn = document.getElementById('premium-btn');
        if (this.data.user.isPremium) {
            premiumBtn.classList.add('hidden');
        } else {
            premiumBtn.classList.remove('hidden');
            if (this.data.user.trialRequest === 'pending') {
                premiumBtn.innerHTML = '<i class="fas fa-clock"></i> Pending';
                premiumBtn.disabled = true;
            } else {
                premiumBtn.innerHTML = '<i class="fas fa-crown"></i> Go Premium';
                premiumBtn.disabled = false;
            }
        }
    },

    navigate(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');
        
        if (page === 'admin') {
            this.loadAdmin();
        }
    },

    // ===== API INTEGRATION =====
    async fetchAPI(endpoint) {
        try {
            const url = `${CONFIG.API_BASE}/${endpoint}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            return data.data || data;
        } catch (error) {
            console.error('API Error:', error);
            this.showToast('Failed to load content');
            return null;
        }
    },

    getImageUrl(song, size = '500x500') {
        if (!song || !song.image) return 'https://via.placeholder.com/500?text=Music';
        
        let imageUrl = '';
        if (Array.isArray(song.image)) {
            imageUrl = song.image[song.image.length - 1]?.link || song.image[0]?.link || '';
        } else if (typeof song.image === 'string') {
            imageUrl = song.image;
        }
        
        if (imageUrl) {
            imageUrl = imageUrl.replace('http://', 'https://');
            imageUrl = imageUrl.replace(/50x50|150x150|250x250|500x500|1000x1000/g, size);
        }
        
        return imageUrl || 'https://via.placeholder.com/500?text=Music';
    },

    getArtistName(song) {
        if (song.primaryArtists) return song.primaryArtists;
        if (song.singers) return song.singers;
        if (Array.isArray(song.artists)) {
            return song.artists.map(a => a.name || a).join(', ');
        }
        return 'Unknown Artist';
    },

    getAudioUrl(song, quality = null) {
        const q = quality || this.data.settings.quality;
        let url = null;
        
        if (Array.isArray(song.downloadUrl)) {
            const qualityMap = { '96': '96', '128': '128', '160': '160', '320': '320' };
            url = song.downloadUrl.find(d => d.quality === qualityMap[q])?.link;
            if (!url) url = song.downloadUrl[song.downloadUrl.length - 1]?.link;
        } else if (typeof song.downloadUrl === 'string') {
            url = song.downloadUrl;
        } else if (song.media_preview_url) {
            url = song.media_preview_url;
        }
        
        if (url) {
            url = url.replace('http://', 'https://');
        }
        
        return url;
    },

    async loadHomeContent() {
        // Trending
        this.loadSection('search/songs?query=trending+hindi&limit=10', 'trending-grid');
        
        // New Releases
        this.loadSection('search/songs?query=latest+songs&limit=10', 'newreleases-grid');
        
        // Charts
        this.loadSection('search/songs?query=top+charts&limit=10', 'charts-grid');
    },

    async loadSection(endpoint, gridId) {
        const grid = document.getElementById(gridId);
        grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(4);
        
        const data = await this.fetchAPI(endpoint);
        if (!data || !data.results) {
            grid.innerHTML = '<p class="empty-state">Failed to load</p>';
            return;
        }
        
        this.renderSongs(data.results, gridId);
    },

    async search(query) {
        if (!query.trim()) return;
        
        this.navigate('search');
        const grid = document.getElementById('search-grid');
        grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(8);
        
        const data = await this.fetchAPI(`search/songs?query=${encodeURIComponent(query)}&limit=20`);
        if (!data || !data.results) {
            grid.innerHTML = '<p class="empty-state">No results found</p>';
            return;
        }
        
        this.renderSongs(data.results, 'search-grid');
    },

    renderSongs(songs, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        songs.forEach((song, index) => {
            const card = document.createElement('div');
            card.className = 'song-card';
            card.innerHTML = `
                <div class="song-card-image">
                    <img src="${this.getImageUrl(song)}" alt="${song.name || song.title}" loading="lazy">
                    <div class="play-overlay">
                        <div class="play-btn-overlay">
                            <i class="fas fa-play"></i>
                        </div>
                    </div>
                </div>
                <div class="song-card-title">${song.name || song.title || 'Unknown'}</div>
                <div class="song-card-artist">${this.getArtistName(song)}</div>
            `;
            
            card.addEventListener('click', () => {
                this.data.queue = songs;
                this.data.queueIndex = index;
                this.loadTrack(index);
            });
            
            container.appendChild(card);
        });
    },

    // ===== AUDIO PLAYBACK =====
    async loadTrack(index) {
        if (index < 0 || index >= this.data.queue.length) return;
        
        const song = this.data.queue[index];
        this.data.queueIndex = index;
        this.data.currentTrack = song;
        
        // Update UI
        this.els.playerTitle.textContent = song.name || song.title || 'Unknown';
        this.els.playerArtist.textContent = this.getArtistName(song);
        this.els.playerArtwork.src = this.getImageUrl(song);
        this.els.playerArtwork.alt = song.name || song.title;
        
        // Get audio URL
        const audioUrl = this.getAudioUrl(song);
        if (!audioUrl) {
            this.showToast('Audio not available');
            return;
        }
        
        // Update quality badge
        const quality = this.data.settings.quality;
        this.els.qualityBadge.textContent = `${quality}k`;
        this.els.qualityBadge.classList.toggle('premium', quality === '320' || quality === '160');
        
        // Load audio
        this.els.audio.src = audioUrl;
        this.els.audio.load();
        
        // Play
        try {
            await this.els.audio.play();
            this.data.isPlaying = true;
            this.els.playIcon.className = 'fas fa-pause';
        } catch (e) {
            console.error('Play error:', e);
            this.showToast('Click play to start');
        }
        
        // Update queue display
        this.updateQueueDisplay();
        
        // Try to load lyrics
        this.loadLyrics(song);
    },

    togglePlay() {
        if (!this.data.currentTrack) return;
        
        if (this.data.isPlaying) {
            this.els.audio.pause();
        } else {
            this.els.audio.play();
        }
    },

    updatePlayState(playing) {
        this.data.isPlaying = playing;
        this.els.playIcon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    },

    skipPrevious() {
        if (this.data.queueIndex > 0) {
            this.loadTrack(this.data.queueIndex - 1);
        }
    },

    skipNext() {
        if (this.data.repeatMode === 'one') {
            this.loadTrack(this.data.queueIndex);
            return;
        }
        
        if (this.data.queueIndex < this.data.queue.length - 1) {
            this.loadTrack(this.data.queueIndex + 1);
        } else if (this.data.repeatMode === 'all') {
            this.loadTrack(0);
        }
    },

    handleTrackEnd() {
        if (this.data.repeatMode === 'one') {
            this.loadTrack(this.data.queueIndex);
        } else if (this.data.repeatMode === 'all') {
            this.skipNext();
        } else if (this.data.queueIndex < this.data.queue.length - 1) {
            this.skipNext();
        }
    },

    stop() {
        this.els.audio.pause();
        this.els.audio.src = '';
        this.data.isPlaying = false;
        this.data.currentTrack = null;
        this.els.playerTitle.textContent = 'Not Playing';
        this.els.playerArtist.textContent = 'Select a song';
        this.els.playerArtwork.src = '';
        this.els.playIcon.className = 'fas fa-play';
    },

    // ===== PROGRESS CONTROL =====
    updateProgress() {
        const current = this.els.audio.currentTime;
        const duration = this.els.audio.duration;
        
        if (isNaN(duration)) return;
        
        const percent = (current / duration) * 100;
        this.els.progressFilled.style.width = `${percent}%`;
        this.els.progressHandle.style.left = `${percent}%`;
        this.els.timeCurrent.textContent = this.formatTime(current);
    },

    updateDuration() {
        const duration = this.els.audio.duration;
        if (!isNaN(duration)) {
            this.els.timeTotal.textContent = this.formatTime(duration);
        }
    },

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    seek(e) {
        const rect = this.els.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * this.els.audio.duration;
        this.els.audio.currentTime = time;
    },

    updateHoverTime(e) {
        // Could add tooltip showing hover time
    },

    // ===== VOLUME CONTROL =====
    setVolume(value) {
        this.data.volume = parseInt(value);
        this.els.audio.volume = this.data.volume / 100;
        this.updateVolumeIcon();
    },

    toggleMute() {
        this.data.isMuted = !this.data.isMuted;
        this.els.audio.muted = this.data.isMuted;
        this.updateVolumeIcon();
    },

    updateVolumeIcon() {
        const icon = this.els.muteBtn.querySelector('i');
        if (this.data.isMuted || this.data.volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (this.data.volume < 50) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    },

    // ===== REPEAT & SHUFFLE =====
    setRepeatMode() {
        const modes = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(this.data.repeatMode);
        this.data.repeatMode = modes[(currentIndex + 1) % modes.length];
        
        this.els.repeatBtn.classList.toggle('active', this.data.repeatMode !== 'off');
        this.els.repeatBtn.querySelector('i').className = 
            this.data.repeatMode === 'one' ? 'fas fa-redo' : 'fas fa-redo';
        this.els.repeatBtn.title = `Repeat: ${this.data.repeatMode}`;
    },

    setShuffle() {
        this.data.shuffle = !this.data.shuffle;
        this.els.shuffleBtn.classList.toggle('active', this.data.shuffle);
        // Implement shuffle logic if needed
    },

    // ===== EQUALIZER =====
    applyEQPreset(preset) {
        const presets = {
            flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            pop: [2, 3, 4, 3, 1, -1, -2, -2, 0, 1],
            rock: [4, 2, -2, -3, -2, 1, 3, 4, 4, 4],
            jazz: [2, 1, 0, 2, 3, 2, 1, 1, 2, 2],
            classical: [3, 2, 1, 0, 0, 0, -1, -2, -2, -3],
            bass: [6, 5, 3, 2, 0, -1, -2, -2, -1, 0]
        };
        
        this.data.settings.eqPreset = preset;
        this.data.settings.eqBands = presets[preset] || presets.flat;
        
        // Update sliders
        document.querySelectorAll('.eq-slider').forEach((slider, i) => {
            slider.value = this.data.settings.eqBands[i];
        });
        
        this.updateEqualizer();
        this.saveSettings();
    },

    updateEqualizer() {
        if (!filters || filters.length === 0) return;
        
        this.data.settings.eqBands.forEach((gain, i) => {
            if (filters[i]) {
                filters[i].gain.value = gain;
            }
        });
    },

    // ===== SOUND ENHANCEMENT =====
    applyEnhancements() {
        if (!masterGain) return;
        
        let gainValue = 1;
        
        // Volume boost
        if (this.data.settings.volumeBoost > 0) {
            gainValue += this.data.settings.volumeBoost / 100;
        }
        
        // Bass boost
        if (this.data.settings.bassBoost) {
            const bassGain = this.data.settings.bassLevel / 50;
            if (filters[0]) filters[0].gain.value += bassGain * 3;
            if (filters[1]) filters[1].gain.value += bassGain * 2;
        }
        
        // Treble boost
        if (this.data.settings.trebleLevel !== 50) {
            const trebleGain = (this.data.settings.trebleLevel - 50) / 25;
            if (filters[8]) filters[8].gain.value += trebleGain;
            if (filters[9]) filters[9].gain.value += trebleGain;
        }
        
        masterGain.gain.value = Math.min(gainValue, 2); // Cap at 2x
    },

    // ===== SETTINGS =====
    loadSettings() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
        if (stored) {
            this.data.settings = { ...this.data.settings, ...JSON.parse(stored) };
        }
        this.applySettings();
    },

    saveSettings() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(this.data.settings));
    },

    applySettings() {
        // Apply quality
        document.querySelector(`input[name="quality"][value="${this.data.settings.quality}"]`).checked = true;
        
        // Apply EQ preset
        document.querySelector(`.preset-btn[data-preset="${this.data.settings.eqPreset}"]`)?.classList.add('active');
        this.updateEqualizer();
        
        // Apply enhancements
        document.getElementById('bass-boost').checked = this.data.settings.bassBoost;
        document.getElementById('3d-sound').checked = this.data.settings.sound3D;
        document.getElementById('loudness').checked = this.data.settings.loudness;
        document.getElementById('normalize').checked = this.data.settings.normalize;
        document.getElementById('bass-level').value = this.data.settings.bassLevel;
        document.getElementById('treble-level').value = this.data.settings.trebleLevel;
        document.getElementById('volume-boost').value = this.data.settings.volumeBoost;
        
        // Apply optimization
        document.getElementById('low-data').checked = this.data.settings.lowDataMode;
        document.getElementById('cache-audio').checked = this.data.settings.cacheAudio;
        document.getElementById('auto-quality').checked = this.data.settings.autoQuality;
        
        // Apply volume
        this.els.volumeSlider.value = this.data.volume;
        this.setVolume(this.data.volume);
        
        this.applyEnhancements();
    },

    toggleSettings() {
        this.els.settingsPanel.classList.toggle('active');
    },

    // ===== QUEUE =====
    updateQueueDisplay() {
        if (!this.data.queue || this.data.queue.length === 0) {
            this.els.queueList.innerHTML = '<p class="empty-state">Queue is empty</p>';
            return;
        }
        
        this.els.queueList.innerHTML = '';
        this.data.queue.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = `queue-item ${index === this.data.queueIndex ? 'active' : ''}`;
            item.innerHTML = `
                <div class="queue-item-image">
                    <img src="${this.getImageUrl(song, '150x150')}" alt="${song.name || song.title}">
                </div>
                <div class="queue-item-info">
                    <div class="queue-item-title">${song.name || song.title || 'Unknown'}</div>
                    <div class="queue-item-artist">${this.getArtistName(song)}</div>
                </div>
            `;
            item.addEventListener('click', () => this.loadTrack(index));
            this.els.queueList.appendChild(item);
        });
    },

    toggleQueue() {
        this.els.queuePanel.classList.toggle('active');
        if (this.els.queuePanel.classList.contains('active')) {
            this.els.lyricsPanel.classList.remove('active');
        }
    },

    addToQueue() {
        // Implementation for adding to queue
        this.showToast('Added to queue');
    },

    // ===== LYRICS =====
    async loadLyrics(song) {
        this.els.lyricsContent.innerHTML = '<p class="empty-state">Loading lyrics...</p>';
        
        try {
            // Try to fetch lyrics from API
            if (song.id) {
                const data = await this.fetchAPI(`songs?id=${song.id}`);
                if (data && data.lyrics) {
                    this.els.lyricsContent.textContent = data.lyrics;
                    return;
                }
            }
        } catch (e) {
            console.error('Lyrics error:', e);
        }
        
        this.els.lyricsContent.innerHTML = '<p class="empty-state">No lyrics available</p>';
    },

    toggleLyrics() {
        this.els.lyricsPanel.classList.toggle('active');
        if (this.els.lyricsPanel.classList.contains('active')) {
            this.els.queuePanel.classList.remove('active');
        }
    },

    // ===== LIBRARY =====
    loadLibrary() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.LIBRARY);
        if (stored) {
            this.data.library = JSON.parse(stored);
        }
        this.renderLibrary();
    },

    renderLibrary() {
        const container = document.getElementById('library-list');
        if (this.data.library.length === 0) {
            container.innerHTML = '<p class="empty-state">Your library is empty</p>';
            return;
        }
        
        this.renderSongs(this.data.library, 'library-list');
    },

    toggleLike() {
        if (!this.data.currentTrack) return;
        
        const index = this.data.library.findIndex(s => 
            (s.id && this.data.currentTrack.id && s.id === this.data.currentTrack.id) ||
            (s.name === this.data.currentTrack.name)
        );
        
        if (index > -1) {
            this.data.library.splice(index, 1);
            this.els.likeBtn.querySelector('i').className = 'far fa-heart';
            this.showToast('Removed from library');
        } else {
            this.data.library.push(this.data.currentTrack);
            this.els.likeBtn.querySelector('i').className = 'fas fa-heart';
            this.showToast('Added to library');
        }
        
        localStorage.setItem(CONFIG.STORAGE_KEYS.LIBRARY, JSON.stringify(this.data.library));
    },

    // ===== PLAYLISTS =====
    loadPlaylists() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.PLAYLISTS);
        if (stored) {
            this.data.playlists = JSON.parse(stored);
        }
        this.renderPlaylists();
    },

    renderPlaylists() {
        const container = document.getElementById('playlists-grid');
        if (this.data.playlists.length === 0) {
            container.innerHTML = '<p class="empty-state">No playlists yet</p>';
            return;
        }
        
        // Render playlists
    },

    createPlaylist() {
        const name = prompt('Playlist name:');
        if (name) {
            this.data.playlists.push({ id: Date.now(), name, songs: [] });
            this.savePlaylists();
            this.renderPlaylists();
            this.showToast('Playlist created');
        }
    },

    savePlaylists() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.PLAYLISTS, JSON.stringify(this.data.playlists));
    },

    // ===== PREMIUM =====
    requestPremium() {
        if (!this.data.user) return;
        
        const userIndex = this.data.users.findIndex(u => u.email === this.data.user.email);
        if (userIndex > -1) {
            this.data.users[userIndex].trialRequest = 'pending';
            this.data.user.trialRequest = 'pending';
            this.saveUsers();
            this.updateUI();
            this.showToast('Premium request sent');
        }
    },

    // ===== ADMIN =====
    loadAdmin() {
        if (!this.data.user?.isAdmin) return;
        
        const pending = this.data.users.filter(u => u.trialRequest === 'pending');
        const premium = this.data.users.filter(u => u.isPremium);
        
        document.getElementById('admin-pending').textContent = pending.length;
        document.getElementById('admin-premium').textContent = premium.length;
        
        const tbody = document.getElementById('admin-tbody');
        tbody.innerHTML = '';
        
        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px;">No pending requests</td></tr>';
            return;
        }
        
        pending.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td><span style="color:var(--accent); font-weight:600;">Pending</span></td>
                <td>
                    <button class="admin-action-btn accept" onclick="app.adminAction('${user.email}', true)">Accept</button>
                    <button class="admin-action-btn reject" onclick="app.adminAction('${user.email}', false)">Reject</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    adminAction(email, approve) {
        const userIndex = this.data.users.findIndex(u => u.email === email);
        if (userIndex > -1) {
            if (approve) {
                this.data.users[userIndex].isPremium = true;
                this.data.users[userIndex].trialRequest = 'active';
            } else {
                this.data.users[userIndex].trialRequest = null;
            }
            this.saveUsers();
            this.loadAdmin();
            this.showToast(`Request ${approve ? 'approved' : 'rejected'}`);
        }
    },

    // ===== UTILITY =====
    handleAudioError(e) {
        console.error('Audio error:', e);
        this.showToast('Failed to play audio. Try another song.');
    },

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    },

    showToast(message) {
        this.els.toast.textContent = message;
        this.els.toast.classList.add('show');
        setTimeout(() => {
            this.els.toast.classList.remove('show');
        }, 3000);
    }
};

// ===== INITIALIZE =====
window.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Global functions for onclick handlers
window.app = app;

