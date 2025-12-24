// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
    apiKey: "AIzaSyBpwQ3QKKUCpqRMfX_9HUu2ebO525GYvJY",
    authDomain: "livechat-6b08b.firebaseapp.com",
    projectId: "livechat-6b08b",
    storageBucket: "livechat-6b08b.firebasestorage.app",
    messagingSenderId: "879187762003",
    appId: "1:879187762003:web:159293e3708c413a7edfa6",
    measurementId: "G-ZD2V91L9DW"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== APP CONFIGURATION =====
const CONFIG = {
    API_BASE: 'https://krishan7979.vercel.app/api',
    ADMIN_EMAIL: 'astrohari09@outlook.com',
    STORAGE_KEYS: {
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
    // ===== INITIALIZATION =====
    init() {
        this.setupAuthListener();
        this.loadSettings();
        this.loadLibrary();
        this.loadPlaylists();
        this.setupAudioContext();
        this.setupEventListeners();
        this.loadHomeContent();
    },

    setupAuthListener() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // User is signed in
                console.log('User signed in:', user.email);
                await this.loadUserProfile(user);
                this.els.authOverlay.classList.add('hidden');
                this.els.appContainer.classList.remove('hidden');
            } else {
                // User is signed out
                console.log('User signed out');
                this.data.user = null;
                this.els.appContainer.classList.add('hidden');
                this.els.authOverlay.classList.remove('hidden');
            }
        });
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

    resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
        }
    },

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        // Audio events
        this.els.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.els.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.els.audio.addEventListener('ended', () => this.handleTrackEnd());
        this.els.audio.addEventListener('error', (e) => {
            console.error('Audio element error:', e, this.els.audio.error);
            this.handleAudioError(e);
        });
        this.els.audio.addEventListener('play', () => {
            console.log('Audio play event fired');
            this.updatePlayState(true);
        });
        this.els.audio.addEventListener('pause', () => {
            console.log('Audio pause event fired');
            this.updatePlayState(false);
        });
        this.els.audio.addEventListener('stalled', () => {
            console.warn('Audio stalled');
            this.showToast('Audio loading...');
        });
        this.els.audio.addEventListener('waiting', () => {
            console.log('Audio waiting for data');
        });
        this.els.audio.addEventListener('canplay', () => {
            console.log('Audio can play');
        });

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
    async loadUserProfile(firebaseUser) {
        try {
            const docRef = db.collection('users').doc(firebaseUser.uid);
            const doc = await docRef.get();

            if (doc.exists) {
                this.data.user = { ...doc.data(), uid: firebaseUser.uid };
            } else {
                // Should have been created on signup, but create if missing
                const newUser = {
                    name: firebaseUser.displayName || 'User',
                    email: firebaseUser.email,
                    isAdmin: firebaseUser.email === CONFIG.ADMIN_EMAIL,
                    isPremium: false,
                    trialRequest: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await docRef.set(newUser);
                this.data.user = { ...newUser, uid: firebaseUser.uid };
            }

            // Auto Update Admin Status based on email hardcheck
            if (this.data.user.email === CONFIG.ADMIN_EMAIL && !this.data.user.isAdmin) {
                await docRef.update({ isAdmin: true });
                this.data.user.isAdmin = true;
            }

            // Check Premium Validity
            await this.checkPremiumStatus();

            this.updateUI();
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showToast('Error loading profile');
        }
    },

    async checkPremiumStatus() {
        if (!this.data.user?.isPremium) return;

        if (this.data.user.premiumExpiry) {
            // Check if expired
            const now = Date.now();
            // Firestore timestamp to millis
            const expiry = this.data.user.premiumExpiry.toMillis ? this.data.user.premiumExpiry.toMillis() : this.data.user.premiumExpiry;

            if (now > expiry) {
                console.log('Premium expired');
                await db.collection('users').doc(this.data.user.uid).update({
                    isPremium: false,
                    premiumExpiry: null,
                    trialRequest: null // Reset request so they can ask again or buy
                });
                this.data.user.isPremium = false;
                this.data.user.premiumExpiry = null;
                this.showToast('Your Premium has expired');
            } else {
                // Show time remaining in UI if needed, or just log
                const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
                console.log(`Premium active. Days left: ${daysLeft}`);
            }
        }
    },

    // ===== AUTHENTICATION =====
    switchAuth(mode) {
        document.getElementById('login-box').classList.toggle('hidden', mode === 'signup');
        document.getElementById('signup-box').classList.toggle('hidden', mode === 'login');
    },

    async login() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;

        try {
            await auth.signInWithEmailAndPassword(email, pass);
            this.showToast('Signed in successfully');
        } catch (error) {
            console.error('Login error:', error);
            this.showToast(error.message);
        }
    },

    async signup() {
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-pass').value;

        if (!name || !email || !pass) {
            this.showToast('Please fill all fields');
            return;
        }

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
            const user = userCredential.user;

            // Create User Profile in Firestore
            await db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                isAdmin: email === CONFIG.ADMIN_EMAIL,
                isPremium: false,
                trialRequest: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showToast(`Welcome, ${name}!`);
        } catch (error) {
            console.error('Signup error:', error);
            this.showToast(error.message);
        }
    },

    async logout() {
        try {
            await auth.signOut();
            this.stop();
            this.showToast('Signed out');
        } catch (error) {
            console.error('Logout error:', error);
        }
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

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            // Return full response object - let calling function handle nested structure
            return data;

        } catch (error) {
            console.error('API Error:', error.message);
            this.showToast('Failed to load content. Please check your connection.');
            return null;
        }
    },


    getImageUrl(song, size = '500x500') {
        if (!song) return '';

        let imageUrl = null;

        // API format: image array with [{quality: "500x500", url: "..."}, ...]
        if (song.image && Array.isArray(song.image) && song.image.length > 0) {
            // Try to find exact size match first
            const sizeMatch = song.image.find(img => img && img.quality === size);
            if (sizeMatch && sizeMatch.url) {
                imageUrl = sizeMatch.url;
            } else {
                // Fallback: get highest quality (usually last item or largest size)
                const sorted = [...song.image].reverse(); // Start with last (usually highest quality)
                for (const img of sorted) {
                    if (img && img.url) {
                        imageUrl = img.url;
                        break;
                    }
                }
            }
        }
        // Fallback formats
        else if (song.image && typeof song.image === 'string') {
            imageUrl = song.image;
        } else if (song.image && typeof song.image === 'object' && song.image.url) {
            imageUrl = song.image.url;
        } else if (song.thumbnail) {
            imageUrl = typeof song.thumbnail === 'string' ? song.thumbnail : song.thumbnail.url;
        } else if (song.cover) {
            imageUrl = typeof song.cover === 'string' ? song.cover : song.cover.url;
        }

        // Ensure we have a string before processing
        if (!imageUrl || typeof imageUrl !== 'string') {
            return '';
        }

        // Process the URL string
        try {
            // Ensure HTTPS
            imageUrl = imageUrl.replace('http://', 'https://');
            return imageUrl;
        } catch (error) {
            console.error('Error processing image URL:', error);
            return '';
        }
    },

    getArtistName(song) {
        // API format: artists.primary array with [{name: "...", ...}, ...]
        if (song.artists && song.artists.primary && Array.isArray(song.artists.primary)) {
            return song.artists.primary.map(a => a.name || '').filter(Boolean).join(', ') || 'Unknown Artist';
        }
        // Fallback formats
        if (song.primaryArtists) {
            return typeof song.primaryArtists === 'string' ? song.primaryArtists : song.primaryArtists.join(', ');
        }
        if (song.singers) {
            return typeof song.singers === 'string' ? song.singers : song.singers.join(', ');
        }
        if (Array.isArray(song.artists)) {
            return song.artists.map(a => (typeof a === 'string' ? a : (a.name || ''))).filter(Boolean).join(', ') || 'Unknown Artist';
        }
        return 'Unknown Artist';
    },

    async getAudioUrl(song, quality = null) {
        const q = quality || this.data.settings.quality;
        let url = null;

        console.log('getAudioUrl called for:', song.name || song.title);
        console.log('Song downloadUrl:', song.downloadUrl);

        // Quality mapping: "96" -> "96kbps", "160" -> "160kbps", etc.
        const qualityMap = {
            '96': '96kbps',
            '128': '128kbps',
            '160': '160kbps',
            '320': '320kbps'
        };
        const targetQuality = qualityMap[q] || `${q}kbps`;

        // Try downloadUrl array (format: [{quality: "96kbps", url: "..."}, ...])
        if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
            console.log('Found downloadUrl array with', song.downloadUrl.length, 'items');
            console.log('Looking for quality:', targetQuality);

            // Try to find exact quality match
            const qualityMatch = song.downloadUrl.find(d => {
                if (!d || typeof d !== 'object') return false;
                const dQuality = d.quality || '';
                return dQuality === targetQuality || dQuality === q || dQuality === `${q}kbps`;
            });

            if (qualityMatch && qualityMatch.url) {
                url = qualityMatch.url;
                console.log('Found quality match:', url);
            } else {
                console.log('No exact quality match, using fallback');
                // Fallback: try to find closest quality or use last item
                // Prefer higher quality if available
                const sortedByQuality = [...song.downloadUrl].reverse(); // Start with highest
                for (const item of sortedByQuality) {
                    if (item && item.url) {
                        url = item.url;
                        console.log('Using fallback URL:', url);
                        break;
                    }
                }
            }
        }
        // Try string downloadUrl (fallback)
        else if (typeof song.downloadUrl === 'string') {
            url = song.downloadUrl;
            console.log('Found string downloadUrl:', url);
        }
        // Try other URL fields
        else if (song.media_url) {
            url = typeof song.media_url === 'string' ? song.media_url : song.media_url.url;
            console.log('Found media_url:', url);
        } else if (song.url) {
            url = typeof song.url === 'string' ? song.url : song.url.url;
            console.log('Found url field:', url);
        } else {
            console.warn('No audio URL found in song object. Available keys:', Object.keys(song));
        }

        if (url) {
            url = url.replace('http://', 'https://');
            console.log('Final audio URL:', url);
        } else {
            console.error('❌ No audio URL found!');
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
        if (!data) {
            grid.innerHTML = '<p class="empty-state">Failed to load</p>';
            return;
        }

        // Handle API response structure: {success: true, data: {results: [...]}}
        let songs = [];
        if (data.data && data.data.results && Array.isArray(data.data.results)) {
            songs = data.data.results;
        } else if (Array.isArray(data)) {
            songs = data;
        } else if (data.results && Array.isArray(data.results)) {
            songs = data.results;
        } else if (data.data && Array.isArray(data.data)) {
            songs = data.data;
        } else if (data.songs && Array.isArray(data.songs)) {
            songs = data.songs;
        }

        if (songs.length === 0) {
            grid.innerHTML = '<p class="empty-state">No content found</p>';
            return;
        }

        this.renderSongs(songs, gridId);
    },

    async search(query) {
        if (!query.trim()) return;

        this.navigate('search');
        const grid = document.getElementById('search-grid');
        grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(8);

        const data = await this.fetchAPI(`search/songs?query=${encodeURIComponent(query)}&limit=20`);
        if (!data) {
            grid.innerHTML = '<p class="empty-state">No results found</p>';
            return;
        }

        // Handle API response structure: {success: true, data: {results: [...]}}
        let songs = [];
        if (data.data && data.data.results && Array.isArray(data.data.results)) {
            songs = data.data.results;
        } else if (Array.isArray(data)) {
            songs = data;
        } else if (data.results && Array.isArray(data.results)) {
            songs = data.results;
        } else if (data.data && Array.isArray(data.data)) {
            songs = data.data;
        } else if (data.songs && Array.isArray(data.songs)) {
            songs = data.songs;
        }

        if (songs.length === 0) {
            grid.innerHTML = '<p class="empty-state">No results found</p>';
            return;
        }

        this.renderSongs(songs, 'search-grid');
    },

    renderSongs(songs, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        // Log first song to debug (only in development, first time)
        if (songs.length > 0 && !this._debugged && window.location.hostname === 'localhost') {
            console.log('Sample song data:', songs[0]);
            this._debugged = true;
        }

        const fallbackImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="500"%3E%3Crect fill="%23181818" width="500" height="500"/%3E%3Ctext fill="%23fff" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Arial" font-size="24"%3EMusic%3C/text%3E%3C/svg%3E';

        songs.forEach((song, index) => {
            try {
                const card = document.createElement('div');
                card.className = 'song-card';
                const imageUrl = this.getImageUrl(song) || fallbackImg;
                const songName = (song.name || song.title || 'Unknown').replace(/"/g, '&quot;');
                const artistName = this.getArtistName(song).replace(/"/g, '&quot;');

                card.innerHTML = `
                    <div class="song-card-image">
                        <img src="${imageUrl}" 
                             alt="${songName}" 
                             loading="lazy"
                             onerror="this.onerror=null; this.src='${fallbackImg}'">
                        <div class="play-overlay">
                            <div class="play-btn-overlay">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                    </div>
                    <div class="song-card-title">${songName}</div>
                    <div class="song-card-artist">${artistName}</div>
                `;

                card.addEventListener('click', async () => {
                    this.data.queue = songs;
                    this.data.queueIndex = index;
                    // Store user interaction context for autoplay
                    this.userInteractionActive = true;
                    await this.loadTrack(index);
                    // Reset after a short delay
                    setTimeout(() => { this.userInteractionActive = false; }, 1000);
                });

                container.appendChild(card);
            } catch (error) {
                console.error('Error rendering song card:', error, song);
            }
        });
    },

    // ===== AUDIO PLAYBACK =====
    async loadTrack(index) {
        this.resumeAudioContext();
        if (index < 0 || index >= this.data.queue.length) return;

        const song = this.data.queue[index];
        this.data.queueIndex = index;
        this.data.currentTrack = song;

        // Update UI
        this.els.playerTitle.textContent = song.name || song.title || 'Unknown';
        this.els.playerArtist.textContent = this.getArtistName(song);
        const fallbackImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="500"%3E%3Crect fill="%23181818" width="500" height="500"/%3E%3Ctext fill="%23fff" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Arial" font-size="24"%3EMusic%3C/text%3E%3C/svg%3E';
        const playerImgUrl = this.getImageUrl(song);
        this.els.playerArtwork.src = playerImgUrl || fallbackImg;
        this.els.playerArtwork.alt = song.name || song.title || 'Music';
        this.els.playerArtwork.onerror = function () {
            this.onerror = null; // Prevent infinite loop
            this.src = fallbackImg;
        };

        // Get audio URL (async)
        const audioUrl = await this.getAudioUrl(song);
        console.log('Audio URL retrieved:', audioUrl);
        console.log('Song object:', song);

        if (!audioUrl) {
            console.error('No audio URL found for song:', song);
            this.showToast('Audio not available');
            return;
        }

        // Update quality badge
        const quality = this.data.settings.quality;
        this.els.qualityBadge.textContent = `${quality}k`;
        this.els.qualityBadge.classList.toggle('premium', quality === '320' || quality === '160');

        // Stop any currently playing audio
        this.els.audio.pause();
        this.els.audio.currentTime = 0;
        this.data.isPlaying = false;
        this.els.playIcon.className = 'fas fa-play';

        // Set up audio element
        this.els.audio.crossOrigin = 'anonymous';
        this.els.audio.preload = 'auto';

        // Load audio
        this.els.audio.src = audioUrl;
        this.els.audio.load();

        console.log('Audio source set, ready to play. User can click play button.');

        // Try to auto-play only if we have active user interaction
        // This preserves the user gesture context for autoplay policies
        if (this.userInteractionActive) {
            // Try immediate play while user interaction is still valid
            const tryPlay = async () => {
                try {
                    await this.els.audio.play();
                    this.data.isPlaying = true;
                    this.els.playIcon.className = 'fas fa-pause';
                    console.log('✅ Auto-playing audio');
                } catch (e) {
                    console.log('Autoplay blocked or not ready, user can click play:', e.name);
                    this.data.isPlaying = false;
                    this.els.playIcon.className = 'fas fa-play';
                }
            };

            // Try immediately
            tryPlay();
        } else {
            // No user interaction, just prepare for manual play
            this.data.isPlaying = false;
            this.els.playIcon.className = 'fas fa-play';
        }

        // Update queue display
        this.updateQueueDisplay();

        // Try to load lyrics
        this.loadLyrics(song);
    },

    togglePlay() {
        this.resumeAudioContext();
        if (!this.data.currentTrack || !this.els.audio.src) {
            this.showToast('No song selected');
            return;
        }

        if (this.data.isPlaying) {
            this.els.audio.pause();
            this.data.isPlaying = false;
            this.els.playIcon.className = 'fas fa-play';
        } else {
            this.els.audio.play().then(() => {
                this.data.isPlaying = true;
                this.els.playIcon.className = 'fas fa-pause';
            }).catch(e => {
                console.error('Play failed:', e);
                this.data.isPlaying = false;
                this.els.playIcon.className = 'fas fa-play';
                if (e.name === 'NotAllowedError') {
                    this.showToast('Browser blocked autoplay. Click play again.');
                } else {
                    this.showToast('Unable to play audio');
                }
            });
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
        this.resumeAudioContext();
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
        this.resumeAudioContext();
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

        // Skip lyrics fetching for now to avoid API errors
        // Lyrics can be added later when API endpoint is available
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
    async requestPremium() {
        if (!this.data.user) return;

        try {
            await db.collection('users').doc(this.data.user.uid).update({
                trialRequest: 'pending'
            });
            this.data.user.trialRequest = 'pending';
            this.updateUI();
            this.showToast('Premium request sent to Admin');
        } catch (error) {
            console.error('Request error:', error);
            this.showToast('Failed to send request');
        }
    },

    // ===== ADMIN =====
    async loadAdmin() {
        if (!this.data.user?.isAdmin) return;

        try {
            const pendingSnapshot = await db.collection('users')
                .where('trialRequest', '==', 'pending')
                .get();

            const premiumSnapshot = await db.collection('users')
                .where('isPremium', '==', true)
                .get();

            document.getElementById('admin-pending').textContent = pendingSnapshot.size;
            document.getElementById('admin-premium').textContent = premiumSnapshot.size;

            const tbody = document.getElementById('admin-tbody');
            tbody.innerHTML = '';

            if (pendingSnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px;">No pending requests</td></tr>';
                return;
            }

            pendingSnapshot.forEach(doc => {
                const user = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td><span style="color:var(--accent); font-weight:600;">Pending</span></td>
                    <td>
                        <button class="admin-action-btn accept" onclick="app.adminAction('${doc.id}', true)">Accept</button>
                        <button class="admin-action-btn reject" onclick="app.adminAction('${doc.id}', false)">Reject</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error('Admin load error:', error);
            this.showToast('Failed to load admin dashboard');
        }
    },

    async adminAction(uid, approve) {
        try {
            const updates = {};
            if (approve) {
                updates.isPremium = true;
                updates.trialRequest = 'approved';
                // Set expiry to 30 days from now
                const now = new Date();
                now.setDate(now.getDate() + 30);
                updates.premiumExpiry = firebase.firestore.Timestamp.fromDate(now);
            } else {
                updates.trialRequest = 'rejected';
            }

            await db.collection('users').doc(uid).update(updates);
            this.loadAdmin();
            this.showToast(`Request ${approve ? 'approved' : 'rejected'}`);
        } catch (error) {
            console.error('Admin action error:', error);
            this.showToast('Action failed');
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

