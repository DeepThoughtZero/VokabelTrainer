document.addEventListener('DOMContentLoaded', () => {
    // Game Config
    const CONFIG = {
        maxVocabsForMaxSpeed: 100,
        minZombieDuration: 2.0,
        maxZombieDuration: 15.0,
        streakForExtraOption: 3,
        streakForHeart: 10,
        missionTargetSize: 20,
        missionNewWordLimit: 3,
        missionMaxEncounters: 20,
        missionBossWordCount: 3,
        missionPhaseTransitionDurationMs: 6000,
        missionExtractionTransitionDurationMs: 4000,
        bubbleOnLeft: true, // Schalter: Setze auf false, um die Sprechblase wieder oben anzuzeigen
        enableParallax: false // Schalter: Deaktiviert, da die Bildübergänge aktuell nicht nahtlos sind
    };

    // Game State
    let state = {
        hunterType: 'laser',
        vocabPool: [],
        currentWord: null,
        hearts: 3,
        score: 0,
        zombiePosition: 800, // x coordinate
        zombieSpeed: 1, // pixels per frame
        gameRunning: false,
        startTime: 0,
        totalAttempts: 0,
        correctAttempts: 0,
        weaknesses: {}, // { 'word': failureCount }
        direction: 'de-foreign',
        level: 1,
        streak: 0,
        lastHeartRegenTime: 0,
        wrongAttemptsForCurrentWord: 0,
        zombieDead: false,
        maxStreak: 0,
        settingsPending: false,
        kategorie: '',
        courseId: 'en-5',
        city: 'london',
        wordsSinceLastBoss: 0,
        bossActive: false,
        bossHealth: 0,
        bossMaxHealth: 0,
        currentMode: 'de-foreign',
        playStyle: 'hunt',
        lastVocabId: '',
        correction: {
            queue: [],
            activeEntry: null,
            currentRetry: null,
            encounterSerial: 0,
            createdOrder: 0,
            confirmationTimer: null,
            resolvedBannerTimer: null,
            audio: null
        },
        mission: {
            targetWords: [],
            securedIds: new Set(),
            encounters: 0,
            lastVocabId: '',
            completed: false,
            endReason: '',
            currentPhase: '',
            finishing: false,
            transitionActive: false,
            startXp: 0,
            answerXp: 0,
            recoveredCorrectionIds: new Set(),
            briefingWords: [],
            briefingIndex: 0,
            districts: [],
            activeDistrictId: '',
            activeDistrictLabel: ''
        }
    };

    let activeCourse = window.getCourseById(state.courseId);
    let activeVocabulary = [];

    function getForeign(vocab) {
        return String(vocab.foreign ?? vocab.english ?? '');
    }

    function getGerman(vocab) {
        return String(vocab.german ?? '');
    }

    function normalizeVocabulary(courseId, vocabulary) {
        const pageCounters = new Map();
        return vocabulary.map((source, index) => {
            const page = source.page ?? 'x';
            const count = (pageCounters.get(page) || 0) + 1;
            pageCounters.set(page, count);
            return {
                ...source,
                id: source.id || `${courseId}-p${page}-${String(count).padStart(3, '0')}`,
                foreign: getForeign(source),
                german: getGerman(source),
                order: source.order ?? index + 1
            };
        });
    }

    function getCourseLabel() {
        return window.getCourseLabel(activeCourse);
    }

    function getSrsKey(vocab) {
        return `${state.courseId}:${vocab.id}`;
    }

    function recordWeakness(q, a, vocabObj) {
        if (!state.weaknesses[q]) {
            state.weaknesses[q] = { a: a, count: 0, vocab: vocabObj };
        }
        state.weaknesses[q].count++;
        
        // Die Vokabel zusätzlich in den Lostopf werfen, damit sie häufiger vorkommt
        state.vocabPool.push(vocabObj);
    }

    let animationId;
    let lastFrameTime = 0;
    
    let currentUIAudio = null;
    let missionPhaseTransitionTimer = null;
    let missionBriefingAudio = null;
    const MISSION_RADIO_INTROS = [
        { text: 'The next password to jam the zombie radar is', audio: 'assets/audio/ui/mission_radio_password_intro_1.mp3' },
        { text: 'Attention, your next radar jamming code is', audio: 'assets/audio/ui/mission_radio_password_intro_2.mp3' },
        { text: 'Incoming tactical update: the next password is', audio: 'assets/audio/ui/mission_radio_password_intro_3.mp3' },
        { text: 'Priority dispatch: the code to jam their radar is', audio: 'assets/audio/ui/mission_radio_password_intro_4.mp3' },
        { text: 'Transmission incoming: the target password is', audio: 'assets/audio/ui/mission_radio_password_intro_5.mp3' },
        { text: 'Airborne update: your next radar bypass code is', audio: 'assets/audio/ui/mission_radio_password_intro_6.mp3' },
        { text: 'Critical frequency locked: the next password is', audio: 'assets/audio/ui/mission_radio_password_intro_7.mp3' },
        { text: 'Stand by for radar jamming coordinates: the code is', audio: 'assets/audio/ui/mission_radio_password_intro_8.mp3' }
    ];
    const MISSION_RADIO_INTRO_PATHS = Array.from(
        { length: 8 },
        (_, index) => `assets/audio/ui/mission_radio_password_intro_${index + 1}.mp3`
    );
    let missionRadioAudio = null;
    let lastMissionRadioIntroIndex = -1;
    let currentBriefingRadioIntro = null;
    let missionRadioStatic = null;
    let missionRadioWordTimer = null;
    let missionRadioFallbackTimer = null;
    let missionBriefingAdvanceTimer = null;
    let haloDeploymentTimer = null;
    let haloMode = 'planning';

    function playUIAudio(filename) {
        if (currentUIAudio) {
            currentUIAudio.pause();
            currentUIAudio.currentTime = 0;
            currentUIAudio = null;
        }
        currentUIAudio = new Audio('assets/audio/ui/' + filename);
        duckAmbientAudio(true, 150);
        const restoreAmbient = () => duckAmbientAudio(false, 350);
        currentUIAudio.onended = restoreAmbient;
        currentUIAudio.onerror = restoreAmbient;
        currentUIAudio.play().catch(e => {
            console.log('UI audio playback failed:', e);
            restoreAmbient();
        });
    }

    function stopUIAudio() {
        if (currentUIAudio) {
            currentUIAudio.pause();
            currentUIAudio.currentTime = 0;
            currentUIAudio = null;
            duckAmbientAudio(false, 250);
        }
    }

    // ==========================================
    // Unified Seamless Dual-Channel Ambient Engine
    // ==========================================
    const AMBIENT_SCENES = {
        'command': {
            src: 'assets/audio/ui/halo_cargo_plane_ambient.mp3',
            targetVol: 0.32,
            duckVol: 0.12
        },
        'halo': {
            src: 'assets/audio/ui/halo_cargo_plane_ambient.mp3',
            targetVol: 0.30,
            duckVol: 0.10
        },
        'game': {
            src: 'assets/audio/ui/apocalypse_street_ambient.mp3',
            targetVol: 0.22,
            duckVol: 0.05
        },
        'tactical': {
            src: 'assets/audio/ui/tactical_war_room_ambient.mp3',
            targetVol: 0.18,
            duckVol: 0.06
        },
        'victory': {
            src: 'assets/audio/ui/safezone_victory_ambient.mp3',
            targetVol: 0.24,
            duckVol: 0.08
        }
    };

    const CROSSFADE_WINDOW_SEC = 2.8;

    let ambientPlayerA = null;
    let ambientPlayerB = null;
    let activeAmbientChannel = 'A';
    let currentAmbientSceneKey = null;
    let ambientCrossfadeTimer = null;
    let isAmbientPlaying = false;
    let commandEvasiveTimer = null;
    let isAmbientDucked = false;

    function fadeAudioVolume(audioElement, targetVol, durationMs, onComplete = null) {
        if (!audioElement) return;
        const startVol = Number(audioElement.volume) || 0;
        const clampedTarget = Math.max(0, Math.min(1, targetVol));
        const diff = clampedTarget - startVol;
        if (Math.abs(diff) < 0.01 || durationMs <= 0) {
            audioElement.volume = clampedTarget;
            if (onComplete) onComplete();
            return;
        }
        const steps = 16;
        const stepTime = durationMs / steps;
        let currentStep = 0;
        const timer = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;
            const vol = startVol + (diff * progress);
            audioElement.volume = Math.max(0, Math.min(1, vol));
            if (currentStep >= steps) {
                clearInterval(timer);
                audioElement.volume = clampedTarget;
                if (onComplete) onComplete();
            }
        }, stepTime);
        return timer;
    }

    function scheduleAmbientCrossfade(currentChannel, duration) {
        clearTimeout(ambientCrossfadeTimer);
        if (!isAmbientPlaying || !currentAmbientSceneKey) return;
        const scene = AMBIENT_SCENES[currentAmbientSceneKey];
        if (!scene) return;

        const dur = Number(duration) > CROSSFADE_WINDOW_SEC ? Number(duration) : 26;
        const delayMs = Math.max(500, (dur - CROSSFADE_WINDOW_SEC) * 1000);

        ambientCrossfadeTimer = setTimeout(() => {
            if (!isAmbientPlaying || !currentAmbientSceneKey) return;
            const nextChannel = currentChannel === 'A' ? 'B' : 'A';
            const outgoingPlayer = currentChannel === 'A' ? ambientPlayerA : ambientPlayerB;
            const incomingPlayer = nextChannel === 'A' ? ambientPlayerA : ambientPlayerB;

            if (incomingPlayer && outgoingPlayer) {
                const targetVolume = isAmbientDucked ? scene.duckVol : scene.targetVol;
                incomingPlayer.currentTime = 0;
                incomingPlayer.volume = 0;
                incomingPlayer.play().then(() => {
                    activeAmbientChannel = nextChannel;
                    fadeAudioVolume(incomingPlayer, targetVolume, CROSSFADE_WINDOW_SEC * 1000);
                    fadeAudioVolume(outgoingPlayer, 0, CROSSFADE_WINDOW_SEC * 1000, () => {
                        outgoingPlayer.pause();
                        outgoingPlayer.currentTime = 0;
                    });
                    const nextDur = incomingPlayer.duration || dur;
                    scheduleAmbientCrossfade(nextChannel, nextDur);
                }).catch(() => {});
            }
        }, delayMs);
    }

    function startSceneAmbient(sceneKey, fadeInMs = 900) {
        const scene = AMBIENT_SCENES[sceneKey];
        if (!scene) {
            stopSceneAmbient();
            return;
        }

        // If already playing the requested scene, preserve uninterrupted loop
        if (isAmbientPlaying && currentAmbientSceneKey === sceneKey) {
            return;
        }

        // Stop any previous scene immediately without delay
        stopSceneAmbient(0);

        isAmbientPlaying = true;
        isAmbientDucked = false;
        currentAmbientSceneKey = sceneKey;
        activeAmbientChannel = 'A';

        try {
            if (!ambientPlayerA) ambientPlayerA = new Audio();
            if (!ambientPlayerB) ambientPlayerB = new Audio();

            ambientPlayerA.src = scene.src;
            ambientPlayerB.src = scene.src;

            ambientPlayerA.currentTime = 0;
            ambientPlayerA.volume = 0;
            ambientPlayerA.play().then(() => {
                fadeAudioVolume(ambientPlayerA, scene.targetVol, fadeInMs);
                const dur = ambientPlayerA.duration || 26;
                scheduleAmbientCrossfade('A', dur);
            }).catch(error => {
                console.log(`Ambient audio playback (${sceneKey}) failed:`, error);
            });
        } catch (e) {
            console.warn('Could not start ambient audio:', e);
        }

        if (sceneKey === 'command') {
            clearTimeout(commandEvasiveTimer);
            commandEvasiveTimer = setTimeout(triggerEvasiveManeuver, 8000 + Math.random() * 5000);
        }
    }

    function stopSceneAmbient(fadeDurationMs = 500) {
        isAmbientPlaying = false;
        currentAmbientSceneKey = null;
        isAmbientDucked = false;
        clearTimeout(ambientCrossfadeTimer);
        ambientCrossfadeTimer = null;
        clearTimeout(commandEvasiveTimer);
        commandEvasiveTimer = null;
        clearEvasiveManeuver();

        const pA = ambientPlayerA;
        const pB = ambientPlayerB;

        if (fadeDurationMs > 0) {
            if (pA && !pA.paused) {
                fadeAudioVolume(pA, 0, fadeDurationMs, () => {
                    pA.pause();
                    pA.currentTime = 0;
                });
            }
            if (pB && !pB.paused) {
                fadeAudioVolume(pB, 0, fadeDurationMs, () => {
                    pB.pause();
                    pB.currentTime = 0;
                });
            }
        } else {
            if (pA) {
                pA.pause();
                pA.currentTime = 0;
            }
            if (pB) {
                pB.pause();
                pB.currentTime = 0;
            }
        }
    }

    function duckAmbientAudio(ducked, durationMs = 180) {
        if (!isAmbientPlaying || !currentAmbientSceneKey) return;
        const scene = AMBIENT_SCENES[currentAmbientSceneKey];
        if (!scene) return;

        isAmbientDucked = Boolean(ducked);
        const activePlayer = activeAmbientChannel === 'A' ? ambientPlayerA : ambientPlayerB;
        if (!activePlayer || activePlayer.paused) return;

        const targetVol = isAmbientDucked ? scene.duckVol : scene.targetVol;
        fadeAudioVolume(activePlayer, targetVol, durationMs);
    }

    function startCommandAmbientAudio() {
        startSceneAmbient('command');
    }

    function stopCommandAmbientAudio(fadeDurationMs = 500) {
        if (currentAmbientSceneKey === 'command') {
            stopSceneAmbient(fadeDurationMs);
        }
    }

    function clearEvasiveManeuver() {
        const card = document.getElementById('command-vocab-card');
        screens.command?.classList.remove('turbulence-active');
        document.body.classList.remove('turbulence-active');
        card?.classList.remove('turbulence-active', 'evasive-left', 'evasive-right', 'evasive-dive');

        if (isAmbientPlaying && currentAmbientSceneKey === 'command' && screens.command?.classList.contains('active')) {
            clearTimeout(commandEvasiveTimer);
            commandEvasiveTimer = setTimeout(triggerEvasiveManeuver, 7700 + Math.random() * 4900);
        }
    }

    function triggerEvasiveManeuver() {
        if (!screens.command?.classList.contains('active') || currentAmbientSceneKey !== 'command') return;
        const card = document.getElementById('command-vocab-card');
        if (!screens.command) return;

        screens.command.classList.remove('turbulence-active');
        document.body.classList.remove('turbulence-active');
        card?.classList.remove('turbulence-active', 'evasive-left', 'evasive-right', 'evasive-dive');
        void screens.command.offsetWidth;
        void document.body.offsetWidth;
        screens.command.classList.add('turbulence-active');
        document.body.classList.add('turbulence-active');

        // Duck ambient slightly during turbulence, then restore smoothly
        duckAmbientAudio(true, 250);
        setTimeout(() => {
            if (isAmbientPlaying && currentAmbientSceneKey === 'command') {
                duckAmbientAudio(false, 600);
            }
        }, 1600);

        try {
            const windAudio = new Audio('assets/audio/ui/halo_freefall_wind.mp3');
            windAudio.volume = 0.55;
            windAudio.play().catch(() => {});
        } catch (e) {}

        setTimeout(clearEvasiveManeuver, 1600);
    }

    // ==========================================
    // Critical Health Audio (1 Heart: Heartbeat & Heavy Breathing)
    // ==========================================
    let criticalHealthAudio = null;
    let isCriticalHealthAudioPlaying = false;

    function startCriticalHealthAudio(fadeInMs = 400) {
        if (isCriticalHealthAudioPlaying) return;
        if (!screens.game?.classList.contains('active') || !state.gameRunning || state.hearts !== 1) return;

        isCriticalHealthAudioPlaying = true;
        try {
            if (!criticalHealthAudio) {
                criticalHealthAudio = new Audio('assets/audio/ui/critical_health_heartbeat.mp3');
                criticalHealthAudio.loop = true;
            }
            criticalHealthAudio.volume = 0;
            criticalHealthAudio.play().then(() => {
                fadeAudioVolume(criticalHealthAudio, 0.45, fadeInMs);
            }).catch(error => {
                console.log('Critical health audio playback failed:', error);
            });
        } catch (e) {
            console.warn('Could not start critical health audio:', e);
        }
    }

    function stopCriticalHealthAudio(fadeDurationMs = 400) {
        if (!isCriticalHealthAudioPlaying && (!criticalHealthAudio || criticalHealthAudio.paused)) return;
        isCriticalHealthAudioPlaying = false;
        const player = criticalHealthAudio;
        if (!player) return;

        if (fadeDurationMs > 0 && !player.paused) {
            fadeAudioVolume(player, 0, fadeDurationMs, () => {
                player.pause();
                player.currentTime = 0;
            });
        } else {
            player.pause();
            player.currentTime = 0;
        }
    }

    // Audio Context for retro sound effects
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playShootSound() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }

    function playHitSound() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }

    function playCountSound() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    }

    // ========== GAMIFICATION & SRS ==========
    const PROFILE_KEY = 'vokabelzombie_profile';
    const SRS_KEY = 'vokabelzombie_srs_v2';
    const LEGACY_SRS_KEY = 'vokabelzombie_srs';

    const ACHIEVEMENTS = [
        { id: 'scharfschuetze', title: 'Scharfschütze', desc: '>95% Trefferquote in einer Runde', icon: '🎯' },
        { id: 'flammenstreif', title: 'Flammenstreif', desc: 'Ingame-Streak von 50 erreicht', icon: '🔥' },
        { id: 'centurion', title: 'Centurion', desc: '100 Vokabeln richtig in einer Runde', icon: '💯' },
        { id: 'weltreisender', title: 'Weltreisender', desc: 'Alle 7 Städte gespielt', icon: '🌍' },
        { id: 'allrounder', title: 'Allrounder', desc: 'Alle 6 Jäger verwendet', icon: '🦸' },
        { id: 'schreibkuenstler', title: 'Schreibkünstler', desc: '50 Vokabeln im Schreibmodus richtig', icon: '📝' },
        { id: 'blitzschnell', title: 'Blitzschnell', desc: 'Ø Antwortzeit < 4s in einer Runde', icon: '⚡' },
        { id: 'zombiemeister', title: 'Zombie-Meister', desc: '500 Zombies besiegt', icon: '🧟' },
        { id: 'ausdauernd', title: 'Ausdauernd', desc: '7 Tage in Folge gespielt', icon: '🗓️' },
        { id: 'erste_rettung', title: 'Erste Rettung', desc: 'Die erste Rettungsmission abgeschlossen', icon: '🚁' },
        { id: 'einsatzleiter', title: 'Einsatzleiter', desc: '10 Rettungsmissionen abgeschlossen', icon: '📡' },
        { id: 'goldkommando', title: 'Goldkommando', desc: '3 Goldmedaillen in Rettungsmissionen verdient', icon: '🥇' },
        { id: 'wortretter', title: 'Wortretter', desc: '100 Zielwörter in Rettungsmissionen gesichert', icon: '🛡️' }
    ];

    const LEVELS = [
        { xp: 0, name: 'Rekrut' },
        { xp: 1000, name: 'Kadett' },
        { xp: 4000, name: 'Jäger' },
        { xp: 10000, name: 'Veteran' },
        { xp: 20000, name: 'Elitejäger' },
        { xp: 50000, name: 'Zombiebezwinger' },
        { xp: 100000, name: 'Legende' }
    ];

    function getLevelInfo(xp) {
        let currentLevel = LEVELS[0];
        let nextLevel = LEVELS[1];
        for (let i = 0; i < LEVELS.length; i++) {
            if (xp >= LEVELS[i].xp) {
                currentLevel = LEVELS[i];
                nextLevel = LEVELS[i + 1] || null;
            } else {
                break;
            }
        }
        return { currentLevel, nextLevel };
    }

    function createDefaultProfile() {
        return {
            xp: 0,
            dailyStreak: 0,
            lastPlayDate: null,
            achievements: [],
            stats: {
                totalZombies: 0,
                citiesPlayed: [],
                huntersUsed: [],
                totalRounds: 0,
                writeModeCorrect: 0,
                rescue: window.VocabUtils.normalizeRescueCareer()
            }
        };
    }

    function normalizeProfile(value) {
        const defaults = createDefaultProfile();
        const source = value && typeof value === 'object' ? value : {};
        const stats = source.stats && typeof source.stats === 'object' ? source.stats : {};
        return {
            ...defaults,
            ...source,
            xp: Math.max(0, Math.floor(Number(source.xp) || 0)),
            dailyStreak: Math.max(0, Math.floor(Number(source.dailyStreak) || 0)),
            achievements: Array.isArray(source.achievements) ? [...new Set(source.achievements)] : [],
            stats: {
                ...defaults.stats,
                ...stats,
                totalZombies: Math.max(0, Math.floor(Number(stats.totalZombies) || 0)),
                citiesPlayed: Array.isArray(stats.citiesPlayed) ? [...new Set(stats.citiesPlayed)] : [],
                huntersUsed: Array.isArray(stats.huntersUsed) ? [...new Set(stats.huntersUsed)] : [],
                totalRounds: Math.max(0, Math.floor(Number(stats.totalRounds) || 0)),
                writeModeCorrect: Math.max(0, Math.floor(Number(stats.writeModeCorrect) || 0)),
                rescue: window.VocabUtils.normalizeRescueCareer(stats.rescue)
            }
        };
    }

    function loadProfile() {
        try {
            const data = localStorage.getItem(PROFILE_KEY);
            if (data) return normalizeProfile(JSON.parse(data));
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
        return createDefaultProfile();
    }

    function saveProfile(profile) {
        try {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
    }

    function loadSRS() {
        try {
            const data = localStorage.getItem(SRS_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed && parsed.version === 2 && parsed.entries) return parsed;
            }
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
        return { version: 2, entries: {} };
    }

    function saveSRS(srs) {
        try {
            localStorage.setItem(SRS_KEY, JSON.stringify(srs));
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
    }

    let playerProfile = loadProfile();
    let srsData = loadSRS();

    function migrateLegacySRSForEnglish5() {
        if (state.courseId !== 'en-5' || srsData.legacyEnglish5Migrated) return;
        try {
            const legacyRaw = localStorage.getItem(LEGACY_SRS_KEY);
            const legacy = legacyRaw ? JSON.parse(legacyRaw) : {};
            activeVocabulary.forEach(vocab => {
                const oldRecord = legacy[getForeign(vocab)];
                const key = getSrsKey(vocab);
                if (oldRecord && !srsData.entries[key]) {
                    srsData.entries[key] = { ...oldRecord };
                }
            });
            srsData.legacyEnglish5Migrated = true;
            saveSRS(srsData);
        } catch (error) {
            console.warn('Legacy-SRS konnte nicht migriert werden:', error);
        }
    }

    function getOrCreateSrsRecord(vocab) {
        const key = getSrsKey(vocab);
        if (!srsData.entries[key]) {
            srsData.entries[key] = { timesCorrect: 0, timesFailed: 0, lastSeen: 0 };
        }
        return srsData.entries[key];
    }

    function checkDailyStreak() {
        const today = new Date().toDateString();
        if (playerProfile.lastPlayDate !== today) {
            if (playerProfile.lastPlayDate) {
                const lastDate = new Date(playerProfile.lastPlayDate);
                const currentDate = new Date(today);
                const diffTime = Math.abs(currentDate - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                if (diffDays === 1) {
                    playerProfile.dailyStreak++;
                } else if (diffDays > 1) {
                    playerProfile.dailyStreak = 1;
                }
            } else {
                playerProfile.dailyStreak = 1;
            }
            playerProfile.lastPlayDate = today;
            saveProfile(playerProfile);
        }
    }

    function updateProfileUI() {
        const { currentLevel, nextLevel } = getLevelInfo(playerProfile.xp);
        
        const profileLevelName = document.getElementById('profile-level-name');
        const profileXpText = document.getElementById('profile-xp-text');
        const profileXpFill = document.getElementById('profile-xp-fill');
        const achievementsContainer = document.getElementById('achievements-container');
        
        if (profileLevelName) profileLevelName.textContent = currentLevel.name;
        
        if (nextLevel) {
            const progress = ((playerProfile.xp - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100;
            if (profileXpFill) profileXpFill.style.width = Math.min(progress, 100) + '%';
            if (profileXpText) profileXpText.textContent = `${playerProfile.xp} / ${nextLevel.xp} XP`;
        } else {
            if (profileXpFill) profileXpFill.style.width = '100%';
            if (profileXpText) profileXpText.textContent = `${playerProfile.xp} XP (Max Level)`;
        }

        if (achievementsContainer) {
            achievementsContainer.innerHTML = '';
            ACHIEVEMENTS.forEach(ach => {
                const isUnlocked = playerProfile.achievements.includes(ach.id);
                const card = document.createElement('div');
                card.className = 'achievement-card' + (isUnlocked ? '' : ' locked');
                card.innerHTML = `
                    <div class="achievement-icon">${ach.icon}</div>
                    <h4>${ach.title}</h4>
                    <p>${ach.desc}</p>
                `;
                achievementsContainer.appendChild(card);
            });
        }

        const rescue = window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue);
        const profileMissionCount = document.getElementById('profile-rescue-missions');
        const profileRescuedWords = document.getElementById('profile-rescued-words');
        const profilePerfectMissions = document.getElementById('profile-perfect-missions');
        const profileRescueMedals = document.getElementById('profile-rescue-medals');
        if (profileMissionCount) profileMissionCount.textContent = rescue.missionsCompleted;
        if (profileRescuedWords) profileRescuedWords.textContent = rescue.rescuedWords;
        if (profilePerfectMissions) profilePerfectMissions.textContent = rescue.perfectMissions;
        if (profileRescueMedals) {
            profileRescueMedals.textContent = `🥇 ${rescue.medals.gold} · 🥈 ${rescue.medals.silver} · 🥉 ${rescue.medals.bronze}`;
        }
        
        const streakDisplay = document.getElementById('daily-streak-display');
        const streakCount = document.getElementById('daily-streak-count');
        const profileStreakDisplay = document.getElementById('profile-daily-streak-display');
        const profileStreakCount = document.getElementById('profile-daily-streak-count');

        if (playerProfile.dailyStreak > 0) {
            if (streakDisplay && streakCount) {
                streakDisplay.style.display = 'block';
                streakCount.textContent = playerProfile.dailyStreak;
            }
            if (profileStreakDisplay && profileStreakCount) {
                profileStreakDisplay.style.display = 'block';
                profileStreakCount.textContent = playerProfile.dailyStreak;
            }
        } else {
            if (streakDisplay) streakDisplay.style.display = 'none';
            if (profileStreakDisplay) profileStreakDisplay.style.display = 'none';
        }
    }

    function fireConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const particles = [];
        const colors = ['#00ff88', '#00ffff', '#ff00ff', '#ffff00', '#ff5500', '#0088ff'];
        
        for (let i = 0; i < 150; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                r: Math.random() * 6 + 4,
                dx: Math.random() * 20 - 10,
                dy: Math.random() * -20 - 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                tilt: Math.floor(Math.random() * 10) - 10,
                tiltAngleIncrement: (Math.random() * 0.07) + 0.05,
                tiltAngle: 0
            });
        }
        
        let frameCount = 0;
        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;
            
            for (let i = 0; i < particles.length; i++) {
                let p = particles[i];
                p.tiltAngle += p.tiltAngleIncrement;
                p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2;
                p.x += Math.sin(p.tiltAngle) * 2;
                p.dy += 0.2; // gravity
                p.x += p.dx;
                p.y += p.dy;
                
                if (p.y <= canvas.height) active = true;
                
                ctx.beginPath();
                ctx.lineWidth = p.r;
                ctx.strokeStyle = p.color;
                ctx.moveTo(p.x + p.tilt + p.r, p.y);
                ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
                ctx.stroke();
            }
            
            frameCount++;
            if (active && frameCount < 300) {
                requestAnimationFrame(render);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        render();
    }

    function addXP(amount) {
        const prevLevel = getLevelInfo(playerProfile.xp).currentLevel;
        playerProfile.xp += amount;
        saveProfile(playerProfile);
        
        const newLevel = getLevelInfo(playerProfile.xp).currentLevel;
        if (newLevel.xp > prevLevel.xp) {
            // Level Up!
            const levelNameLower = newLevel.name.toLowerCase();
            let audioFile = '';
            if (levelNameLower === 'kadett') audioFile = 'levelup_kadett.mp3';
            else if (levelNameLower === 'jäger') audioFile = 'levelup_jaeger.mp3';
            else if (levelNameLower === 'veteran') audioFile = 'levelup_veteran.mp3';
            else if (levelNameLower === 'elitejäger') audioFile = 'levelup_elitejaeger.mp3';
            else if (levelNameLower === 'zombiebezwinger') audioFile = 'levelup_zombiebezwinger.mp3';
            else if (levelNameLower === 'legende') audioFile = 'levelup_legende.mp3';
            
            if (audioFile) {
                playUIAudio(audioFile);
            }
            fireConfetti();
        }
    }

    function finalizeMissionReward() {
        const previousCareer = window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue);
        const districtAlreadyCleared = previousCareer.clearedDistricts.includes(state.mission.activeDistrictId);
        const activeDistrict = getActiveMissionDistrict();
        const mastery = activeDistrict
            ? window.VocabUtils.getDistrictMastery(activeDistrict, activeVocabulary, srsData, state.courseId)
            : { isFullyMastered: false, masteredWords: 0, totalWords: 0 };
        const threat = activeDistrict
            ? window.VocabUtils.evaluateDistrictThreat(activeDistrict, activeVocabulary, srsData, previousCareer, state.courseId)
            : null;
        const isEvent = Boolean(threat && (threat.status === 'emergency' || threat.status === 'reinfested'));

        const reward = window.VocabUtils.calculateMissionReward({
            answerXp: state.mission.answerXp,
            securedCount: state.mission.securedIds.size,
            targetCount: state.mission.targetWords.length,
            recoveredCorrections: state.mission.recoveredCorrectionIds.size,
            hearts: state.hearts,
            totalAttempts: state.totalAttempts,
            correctAttempts: state.correctAttempts,
            currentMissionStreak: previousCareer.currentStreak,
            districtAlreadyCleared,
            isFullyLiberated: mastery.isFullyMastered,
            isEvent,
            failed: state.mission.failed
        });
        const bonusXp = reward.completionBonusXp
            + reward.recoveryBonusXp
            + reward.survivalBonusXp
            + reward.liberationBonusXp
            + reward.streakBonusXp
            + (reward.eventBonusXp || 0);
        if (bonusXp > 0) addXP(bonusXp);
        const careerReward = {
            ...reward,
            districtId: state.mission.activeDistrictId
        };
        playerProfile.stats.rescue = window.VocabUtils.addMissionToRescueCareer(
            playerProfile.stats.rescue,
            careerReward
        );
        return {
            ...reward,
            startXp: state.mission.startXp,
            endXp: playerProfile.xp,
            career: playerProfile.stats.rescue,
            districtId: state.mission.activeDistrictId,
            districtLabel: state.mission.activeDistrictLabel
        };
    }

    function renderMissionLevelProgress(xp) {
        const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
        const { currentLevel, nextLevel } = getLevelInfo(safeXp);
        const levelName = document.getElementById('mission-level-name');
        const levelText = document.getElementById('mission-level-xp-text');
        const levelFill = document.getElementById('mission-level-fill');
        if (levelName) levelName.textContent = currentLevel.name;
        if (nextLevel) {
            const levelSpan = nextLevel.xp - currentLevel.xp;
            const progress = levelSpan > 0 ? ((safeXp - currentLevel.xp) / levelSpan) * 100 : 100;
            if (levelText) levelText.textContent = `${safeXp} / ${nextLevel.xp} XP`;
            if (levelFill) levelFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        } else {
            if (levelText) levelText.textContent = `${safeXp} XP · Maximalstufe`;
            if (levelFill) levelFill.style.width = '100%';
        }
    }

    function prepareMissionProgression(reward, newlyUnlocked) {
        const panel = document.getElementById('mission-progression');
        if (!panel || !reward) return;
        panel.classList.remove('hidden');
        document.getElementById('mission-xp-earned').textContent = '0';
        document.getElementById('mission-answer-xp').textContent = reward.answerXp;
        document.getElementById('mission-completion-xp').textContent = `+${reward.completionBonusXp}`;
        document.getElementById('mission-liberation-xp').textContent = `+${reward.liberationBonusXp}`;
        document.getElementById('mission-survival-xp').textContent = `+${reward.survivalBonusXp}`;
        document.getElementById('mission-streak-xp').textContent = `+${reward.streakBonusXp}`;
        document.getElementById('mission-recovery-xp').textContent = `+${reward.recoveryBonusXp}`;
        const eventXpEl = document.getElementById('mission-event-xp');
        if (eventXpEl) eventXpEl.textContent = `+${reward.eventBonusXp || 0}`;
        document.getElementById('mission-career-count').textContent = reward.career.missionsCompleted;
        document.getElementById('mission-career-streak').textContent = reward.career.currentStreak;
        document.getElementById('mission-career-words').textContent = reward.career.rescuedWords;
        document.getElementById('mission-career-perfect').textContent = reward.career.perfectMissions;
        document.getElementById('mission-career-medals').textContent = [
            `🥇 ${reward.career.medals.gold}`,
            `🥈 ${reward.career.medals.silver}`,
            `🥉 ${reward.career.medals.bronze}`
        ].join(' · ');
        renderMissionLevelProgress(reward.startXp);

        const districtPanel = document.getElementById('mission-district-cleared');
        const districtName = document.getElementById('mission-district-cleared-name');
        const districtCleared = reward.completed && Boolean(reward.districtId);
        districtPanel?.classList.toggle('hidden', !districtCleared);
        if (districtCleared && districtName) {
            districtName.textContent = reward.districtLabel || 'Neues Viertel';
        }

        const unlockPanel = document.getElementById('mission-achievement-unlock');
        const unlockTitle = document.getElementById('mission-achievement-unlock-title');
        const unlockedAchievements = ACHIEVEMENTS.filter(achievement => newlyUnlocked.includes(achievement.id));
        const unlockedRescueAchievements = unlockedAchievements.filter(achievement => (
            ['erste_rettung', 'einsatzleiter', 'goldkommando', 'wortretter'].includes(achievement.id)
        ));
        unlockPanel?.classList.toggle('hidden', unlockedRescueAchievements.length === 0);
        if (unlockTitle && unlockedRescueAchievements.length > 0) {
            unlockTitle.textContent = unlockedRescueAchievements
                .map(achievement => `${achievement.icon} ${achievement.title}`)
                .join(' · ');
        }
    }

    function animateMissionProgression(reward) {
        const earnedElement = document.getElementById('mission-xp-earned');
        if (!earnedElement || !reward) return;
        const duration = 1800;
        const startedAt = performance.now();

        function tick(now) {
            const progress = Math.min((now - startedAt) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentXp = Math.round(reward.startXp + ((reward.endXp - reward.startXp) * eased));
            earnedElement.textContent = Math.round(reward.totalXp * eased);
            renderMissionLevelProgress(currentXp);
            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                earnedElement.textContent = reward.totalXp;
                renderMissionLevelProgress(reward.endXp);
            }
        }
        requestAnimationFrame(tick);
    }

    function checkAchievements(roundStats) {
        let newlyUnlocked = [];
        
        if (roundStats.totalWords >= 20 && (roundStats.correctWords / roundStats.totalWords) >= 0.95) {
            if (!playerProfile.achievements.includes('scharfschuetze')) newlyUnlocked.push('scharfschuetze');
        }
        if (state.maxStreak >= 50) {
            if (!playerProfile.achievements.includes('flammenstreif')) newlyUnlocked.push('flammenstreif');
        }
        if (roundStats.correctWords >= 100) {
            if (!playerProfile.achievements.includes('centurion')) newlyUnlocked.push('centurion');
        }
        if (playerProfile.stats.citiesPlayed.length >= 7) {
            if (!playerProfile.achievements.includes('weltreisender')) newlyUnlocked.push('weltreisender');
        }
        if (playerProfile.stats.huntersUsed.length >= 6) {
            if (!playerProfile.achievements.includes('allrounder')) newlyUnlocked.push('allrounder');
        }
        if (playerProfile.stats.writeModeCorrect >= 50) {
            if (!playerProfile.achievements.includes('schreibkuenstler')) newlyUnlocked.push('schreibkuenstler');
        }
        if (roundStats.totalWords >= 20 && roundStats.avgTime < 4000) { // < 4s
            if (!playerProfile.achievements.includes('blitzschnell')) newlyUnlocked.push('blitzschnell');
        }
        if (playerProfile.stats.totalZombies >= 500) {
            if (!playerProfile.achievements.includes('zombiemeister')) newlyUnlocked.push('zombiemeister');
        }
        if (playerProfile.dailyStreak >= 7) {
            if (!playerProfile.achievements.includes('ausdauernd')) newlyUnlocked.push('ausdauernd');
        }
        const rescue = window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue);
        if (rescue.missionsCompleted >= 1) {
            if (!playerProfile.achievements.includes('erste_rettung')) newlyUnlocked.push('erste_rettung');
        }
        if (rescue.missionsCompleted >= 10) {
            if (!playerProfile.achievements.includes('einsatzleiter')) newlyUnlocked.push('einsatzleiter');
        }
        if (rescue.medals.gold >= 3) {
            if (!playerProfile.achievements.includes('goldkommando')) newlyUnlocked.push('goldkommando');
        }
        if (rescue.rescuedWords >= 100) {
            if (!playerProfile.achievements.includes('wortretter')) newlyUnlocked.push('wortretter');
        }
        
        if (newlyUnlocked.length > 0) {
            playerProfile.achievements.push(...newlyUnlocked);
            saveProfile(playerProfile);
            // We could show a toast here, but we will just fire confetti on the end screen
            fireConfetti();
        }
        return newlyUnlocked;
    }

    // Call checkDailyStreak on startup
    checkDailyStreak();

    // ========== PERSONAL BESTS (localStorage) ==========
    const PB_KEY = 'vokabelzombie_personal_bests_v2';
    const LEGACY_PB_KEY = 'vokabelzombie_personal_bests';

    function emptyPersonalBests() {
        return { highscore: 0, maxStreak: 0, bestAccuracy: 0 };
    }

    function loadAllPersonalBests() {
        try {
            const data = localStorage.getItem(PB_KEY);
            const parsed = data ? JSON.parse(data) : null;
            return parsed && parsed.version === 2 && parsed.courses
                ? parsed
                : { version: 2, courses: {}, legacyEnglish5Migrated: false };
        } catch (e) {
            return { version: 2, courses: {}, legacyEnglish5Migrated: false };
        }
    }

    function saveAllPersonalBests(data) {
        try {
            localStorage.setItem(PB_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
    }

    function loadPersonalBests() {
        const all = loadAllPersonalBests();
        if (state.courseId === 'en-5' && !all.legacyEnglish5Migrated) {
            try {
                const legacyRaw = localStorage.getItem(LEGACY_PB_KEY);
                const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
                if (legacy && !all.courses['en-5']) all.courses['en-5'] = legacy;
            } catch (error) {
                console.warn('Legacy-Bestwerte konnten nicht migriert werden:', error);
            }
            all.legacyEnglish5Migrated = true;
            saveAllPersonalBests(all);
        }
        return { ...emptyPersonalBests(), ...(all.courses[state.courseId] || {}) };
    }

    function savePersonalBests(pb) {
        const all = loadAllPersonalBests();
        all.courses[state.courseId] = pb;
        saveAllPersonalBests(all);
    }

    function checkAndUpdatePersonalBests(score, maxStreak, accuracy) {
        const pb = loadPersonalBests();
        let isNewRecord = false;
        if (score > pb.highscore) { pb.highscore = score; isNewRecord = true; }
        if (maxStreak > pb.maxStreak) { pb.maxStreak = maxStreak; isNewRecord = true; }
        if (accuracy > pb.bestAccuracy) { pb.bestAccuracy = accuracy; isNewRecord = true; }
        savePersonalBests(pb);
        return isNewRecord;
    }

    function updatePersonalBestsUI() {
        const pb = loadPersonalBests();
        const hsEl = document.getElementById('pb-highscore');
        const stEl = document.getElementById('pb-streak');
        const acEl = document.getElementById('pb-accuracy');
        if (hsEl) hsEl.textContent = pb.highscore;
        if (stEl) stEl.textContent = pb.maxStreak;
        if (acEl) acEl.textContent = pb.bestAccuracy > 0 ? pb.bestAccuracy + '%' : '\u2013';
        
        const pbLevelEl = document.getElementById('pb-level-display');
        if (pbLevelEl) {
            const { currentLevel } = getLevelInfo(playerProfile.xp);
            pbLevelEl.textContent = currentLevel.name;
        }
    }

    // ========== SCORE POPUP ==========
    function showScorePopup(points, x, y) {
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        
        let text = '+' + points;
        let fontSize = 3;
        let color = '#00ff88';
        
        if (state.streak >= 10) {
            text += ' \uD83D\uDC80'; // 💀
            fontSize = 4.5;
            color = '#ff3300';
        } else if (state.streak >= 5) {
            text += ' \uD83D\uDD25'; // 🔥
            fontSize = 4;
            color = '#ffaa00';
        } else if (state.streak >= 3) {
            fontSize = 3.5;
            color = '#ffcc00';
        }
        
        popup.textContent = text;
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';
        popup.style.fontSize = fontSize + 'rem';
        popup.style.color = color;
        
        canvas.appendChild(popup);
        popup.addEventListener('animationend', () => popup.remove());
    }

    // ========== SCREEN SHAKE ==========
    function triggerScreenShake(intensity) {
        const cls = intensity === 'heavy' ? 'shake-heavy' : 'shake-light';
        canvas.classList.remove('shake-light', 'shake-heavy');
        void canvas.offsetWidth; // reflow to retrigger
        canvas.classList.add(cls);
        canvas.addEventListener('animationend', () => {
            canvas.classList.remove(cls);
        }, { once: true });
    }

    // ========== VIGNETTE FOR LOW HEALTH ==========
    function updateVignetteUI() {
        const overlay = document.getElementById('vignette-overlay');
        if (!overlay) return;
        if (state.hearts === 1) {
            overlay.className = 'vignette-danger';
        } else if (state.streak >= 10) {
            overlay.className = 'vignette-streak';
        } else {
            overlay.className = '';
        }
    }

    // ========== RANK CALCULATION ==========
    function calculateRank(accuracy) {
        if (accuracy >= 95) return { rank: 'S', label: '\u2B50\u2B50\u2B50 Legendär!', css: 'rank-s' };
        if (accuracy >= 80) return { rank: 'A', label: '\u2B50\u2B50 Ausgezeichnet', css: 'rank-a' };
        if (accuracy >= 60) return { rank: 'B', label: '\u2B50 Gut gemacht', css: 'rank-b' };
        return { rank: 'C', label: 'Weiter üben!', css: 'rank-c' };
    }

    // ========== ANIMATED SCORE COUNTER ==========
    function animateScoreCounter(targetScore, element, callback) {
        const duration = 2000; // 2 seconds
        const startTime = performance.now();
        element.classList.add('score-counting');
        element.textContent = '0';
        
        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic for satisfying deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(eased * targetScore);
            element.textContent = currentValue;
            
            if (progress < 1) {
                // Play tick sound every ~80ms
                if (Math.floor(elapsed / 80) !== Math.floor((elapsed - 16) / 80)) {
                    playCountSound();
                }
                requestAnimationFrame(tick);
            } else {
                element.textContent = targetScore;
                element.classList.remove('score-counting');
                if (callback) callback();
            }
        }
        requestAnimationFrame(tick);
    }

    // DOM Elements
    const screens = {
        terms: document.getElementById('terms-screen'),
        course: document.getElementById('course-selection-screen'),
        login: document.getElementById('login-screen'),
        hunter: document.getElementById('hunter-selection-screen'),
        city: document.getElementById('city-selection-screen'),
        mission: document.getElementById('mission-selection-screen'),
        start: document.getElementById('start-screen'),
        command: document.getElementById('command-center-screen'),
        halo: document.getElementById('halo-screen'),
        game: document.getElementById('game-screen'),
        end: document.getElementById('end-screen')
    };

    const acceptTermsBtn = document.getElementById('accept-terms-btn');
    if (acceptTermsBtn) {
        acceptTermsBtn.addEventListener('click', () => {
            showCourseSelectionScreen();
        });
    }

    let pendingGrade = 5;
    let pendingCourseId = 'en-5';

    function renderSubjectSelection() {
        const container = document.getElementById('subject-selection');
        if (!container) return;
        container.innerHTML = '';

        const courses = window.COURSES.filter(course => course.grade === pendingGrade);
        const available = courses.filter(course => course.available && (window.VOCABULARIES[course.id] || []).length > 0);
        if (!available.some(course => course.id === pendingCourseId)) {
            pendingCourseId = available[0]?.id || '';
        }

        courses.forEach(course => {
            const vocabCount = (window.VOCABULARIES[course.id] || []).length;
            const enabled = course.available && vocabCount > 0;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'subject-card' + (course.id === pendingCourseId ? ' active' : '');
            button.dataset.courseId = course.id;
            button.disabled = !enabled;
            button.setAttribute('aria-pressed', course.id === pendingCourseId ? 'true' : 'false');
            button.innerHTML = `${course.subjectLabel}<small>${enabled ? `${vocabCount} Vokabeln` : 'Wird vorbereitet'}</small>`;
            button.addEventListener('click', () => {
                pendingCourseId = course.id;
                renderSubjectSelection();
            });
            container.appendChild(button);
        });

    }

    document.querySelectorAll('.grade-card').forEach(button => {
        button.addEventListener('click', () => {
            pendingGrade = Number(button.dataset.grade);
            document.querySelectorAll('.grade-card').forEach(card => {
                const active = card === button;
                card.classList.toggle('active', active);
                card.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            renderSubjectSelection();
        });
    });

    const confirmCourseBtn = document.getElementById('confirm-course-btn');
    if (confirmCourseBtn) {
        confirmCourseBtn.addEventListener('click', () => {
            if (!pendingCourseId || !activateCourse(pendingCourseId)) return;
            showHunterScreen();
        });
    }

    const changeCourseBtn = document.getElementById('change-course-btn');
    if (changeCourseBtn) changeCourseBtn.addEventListener('click', showCourseSelectionScreen);

    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('secret-password');
    const loginError = document.getElementById('login-error');
    
    const SECRET_HASH = "Wm9tYmll";

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    function handleLogin() {
        const input = passwordInput.value.trim();
        if (btoa(input) === SECRET_HASH) {
            loginError.classList.add('hidden');
            showScreen('terms');
        } else {
            loginError.classList.remove('hidden');
            // Remove animation class and add it back to trigger the shake animation again
            loginError.classList.remove('error-msg');
            void loginError.offsetWidth; // trigger reflow
            loginError.classList.add('error-msg');
        }
    }

    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsDialog = document.getElementById('settings-dialog');
    const confirmSettingsBtn = document.getElementById('confirm-settings-btn');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    const infoBtn = document.getElementById('info-btn');
    const infoDialog = document.getElementById('info-dialog');
    const closeInfoBtn = document.getElementById('close-info-btn');
    const optionsContainer = document.getElementById('options-container');
    const zombieEl = document.getElementById('zombie');
    const zombieWordEl = document.getElementById('zombie-word');
    const scoreEl = document.getElementById('score');
    const hearts = document.querySelectorAll('.heart');
    const canvas = document.getElementById('game-canvas');
    const projectile = document.getElementById('projectile');
    const zombieImgEl = document.getElementById('zombie-img');
    const hunterEl = document.getElementById('hunter-img');
    const hunterContainer = document.getElementById('hunter');
    const correctionPanel = document.getElementById('correction-panel');
    const correctionPool = document.getElementById('correction-pool');
    const correctionTarget = document.getElementById('correction-target');
    const correctionFeedback = document.getElementById('correction-feedback');
    const markedRetryBanner = document.getElementById('marked-retry-banner');

    // Zombie Sprite Sheet Animation
    const zombieSpriteCanvas = document.getElementById('zombie-sprite-canvas');
    const zombieSpriteCtx = zombieSpriteCanvas ? zombieSpriteCanvas.getContext('2d') : null;
    const ZOMBIE_SPRITES = {
        'assets/zombie10.png': {
            sheetSrc: 'assets/zombie10_sheet.png',
            cols: 6,
            rows: 11,
            frameCount: 64, // 6x11=66 tiles, but only 64 actual frames
            fps: 8,
            img: new Image()
        },
        'assets/zombie01.png': {
            sheetSrc: 'assets/zombie01_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie02.png': {
            sheetSrc: 'assets/zombie02_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie03.png': {
            sheetSrc: 'assets/zombie03_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie04.png': {
            sheetSrc: 'assets/zombie04_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie05.png': {
            sheetSrc: 'assets/zombie05_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie06.png': {
            sheetSrc: 'assets/zombie06_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        },
        'assets/zombie07.png': {
            sheetSrc: 'assets/zombie07_sheet.png',
            cols: 6,
            rows: 7,
            frameCount: 40, // 6x7=42 tiles, exactly 40 actual frames (0..39)
            fps: 8,
            img: new Image()
        }
    };
    Object.values(ZOMBIE_SPRITES).forEach(sprite => {
        sprite.img.src = sprite.sheetSrc;
    });

    let activeZombieSprite = null;
    let zombieCurrentFrame = 0;
    let zombieLastFrameTime = 0;

    // Hunter Sprite Sheet Animation
    const hunterSpriteCanvas = document.getElementById('hunter-sprite-canvas');
    const hunterSpriteCtx = hunterSpriteCanvas ? hunterSpriteCanvas.getContext('2d') : null;
    const HUNTER_SPRITES = {
        'laser': {
            sheetSrc: 'assets/hunter_commanderneon_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 220,
            startX: 430,
            img: new Image()
        },
        'water': {
            sheetSrc: 'assets/hunter_water_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 275,
            startX: 430,
            img: new Image()
        },
        'fire': {
            sheetSrc: 'assets/hunter_pyroblaze_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 590,
            startX: 420,
            img: new Image()
        },
        'lightning': {
            sheetSrc: 'assets/hunter_voltmaster_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 300,
            startX: 430,
            img: new Image()
        },
        'fuchsia': {
            sheetSrc: 'assets/hunter_fuchsia_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 405,
            startX: 430,
            img: new Image()
        },
        'pink': {
            sheetSrc: 'assets/hunter_pinkypump_sheet.png',
            cols: 5,
            rows: 5,
            frameCount: 25,
            fps: 24,
            muzzleY: 440,
            startX: 440,
            img: new Image()
        }
    };
    Object.values(HUNTER_SPRITES).forEach(sprite => {
        sprite.img.src = sprite.sheetSrc;
    });

    let hunterAnimationActive = false;
    let hunterCurrentFrame = 0;
    let hunterLastFrameTime = 0;

    function renderHunterSpriteFrame(sprite) {
        if (!hunterSpriteCtx || !sprite || !sprite.img.complete) return;
        const frameW = sprite.img.width / sprite.cols;
        const frameH = sprite.img.height / sprite.rows;
        const srcX = (hunterCurrentFrame % sprite.cols) * frameW;
        const srcY = Math.floor(hunterCurrentFrame / sprite.cols) * frameH;

        hunterSpriteCanvas.width = frameW;
        hunterSpriteCanvas.height = frameH;
        hunterSpriteCtx.clearRect(0, 0, frameW, frameH);
        hunterSpriteCtx.drawImage(sprite.img, srcX, srcY, frameW, frameH, 0, 0, frameW, frameH);
    }

    function triggerHunterShootAnimation() {
        const sprite = HUNTER_SPRITES[state.hunterType] || HUNTER_SPRITES['laser'];
        if (hunterSpriteCanvas && sprite && sprite.img.complete) {
            hunterAnimationActive = true;
            hunterCurrentFrame = 0;
            hunterLastFrameTime = performance.now();
            hunterEl.style.display = 'none';
            hunterSpriteCanvas.style.display = 'block';
            renderHunterSpriteFrame(sprite);
        }
    }

    function resetHunterAnimation() {
        hunterAnimationActive = false;
        if (hunterSpriteCanvas) hunterSpriteCanvas.style.display = 'none';
        if (hunterEl) hunterEl.style.display = '';
    }

    const HUNTERS = [
        { id: 'laser', name: 'Commander Neon', desc: 'Meister der Laser-Waffen.', img: 'assets/hunter_commanderneon.png', element: 'laser' },
        { id: 'water', name: 'Hydro Striker', desc: 'Spezialist für Wasser-Angriffe.', img: 'assets/hunter_water.png', element: 'water' },
        { id: 'fire', name: 'Pyro Blaze', desc: 'Entfesselt die Kraft des Feuers.', img: 'assets/hunter_pyroblaze.png', element: 'fire' },
        { id: 'lightning', name: 'Volt Master', desc: 'Elektrisiert die Untoten.', img: 'assets/hunter_voltmaster.png', element: 'lightning' },
        { id: 'fuchsia', name: 'Fuchsia', desc: 'Meisterin der arkanen Künste.', img: 'assets/hunter_fuchsia.png', element: 'fuchsia' },
        { id: 'pink', name: 'Pinky Pump', desc: 'Mit der Pumpgun auf Zombiejagd.', img: 'assets/hunter_pinkypump.png', element: 'pink' }
    ];

    const CITIES = [
        { id: 'london', name: 'London', img: 'assets/background_london.png', mapImg: 'assets/map_london.webp' },
        { id: 'brighton', name: 'Brighton', img: 'assets/background_brighton.png', mapImg: 'assets/map_brighton.webp' },
        { id: 'buehl', name: 'Bühl', img: 'assets/background_buehl.png', mapImg: 'assets/map_buehl.webp' },
        { id: 'capetown', name: 'Cape Town', img: 'assets/background_capetown.png', mapImg: 'assets/map_capetown.webp' },
        { id: 'istanbul', name: 'Istanbul', img: 'assets/background_istanbul.png', mapImg: 'assets/map_istanbul.webp' },
        { id: 'rio', name: 'Rio', img: 'assets/background_rio.png', mapImg: 'assets/map_rio.webp' },
        { id: 'sf', name: 'San Francisco', img: 'assets/background_sf.png', mapImg: 'assets/map_sf.webp' }
    ];

    const CITY_DISTRICT_MAP_POINTS = {
        sf: [
            { x: 12, y: 22, scale: 1.02 }, { x: 28, y: 24, scale: 1.00 },
            { x: 72, y: 24, scale: 1.00 }, { x: 88, y: 22, scale: 1.02 },
            { x: 9, y: 41, scale: 1.05 }, { x: 25, y: 43, scale: 1.06 },
            { x: 41, y: 41, scale: 1.08 }, { x: 59, y: 41, scale: 1.08 },
            { x: 75, y: 43, scale: 1.06 }, { x: 91, y: 41, scale: 1.05 },
            { x: 9, y: 59, scale: 1.08 }, { x: 25, y: 61, scale: 1.10 },
            { x: 41, y: 59, scale: 1.12 }, { x: 59, y: 59, scale: 1.12 },
            { x: 75, y: 61, scale: 1.10 }, { x: 91, y: 59, scale: 1.08 },
            { x: 15, y: 77, scale: 1.12 }, { x: 33, y: 79, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 67, y: 79, scale: 1.15 },
            { x: 85, y: 77, scale: 1.12 },
            { x: 42, y: 24, scale: 1.00 }, { x: 58, y: 24, scale: 1.00 },
            { x: 50, y: 42, scale: 1.08 }, { x: 50, y: 60, scale: 1.12 },
            { x: 6, y: 78, scale: 1.10 }, { x: 94, y: 78, scale: 1.10 },
            { x: 50, y: 22, scale: 1.00 }
        ],
        london: [
            { x: 10, y: 21, scale: 1.02 }, { x: 27, y: 23, scale: 1.00 },
            { x: 73, y: 23, scale: 1.00 }, { x: 90, y: 21, scale: 1.02 },
            { x: 8, y: 40, scale: 1.05 }, { x: 24, y: 42, scale: 1.06 },
            { x: 40, y: 40, scale: 1.08 }, { x: 60, y: 40, scale: 1.08 },
            { x: 76, y: 42, scale: 1.06 }, { x: 92, y: 40, scale: 1.05 },
            { x: 8, y: 58, scale: 1.08 }, { x: 24, y: 60, scale: 1.10 },
            { x: 40, y: 58, scale: 1.12 }, { x: 60, y: 58, scale: 1.12 },
            { x: 76, y: 60, scale: 1.10 }, { x: 92, y: 58, scale: 1.08 },
            { x: 14, y: 76, scale: 1.12 }, { x: 32, y: 78, scale: 1.15 },
            { x: 50, y: 75, scale: 1.15 }, { x: 68, y: 78, scale: 1.15 },
            { x: 86, y: 76, scale: 1.12 },
            { x: 41, y: 23, scale: 1.00 }, { x: 59, y: 23, scale: 1.00 },
            { x: 50, y: 41, scale: 1.08 }, { x: 50, y: 59, scale: 1.12 },
            { x: 6, y: 77, scale: 1.10 }, { x: 94, y: 77, scale: 1.10 },
            { x: 50, y: 21, scale: 1.00 }
        ],
        brighton: [
            { x: 11, y: 22, scale: 1.02 }, { x: 28, y: 24, scale: 1.00 },
            { x: 72, y: 24, scale: 1.00 }, { x: 89, y: 22, scale: 1.02 },
            { x: 9, y: 41, scale: 1.05 }, { x: 25, y: 43, scale: 1.06 },
            { x: 41, y: 41, scale: 1.08 }, { x: 59, y: 41, scale: 1.08 },
            { x: 75, y: 43, scale: 1.06 }, { x: 91, y: 41, scale: 1.05 },
            { x: 9, y: 59, scale: 1.08 }, { x: 25, y: 61, scale: 1.10 },
            { x: 41, y: 59, scale: 1.12 }, { x: 59, y: 59, scale: 1.12 },
            { x: 75, y: 61, scale: 1.10 }, { x: 91, y: 59, scale: 1.08 },
            { x: 15, y: 77, scale: 1.12 }, { x: 33, y: 79, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 67, y: 79, scale: 1.15 },
            { x: 85, y: 77, scale: 1.12 },
            { x: 42, y: 24, scale: 1.00 }, { x: 58, y: 24, scale: 1.00 },
            { x: 50, y: 42, scale: 1.08 }, { x: 50, y: 60, scale: 1.12 },
            { x: 6, y: 78, scale: 1.10 }, { x: 94, y: 78, scale: 1.10 },
            { x: 50, y: 22, scale: 1.00 }
        ],
        buehl: [
            { x: 10, y: 22, scale: 1.02 }, { x: 27, y: 24, scale: 1.00 },
            { x: 73, y: 24, scale: 1.00 }, { x: 90, y: 22, scale: 1.02 },
            { x: 8, y: 41, scale: 1.05 }, { x: 24, y: 43, scale: 1.06 },
            { x: 40, y: 41, scale: 1.08 }, { x: 60, y: 41, scale: 1.08 },
            { x: 76, y: 43, scale: 1.06 }, { x: 92, y: 41, scale: 1.05 },
            { x: 8, y: 59, scale: 1.08 }, { x: 24, y: 61, scale: 1.10 },
            { x: 40, y: 59, scale: 1.12 }, { x: 60, y: 59, scale: 1.12 },
            { x: 76, y: 61, scale: 1.10 }, { x: 92, y: 59, scale: 1.08 },
            { x: 14, y: 77, scale: 1.12 }, { x: 32, y: 79, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 68, y: 79, scale: 1.15 },
            { x: 86, y: 77, scale: 1.12 },
            { x: 41, y: 24, scale: 1.00 }, { x: 59, y: 24, scale: 1.00 },
            { x: 50, y: 42, scale: 1.08 }, { x: 50, y: 60, scale: 1.12 },
            { x: 6, y: 78, scale: 1.10 }, { x: 94, y: 78, scale: 1.10 },
            { x: 50, y: 22, scale: 1.00 }
        ],
        capetown: [
            { x: 12, y: 23, scale: 1.02 }, { x: 29, y: 25, scale: 1.00 },
            { x: 71, y: 25, scale: 1.00 }, { x: 88, y: 23, scale: 1.02 },
            { x: 9, y: 42, scale: 1.05 }, { x: 25, y: 44, scale: 1.06 },
            { x: 41, y: 42, scale: 1.08 }, { x: 59, y: 42, scale: 1.08 },
            { x: 75, y: 44, scale: 1.06 }, { x: 91, y: 42, scale: 1.05 },
            { x: 9, y: 60, scale: 1.08 }, { x: 25, y: 62, scale: 1.10 },
            { x: 41, y: 60, scale: 1.12 }, { x: 59, y: 60, scale: 1.12 },
            { x: 75, y: 62, scale: 1.10 }, { x: 91, y: 60, scale: 1.08 },
            { x: 15, y: 78, scale: 1.12 }, { x: 33, y: 80, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 67, y: 80, scale: 1.15 },
            { x: 85, y: 78, scale: 1.12 },
            { x: 42, y: 25, scale: 1.00 }, { x: 58, y: 25, scale: 1.00 },
            { x: 50, y: 43, scale: 1.08 }, { x: 50, y: 61, scale: 1.12 },
            { x: 6, y: 79, scale: 1.10 }, { x: 94, y: 79, scale: 1.10 },
            { x: 50, y: 23, scale: 1.00 }
        ],
        istanbul: [
            { x: 11, y: 22, scale: 1.02 }, { x: 28, y: 24, scale: 1.00 },
            { x: 72, y: 24, scale: 1.00 }, { x: 89, y: 22, scale: 1.02 },
            { x: 9, y: 41, scale: 1.05 }, { x: 25, y: 43, scale: 1.06 },
            { x: 41, y: 41, scale: 1.08 }, { x: 59, y: 41, scale: 1.08 },
            { x: 75, y: 43, scale: 1.06 }, { x: 91, y: 41, scale: 1.05 },
            { x: 9, y: 59, scale: 1.08 }, { x: 25, y: 61, scale: 1.10 },
            { x: 41, y: 59, scale: 1.12 }, { x: 59, y: 59, scale: 1.12 },
            { x: 75, y: 61, scale: 1.10 }, { x: 91, y: 59, scale: 1.08 },
            { x: 15, y: 77, scale: 1.12 }, { x: 33, y: 79, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 67, y: 79, scale: 1.15 },
            { x: 85, y: 77, scale: 1.12 },
            { x: 42, y: 24, scale: 1.00 }, { x: 58, y: 24, scale: 1.00 },
            { x: 50, y: 42, scale: 1.08 }, { x: 50, y: 60, scale: 1.12 },
            { x: 6, y: 78, scale: 1.10 }, { x: 94, y: 78, scale: 1.10 },
            { x: 50, y: 22, scale: 1.00 }
        ],
        rio: [
            { x: 10, y: 22, scale: 1.02 }, { x: 26, y: 24, scale: 1.00 },
            { x: 74, y: 24, scale: 1.00 }, { x: 90, y: 22, scale: 1.02 },
            { x: 8, y: 41, scale: 1.05 }, { x: 24, y: 43, scale: 1.06 },
            { x: 40, y: 41, scale: 1.08 }, { x: 60, y: 41, scale: 1.08 },
            { x: 76, y: 43, scale: 1.06 }, { x: 92, y: 41, scale: 1.05 },
            { x: 8, y: 59, scale: 1.08 }, { x: 24, y: 61, scale: 1.10 },
            { x: 40, y: 59, scale: 1.12 }, { x: 60, y: 59, scale: 1.12 },
            { x: 76, y: 61, scale: 1.10 }, { x: 92, y: 59, scale: 1.08 },
            { x: 14, y: 77, scale: 1.12 }, { x: 32, y: 79, scale: 1.15 },
            { x: 50, y: 76, scale: 1.15 }, { x: 68, y: 79, scale: 1.15 },
            { x: 86, y: 77, scale: 1.12 },
            { x: 42, y: 24, scale: 1.00 }, { x: 58, y: 24, scale: 1.00 },
            { x: 50, y: 42, scale: 1.08 }, { x: 50, y: 60, scale: 1.12 },
            { x: 6, y: 78, scale: 1.10 }, { x: 94, y: 78, scale: 1.10 },
            { x: 50, y: 22, scale: 1.00 }
        ]
    };

    const MISSION_DISTRICT_MAP_POINTS = CITY_DISTRICT_MAP_POINTS.sf;

    function getCityDistrictMapPoints(cityId) {
        return CITY_DISTRICT_MAP_POINTS[cityId] || MISSION_DISTRICT_MAP_POINTS;
    }

    let currentHunterIndex = 0;
    let currentCityIndex = 0;
    const CAROUSEL_SETS = 30;
    const TOTAL_ITEMS = CAROUSEL_SETS * HUNTERS.length;
    const TOTAL_CITY_ITEMS = CAROUSEL_SETS * CITIES.length;

    const zombieImages = [
        'assets/zombie01.png',
        'assets/zombie02.png',
        'assets/zombie03.png',
        'assets/zombie04.png',
        'assets/zombie05.png',
        'assets/zombie06.png',
        'assets/zombie07.png'
    ];

    // Init
    let preferredCourseId = 'en-5';
    try {
        preferredCourseId = localStorage.getItem('vokabelzombie_last_course') || preferredCourseId;
    } catch (error) {}
    if (!activateCourse(preferredCourseId)) activateCourse('en-5');
    initCarousel();
    initCityCarousel();
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', () => {
        if (state.playStyle === 'mission') {
            beginMissionDistrictSelection();
        } else {
            showHunterScreen();
        }
    });

    document.getElementById('back-to-hunter-from-city-btn').addEventListener('click', showHunterScreen);
    document.getElementById('confirm-hunter-btn').addEventListener('click', () => {
        const hunterId = state.hunterType || 'laser';
        playUIAudio(`hunter_${hunterId}_intro.mp3`);
        showCityScreen();
    });
    document.getElementById('back-to-city-from-mission-btn').addEventListener('click', showCityScreen);
    document.getElementById('back-to-mission-btn').addEventListener('click', showMissionSelectionScreen);
    document.getElementById('change-play-style-btn').addEventListener('click', showMissionSelectionScreen);
    document.getElementById('change-mission-settings-btn').addEventListener('click', showStartScreen);
    document.getElementById('confirm-city-btn').addEventListener('click', () => {
        const hunterId = state.hunterType || 'laser';
        const cityId = state.city || 'london';
        playUIAudio(`hunter_${hunterId}_city_${cityId}.mp3`);
        showMissionSelectionScreen();
    });

    document.querySelectorAll('.play-style-card').forEach(button => {
        button.addEventListener('click', () => selectPlayStyle(button.dataset.playStyle));
    });
    document.getElementById('confirm-play-style-btn').addEventListener('click', () => {
        if (isMissionMode()) beginMissionDistrictSelection();
        else showStartScreen();
    });
    document.getElementById('back-from-command-btn').addEventListener('click', () => {
        clearTimeout(missionBriefingAdvanceTimer);
        stopMissionBriefingAudio();
        beginMissionDistrictSelection(state.mission.activeDistrictId);
    });
    document.getElementById('command-replay-audio-btn').addEventListener('click', playCurrentBriefingAudio);
    document.getElementById('back-from-halo-btn').addEventListener('click', () => {
        stopHaloSequence();
        if (haloMode === 'planning') showMissionSelectionScreen();
        else beginMissionDistrictSelection(state.mission.activeDistrictId);
    });
    document.getElementById('halo-deploy-btn').addEventListener('click', () => {
        const deployButton = document.getElementById('halo-deploy-btn');
        if (deployButton.disabled) return;
        if (haloMode === 'planning') {
            startGame();
            return;
        }
        stopHaloSequence();
        launchGameSession();
    });
    const skipHaloVideoBtn = document.getElementById('skip-halo-video-btn');
    if (skipHaloVideoBtn) {
        skipHaloVideoBtn.addEventListener('click', () => {
            stopHaloSequence();
            launchGameSession();
        });
    }
    const haloJumpVideoEl = document.getElementById('halo-jump-video');
    if (haloJumpVideoEl) {
        haloJumpVideoEl.addEventListener('click', () => {
            if (screens.halo?.classList.contains('is-jumping')) {
                stopHaloSequence();
                launchGameSession();
            }
        });
    }

    settingsBtn.addEventListener('click', () => {
        state.settingsPending = true;
        settingsBtn.classList.add('pending');
    });

    function openInfoDialog() {
        infoDialog.classList.remove('hidden');
        playUIAudio('story_intro.mp3');
    }

    const infoHunterBtn = document.getElementById('info-hunter-btn');
    if (infoHunterBtn) {
        infoHunterBtn.addEventListener('click', () => {
            openInfoDialog();
        });
    }

    // Leaderboard logic for hunter screen
    const showLeaderboardHunterBtn = document.getElementById('show-leaderboard-hunter-btn');
    const showLeaderboardCityBtn = document.getElementById('show-leaderboard-city-btn');
    const showLeaderboardStartBtn = document.getElementById('show-leaderboard-start-btn');
    const handleLeaderboardClick = () => {
        if (typeof window.openLeaderboardDialog === 'function') {
            window.openLeaderboardDialog(-1, '', '', 0, getCourseLabel());
        } else {
            alert("Bestenliste wird noch geladen...");
        }
    };
    if (showLeaderboardHunterBtn) {
        showLeaderboardHunterBtn.addEventListener('click', handleLeaderboardClick);
    }
    if (showLeaderboardCityBtn) {
        showLeaderboardCityBtn.addEventListener('click', handleLeaderboardClick);
    }
    if (showLeaderboardStartBtn) {
        showLeaderboardStartBtn.addEventListener('click', handleLeaderboardClick);
    }

    const infoBtnStart = document.getElementById('info-btn');
    if (infoBtnStart) {
        infoBtnStart.addEventListener('click', () => {
            openInfoDialog();
        });
    }
    
    const infoCityBtn = document.getElementById('info-city-btn');
    if (infoCityBtn) {
        infoCityBtn.addEventListener('click', () => {
            openInfoDialog();
        });
    }

    if (closeInfoBtn) {
        closeInfoBtn.addEventListener('click', () => {
            infoDialog.classList.add('hidden');
            stopUIAudio();
        });
    }

    const profileHunterBtn = document.getElementById('profile-hunter-btn');
    const profileCityBtn = document.getElementById('profile-city-btn');
    const profileStartBtn = document.getElementById('profile-start-btn');
    const closeProfileBtn = document.getElementById('close-profile-btn');
    const profileDialog = document.getElementById('profile-dialog');

    const handleProfileClick = () => {
        updateProfileUI();
        profileDialog.classList.remove('hidden');
    };

    if (profileHunterBtn) profileHunterBtn.addEventListener('click', handleProfileClick);
    if (profileCityBtn) profileCityBtn.addEventListener('click', handleProfileClick);
    if (profileStartBtn) profileStartBtn.addEventListener('click', handleProfileClick);
    
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            profileDialog.classList.add('hidden');
        });
    }

    cancelSettingsBtn.addEventListener('click', () => {
        settingsDialog.classList.add('hidden');
        state.settingsPending = false;
        state.gameRunning = true;
        lastFrameTime = performance.now();
        requestAnimationFrame(gameLoop);
        spawnZombie();
    });

    confirmSettingsBtn.addEventListener('click', () => {
        settingsDialog.classList.add('hidden');
        state.settingsPending = false;
        state.gameRunning = false;
        cancelAnimationFrame(animationId);
        showHunterScreen();
    });

    const showLeaderboardBtn = document.getElementById('show-leaderboard-btn');
    if (showLeaderboardBtn) {
        showLeaderboardBtn.addEventListener('click', () => {
            if (typeof window.openLeaderboardDialog === 'function') {
                const accuracy = state.totalAttempts > 0 ? Math.round((state.correctAttempts / state.totalAttempts) * 100) : 0;
                window.openLeaderboardDialog(state.score, state.kategorie, accuracy + '%', state.maxStreak, getCourseLabel());
            } else {
                alert("Bestenliste wird noch geladen...");
            }
        });
    }

    // Charakter-Auswahl Carousel
    // Charakter-Auswahl Carousel
    function initCarousel() {
        const carousel = document.getElementById('hunter-carousel');
        carousel.innerHTML = '';
        
        let isDown = false;
        let isDragging = false;
        let startX;
        let scrollLeft;
        
        for(let s = 0; s < CAROUSEL_SETS; s++) {
            HUNTERS.forEach((hunter, i) => {
                const index = s * HUNTERS.length + i;
                const item = document.createElement('div');
                item.className = 'carousel-item';
                item.dataset.index = index;
                item.dataset.realIndex = i;
                item.dataset.element = hunter.element;
                
                const img = document.createElement('img');
                img.src = hunter.img;
                img.alt = hunter.name;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'hunter-name';
                nameSpan.textContent = hunter.name;
                
                item.appendChild(img);
                item.appendChild(nameSpan);
                carousel.appendChild(item);
                
                item.addEventListener('click', (e) => {
                    if (isDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    focusHunter(index);
                });
            });
        }
        
        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            isDragging = false;
            carousel.style.scrollSnapType = 'none';
            carousel.style.cursor = 'grabbing';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });

        carousel.addEventListener('mouseleave', () => {
            if (!isDown) return;
            isDown = false;
            carousel.style.scrollSnapType = 'x mandatory';
            carousel.style.cursor = 'grab';
        });

        carousel.addEventListener('mouseup', () => {
            if (!isDown) return;
            isDown = false;
            carousel.style.scrollSnapType = 'x mandatory';
            carousel.style.cursor = 'grab';
            
            // Programmatically find the closest and explicitly snap to it to ensure perfect centering
            const items = carousel.querySelectorAll('.carousel-item');
            let closest = 0;
            let minDistance = Infinity;
            const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
            
            items.forEach((item, index) => {
                const itemCenter = item.offsetLeft + item.clientWidth / 2;
                const dist = Math.abs(containerCenter - itemCenter);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = index;
                }
            });
            focusHunter(closest, true, true);
        });

        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 1.5;
            if (Math.abs(walk) > 5) isDragging = true;
            carousel.scrollLeft = scrollLeft - walk;
        });
        
        document.getElementById('carousel-prev').addEventListener('click', () => {
            focusHunter((currentHunterIndex - 1 + TOTAL_ITEMS) % TOTAL_ITEMS);
        });
        
        document.getElementById('carousel-next').addEventListener('click', () => {
            focusHunter((currentHunterIndex + 1) % TOTAL_ITEMS);
        });
        
        carousel.addEventListener('scroll', () => {
            clearTimeout(carousel.scrollTimeout);
            carousel.scrollTimeout = setTimeout(() => {
                const items = carousel.querySelectorAll('.carousel-item');
                let closest = 0;
                let minDistance = Infinity;
                const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
                
                items.forEach((item, index) => {
                    const itemCenter = item.offsetLeft + item.clientWidth / 2;
                    const dist = Math.abs(containerCenter - itemCenter);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closest = index;
                    }
                });
                
                if (currentHunterIndex !== closest) {
                    focusHunter(closest, false);
                }
            }, 300); // 300ms debounce to avoid flickering while smooth-scrolling
        });
        
        // Remove static initial focus here, it will be handled by showHunterScreen
    }
    
    function focusHunter(index, scrollTo = true, smooth = true) {
        currentHunterIndex = index;
        const carousel = document.getElementById('hunter-carousel');
        const items = carousel.querySelectorAll('.carousel-item');
        
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Get the real hunter from the original array
        const realIndex = index % HUNTERS.length;
        const hunter = HUNTERS[realIndex];
        state.hunterType = hunter.id;
        
        if (scrollTo) {
            const targetItem = items[index];
            if (targetItem) {
                carousel.scrollTo({
                    left: targetItem.offsetLeft - carousel.clientWidth / 2 + targetItem.clientWidth / 2,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }
        }
    }

    function initCityCarousel() {
        const carousel = document.getElementById('city-carousel');
        carousel.innerHTML = '';
        
        let isDown = false;
        let isDragging = false;
        let startX;
        let scrollLeft;
        
        for(let s = 0; s < CAROUSEL_SETS; s++) {
            CITIES.forEach((city, i) => {
                const index = s * CITIES.length + i;
                const item = document.createElement('div');
                item.className = 'carousel-item';
                item.dataset.index = index;
                item.dataset.realIndex = i;
                item.dataset.cityId = city.id;
                
                const img = document.createElement('img');
                img.src = city.img;
                img.alt = city.name;
                img.style.objectFit = 'cover';
                img.style.borderRadius = '10px';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'hunter-name';
                nameSpan.textContent = city.name;
                
                item.appendChild(img);
                item.appendChild(nameSpan);
                carousel.appendChild(item);
                
                item.addEventListener('click', (e) => {
                    if (isDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    focusCity(index);
                });
            });
        }
        
        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            isDragging = false;
            carousel.style.scrollSnapType = 'none';
            carousel.style.cursor = 'grabbing';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });

        carousel.addEventListener('mouseleave', () => {
            if (!isDown) return;
            isDown = false;
            carousel.style.scrollSnapType = 'x mandatory';
            carousel.style.cursor = 'grab';
        });

        carousel.addEventListener('mouseup', () => {
            if (!isDown) return;
            isDown = false;
            carousel.style.scrollSnapType = 'x mandatory';
            carousel.style.cursor = 'grab';
            
            const items = carousel.querySelectorAll('.carousel-item');
            let closest = 0;
            let minDistance = Infinity;
            const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
            
            items.forEach((item, index) => {
                const itemCenter = item.offsetLeft + item.clientWidth / 2;
                const dist = Math.abs(containerCenter - itemCenter);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = index;
                }
            });
            focusCity(closest, true, true);
        });

        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 1.5;
            if (Math.abs(walk) > 5) isDragging = true;
            carousel.scrollLeft = scrollLeft - walk;
        });
        
        document.getElementById('city-carousel-prev').addEventListener('click', () => {
            focusCity((currentCityIndex - 1 + TOTAL_CITY_ITEMS) % TOTAL_CITY_ITEMS);
        });
        
        document.getElementById('city-carousel-next').addEventListener('click', () => {
            focusCity((currentCityIndex + 1) % TOTAL_CITY_ITEMS);
        });
        
        carousel.addEventListener('scroll', () => {
            clearTimeout(carousel.scrollTimeout);
            carousel.scrollTimeout = setTimeout(() => {
                const items = carousel.querySelectorAll('.carousel-item');
                let closest = 0;
                let minDistance = Infinity;
                const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
                
                items.forEach((item, index) => {
                    const itemCenter = item.offsetLeft + item.clientWidth / 2;
                    const dist = Math.abs(containerCenter - itemCenter);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closest = index;
                    }
                });
                
                if (currentCityIndex !== closest) {
                    focusCity(closest, false);
                }
            }, 300);
        });
    }

    function focusCity(index, scrollTo = true, smooth = true) {
        currentCityIndex = index;
        const carousel = document.getElementById('city-carousel');
        const items = carousel.querySelectorAll('.carousel-item');
        
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        const realIndex = index % CITIES.length;
        const city = CITIES[realIndex];
        state.city = city.id;
        
        if (scrollTo) {
            const targetItem = items[index];
            if (targetItem) {
                carousel.scrollTo({
                    left: targetItem.offsetLeft - carousel.clientWidth / 2 + targetItem.clientWidth / 2,
                    behavior: smooth ? 'smooth' : 'auto'
                });
            }
        }
    }

    function initFilters() {
        const container = document.getElementById('learning-path-container');
        
        if (activeVocabulary.length === 0) {
            if (container) container.innerHTML = '<p>Lade Vokabeln...</p>';
            return;
        }

        if (!container) return;
        container.innerHTML = '';

        const units = new Set();
        const parts = new Map();
        const pages = new Map();

        activeVocabulary.forEach(v => {
            if (v.unit) {
                units.add(v.unit);
                if (!parts.has(v.unit)) parts.set(v.unit, new Set());
                if (!pages.has(v.unit)) pages.set(v.unit, new Set());

                if (v.part && v.part.trim() !== '') {
                    parts.get(v.unit).add(v.part);
                }
                if (v.page) {
                    pages.get(v.unit).add(v.page);
                }
            }
        });

        const encodeFilterSegment = window.VocabUtils.encodeFilterSegment;

        function createCheckbox(value, label, isAll = false) {
            const lbl = document.createElement('label');
            lbl.className = 'filter-checkbox-label' + (isAll ? ' active' : '');
            
            const inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.value = value;
            inp.className = 'filter-checkbox';
            if (isAll) inp.checked = true;
            
            lbl.appendChild(inp);
            lbl.appendChild(document.createTextNode(label));

            inp.addEventListener('change', () => {
                const isChecked = inp.checked;
                if (isChecked) {
                    lbl.classList.add('active');
                } else {
                    lbl.classList.remove('active');
                }

                if (!isChecked && !isAll && value.startsWith('part:')) {
                    const unitStr = value.split(':')[1];
                    document.querySelectorAll('.filter-checkbox').forEach(cb => {
                        if (cb.value.startsWith(`page:${unitStr}:`)) {
                            cb.checked = false;
                            cb.parentElement.classList.remove('active');
                        }
                    });
                } else if (!isChecked && !isAll && value.startsWith('page:')) {
                    const unitStr = value.split(':')[1];
                    document.querySelectorAll('.filter-checkbox').forEach(cb => {
                        if (cb.value.startsWith(`part:${unitStr}:`)) {
                            cb.checked = false;
                            cb.parentElement.classList.remove('active');
                        }
                    });
                }

                if (isAll) {
                    document.querySelectorAll('.filter-checkbox').forEach(cb => {
                        if (cb !== inp) {
                            cb.checked = isChecked;
                            if (isChecked) cb.parentElement.classList.add('active');
                            else cb.parentElement.classList.remove('active');
                        }
                    });
                } else if (value.startsWith('unit:')) {
                    const unitStr = value.split(':')[1];
                    const children = Array.from(document.querySelectorAll('.filter-checkbox'))
                        .filter(cb => cb.value.startsWith(`part:${unitStr}:`) || cb.value.startsWith(`page:${unitStr}:`));
                    children.forEach(cb => {
                        cb.checked = isChecked;
                        if (isChecked) cb.parentElement.classList.add('active');
                        else cb.parentElement.classList.remove('active');
                    });
                }

                const allUnitCbs = Array.from(document.querySelectorAll('.filter-checkbox')).filter(cb => cb.value.startsWith('unit:'));
                allUnitCbs.forEach(uCb => {
                    const unitStr = uCb.value.split(':')[1];
                    const parts = Array.from(document.querySelectorAll('.filter-checkbox')).filter(cb => cb.value.startsWith(`part:${unitStr}:`));
                    const pages = Array.from(document.querySelectorAll('.filter-checkbox')).filter(cb => cb.value.startsWith(`page:${unitStr}:`));
                    
                    const allPartsChecked = parts.length > 0 && parts.every(cb => cb.checked);
                    const allPagesChecked = pages.length > 0 && pages.every(cb => cb.checked);
                    
                    if (allPartsChecked || allPagesChecked) {
                        if (!uCb.checked) {
                            uCb.checked = true;
                            uCb.parentElement.classList.add('active');
                            parts.forEach(cb => { cb.checked = true; cb.parentElement.classList.add('active'); });
                            pages.forEach(cb => { cb.checked = true; cb.parentElement.classList.add('active'); });
                        }
                    } else {
                        if (uCb.checked) {
                            uCb.checked = false;
                            uCb.parentElement.classList.remove('active');
                        }
                    }
                });

                const allCb = document.querySelector('input[value="all"]');
                if (allCb && !isAll) {
                    const otherCbs = Array.from(document.querySelectorAll('.filter-checkbox')).filter(cb => cb.value !== 'all');
                    const allOthersChecked = otherCbs.length > 0 && otherCbs.every(cb => cb.checked);
                    
                    if (allOthersChecked) {
                        allCb.checked = true;
                        allCb.parentElement.classList.add('active');
                    } else {
                        allCb.checked = false;
                        allCb.parentElement.classList.remove('active');
                    }
                }
            });

            return lbl;
        }

        const unitList = Array.from(units).sort((a, b) => {
            const aIsWelcome = a.trim().toLowerCase().startsWith('welcome');
            const bIsWelcome = b.trim().toLowerCase().startsWith('welcome');
            if (aIsWelcome && !bIsWelcome) return -1;
            if (bIsWelcome && !aIsWelcome) return 1;
            return a.localeCompare(b);
        });
        const numUnits = unitList.length;

        // Header Row
        const headers = ['', 'Nach Unit', 'Nach Part', 'Nach Seite'];
        headers.forEach((text, i) => {
            if (text) {
                const headerCell = document.createElement('div');
                headerCell.className = 'filter-header';
                headerCell.style.gridRow = '1';
                headerCell.style.gridColumn = `${i + 1}`;
                headerCell.innerHTML = `<h4>${text}</h4>`;
                container.appendChild(headerCell);
            }
        });

        // Global Cell (Alle Vokabeln)
        if (numUnits > 0) {
            const globalSec = document.createElement('div');
            globalSec.className = 'filter-cell global-cell';
            globalSec.style.gridRow = `2 / span ${numUnits}`;
            globalSec.style.gridColumn = '1';
            globalSec.appendChild(createCheckbox('all', 'Alle Vokabeln', true));
            container.appendChild(globalSec);
        }

        unitList.forEach((u, index) => {
            const row = index + 2;
            const unitToken = encodeFilterSegment(u);

            // Unit Cell
            const unitCell = document.createElement('div');
            unitCell.className = 'filter-cell unit-cell';
            unitCell.style.gridRow = `${row}`;
            unitCell.style.gridColumn = '2';
            unitCell.appendChild(createCheckbox(`unit:${unitToken}`, u));
            container.appendChild(unitCell);

            // Part Cell
            const partCell = document.createElement('div');
            partCell.className = 'filter-cell part-cell';
            partCell.style.gridRow = `${row}`;
            partCell.style.gridColumn = '3';
            const unitParts = Array.from(parts.get(u) || []).sort((a, b) => {
                const getRank = (name) => {
                    if (name.toLowerCase().includes('welcome')) return 1;
                    if (name.toLowerCase().includes('story')) return 3;
                    return 2;
                };
                const rankA = getRank(a);
                const rankB = getRank(b);
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
            });
            unitParts.forEach(p => partCell.appendChild(createCheckbox(`part:${unitToken}:${encodeFilterSegment(p)}`, p)));
            container.appendChild(partCell);

            // Page Cell
            const pageCell = document.createElement('div');
            pageCell.className = 'filter-cell page-cell';
            pageCell.style.gridRow = `${row}`;
            pageCell.style.gridColumn = '4';
            const unitPages = Array.from(pages.get(u) || []).sort((a,b) => a - b);
            unitPages.forEach(p => pageCell.appendChild(createCheckbox(`page:${unitToken}:${p}`, `${p}`)));
            container.appendChild(pageCell);
        });

        // Trigger initial sync to check all boxes
        const allCb = document.querySelector('input[value="all"]');
        if (allCb) {
            allCb.dispatchEvent(new Event('change'));
        }
    }

    function showScreen(screenName) {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.scrollTop = 0;
            appContainer.scrollLeft = 0;
            requestAnimationFrame(() => {
                appContainer.scrollTop = 0;
                appContainer.scrollLeft = 0;
            });
        }
        const requiresLandscape = screenName !== 'login' && screenName !== 'terms';
        document.body.classList.toggle('requires-landscape', requiresLandscape);
        document.body.classList.toggle('game-active', screenName === 'game');
        document.body.classList.toggle('halo-active', screenName === 'halo');
        document.body.classList.toggle('command-active', screenName === 'command');
        if (screenName !== 'halo') {
            document.body.classList.remove('halo-jumping');
        }
        if (screenName !== 'command') {
            document.body.classList.remove('turbulence-active');
            screens.command?.classList.remove('turbulence-active');
        }

        switch (screenName) {
            case 'command':
                startSceneAmbient('command');
                break;
            case 'halo':
                startSceneAmbient('halo');
                break;
            case 'game':
                startSceneAmbient('game');
                break;
            case 'hunter':
            case 'city':
            case 'mission':
            case 'start':
                startSceneAmbient('tactical');
                break;
            case 'end':
                startSceneAmbient('victory');
                break;
            default:
                stopSceneAmbient(500);
                break;
        }

        if (screenName === 'game') {
            if (state.hearts === 1 && state.gameRunning) {
                startCriticalHealthAudio();
            }
        } else {
            stopCriticalHealthAudio(300);
        }

        if (!requiresLandscape) {
            document.body.classList.remove('orientation-notice-dismissed');
        }
    }

    const dismissOrientationNoticeBtn = document.getElementById('dismiss-orientation-notice-btn');
    if (dismissOrientationNoticeBtn) {
        dismissOrientationNoticeBtn.addEventListener('click', () => {
            document.body.classList.add('orientation-notice-dismissed');
        });
    }

    function updateDirectionOptions() {
        const select = document.getElementById('translation-direction');
        if (!select || !activeCourse) return;
        const subject = activeCourse.subjectLabel;
        select.innerHTML = `
            <option value="foreign-de">${subject} ➔ Deutsch</option>
            <option value="de-foreign" selected>Deutsch ➔ ${subject}</option>
            <option value="mixed">Gemischt</option>
            <option value="de-foreign-write">Deutsch ➔ ${subject} (schreiben)</option>
        `;
        state.direction = 'de-foreign';
    }

    function activateCourse(courseId) {
        const course = window.getCourseById(courseId);
        const vocabulary = window.VOCABULARIES[courseId] || [];
        if (!course || !course.available || vocabulary.length === 0) return false;

        state.courseId = course.id;
        activeCourse = course;
        activeVocabulary = normalizeVocabulary(course.id, vocabulary);
        migrateLegacySRSForEnglish5();
        updateDirectionOptions();
        initFilters();

        const title = document.getElementById('learning-path-title');
        if (title) title.textContent = `Lernpfad – ${getCourseLabel()}`;
        try {
            localStorage.setItem('vokabelzombie_last_course', course.id);
        } catch (error) {}
        return true;
    }

    function showCourseSelectionScreen() {
        pendingGrade = activeCourse?.grade || 5;
        pendingCourseId = activeCourse?.id || 'en-5';
        document.querySelectorAll('.grade-card').forEach(card => {
            const selected = Number(card.dataset.grade) === pendingGrade;
            card.classList.toggle('active', selected);
            card.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        renderSubjectSelection();
        showScreen('course');
    }

    function showHunterScreen() {
        showScreen('hunter');
        updatePersonalBestsUI();
        // Wähle jedes Mal einen zufälligen Jäger in der Mitte des unendlichen Karussells
        const middleStartIndex = Math.floor(CAROUSEL_SETS / 2) * HUNTERS.length;
        const randomOffset = Math.floor(Math.random() * HUNTERS.length);
        const targetIndex = middleStartIndex + randomOffset;
        setTimeout(() => focusHunter(targetIndex, true, false), 50);
    }

    function showCityScreen() {
        showScreen('city');
        // Falls noch keine Stadt zentriert ist, zentriere eine zufällige oder die erste.
        const middleStartIndex = Math.floor(CAROUSEL_SETS / 2) * CITIES.length;
        // Wähle entweder den zuvor ausgewählten oder random, falls init
        const randomOffset = Math.floor(Math.random() * CITIES.length);
        const targetIndex = middleStartIndex + randomOffset;
        setTimeout(() => focusCity(targetIndex, true, false), 50);
    }

    function selectPlayStyle(playStyle, persist = true) {
        state.playStyle = playStyle === 'hunt' ? 'hunt' : 'mission';
        const isMission = state.playStyle === 'mission';

        document.querySelectorAll('.play-style-card').forEach(card => {
            const active = card.dataset.playStyle === state.playStyle;
            card.classList.toggle('active', active);
            card.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        document.getElementById('mission-briefing')?.classList.toggle('hidden', !isMission);
        document.getElementById('hunt-briefing')?.classList.toggle('hidden', isMission);

        const confirmButton = document.getElementById('confirm-play-style-btn');
        if (confirmButton) confirmButton.textContent = isMission ? 'Mission vorbereiten' : 'Jagd vorbereiten';

        const banner = document.getElementById('selected-play-style-banner');
        banner?.classList.toggle('mission-selected', isMission);
        banner?.classList.toggle('hunt-selected', !isMission);
        const icon = document.getElementById('selected-play-style-icon');
        const title = document.getElementById('selected-play-style-title');
        const summary = document.getElementById('selected-play-style-summary');
        if (icon) icon.textContent = isMission ? '🎯' : '♾️';
        if (title) title.textContent = isMission ? 'Rettungsmission' : 'Freie Jagd';
        if (summary) {
            summary.textContent = isMission
                ? 'Horde orten · Boss besiegen · Stadt retten'
                : 'Jage ohne Limit – bis dein letztes Herz fällt';
        }
        if (startBtn) startBtn.textContent = isMission ? 'Mission starten' : 'Jagd beginnen';

        if (persist) {
            try {
                localStorage.setItem('vokabelzombie_last_play_style', state.playStyle);
            } catch (error) {}
        }
    }

    function showMissionSelectionScreen() {
        const selectedCity = CITIES.find(city => city.id === state.city);
        const cityName = document.getElementById('mission-city-name');
        if (cityName) cityName.textContent = selectedCity?.name || 'deine Stadt';
        selectPlayStyle(state.playStyle, false);
        showScreen('mission');
    }

    function showStartScreen() {
        selectPlayStyle(state.playStyle, false);
        showScreen('start');
    }

    function isMissionMode() {
        return state.playStyle === 'mission';
    }

    function getMissionRemainingCount() {
        return state.mission.targetWords.reduce((count, vocab) => (
            count + (state.mission.securedIds.has(vocab.id) ? 0 : 1)
        ), 0);
    }

    function getMissionBossTargetCount() {
        // Short first missions still get a real attack wave before the boss.
        return Math.min(
            CONFIG.missionBossWordCount,
            Math.max(1, state.mission.targetWords.length - 2)
        );
    }

    function getMissionPhase() {
        const remainingCount = getMissionRemainingCount();
        if (state.mission.completed || remainingCount === 0) return 'extract';
        if (state.bossActive || remainingCount <= getMissionBossTargetCount()) return 'boss';
        return 'attack';
    }

    function showMissionPhaseTransition(phase) {
        const overlay = document.getElementById('mission-phase-overlay');
        if (!overlay) return;
        const presentations = {
            scout: {
                icon: '📡',
                kicker: 'Phase 2 · Aufklärung',
                title: 'Gebiet scannen',
                detail: 'Drei ruhige Ziele. Präge dir jedes Wort ein.'
            },
            attack: {
                icon: '🧟',
                kicker: 'Phase 3 · Angriffswelle',
                title: 'Die Horde ist da!',
                detail: 'Das Tempo steigt. Halte die Linie und sichere das Gebiet.'
            },
            boss: {
                icon: '👑',
                kicker: 'Phase 4 · Bossalarm',
                title: 'Anführer gesichtet',
                detail: 'Die letzten Schlüsselwörter entscheiden über die Stadt.'
            },
            extract: {
                icon: '🚁',
                kicker: 'Finale · Extraktion',
                title: 'Ziel erreicht!',
                detail: 'Die Stadt ist gesichert. Dein Team wird ausgeflogen.'
            }
        };
        const presentation = presentations[phase];
        if (!presentation) return;

        document.getElementById('mission-phase-overlay-icon').textContent = presentation.icon;
        document.getElementById('mission-phase-overlay-kicker').textContent = presentation.kicker;
        document.getElementById('mission-phase-overlay-title').textContent = presentation.title;
        document.getElementById('mission-phase-overlay-detail').textContent = presentation.detail;
        overlay.className = `mission-phase-overlay phase-${phase}`;
        void overlay.offsetWidth;
        clearTimeout(missionPhaseTransitionTimer);
        state.mission.transitionActive = phase !== 'extract' && state.gameRunning;
        missionPhaseTransitionTimer = setTimeout(() => {
            overlay.classList.add('hidden');
            state.mission.transitionActive = false;
            lastFrameTime = performance.now();
        }, CONFIG.missionPhaseTransitionDurationMs);
    }

    function updateMissionHUD(deferPhaseTransition = false) {
        const hud = document.getElementById('mission-hud');
        if (!hud) return;
        hud.classList.toggle('hidden', !isMissionMode());
        const phaseClasses = ['mission-phase-scout', 'mission-phase-attack', 'mission-phase-boss', 'mission-phase-extract'];
        if (!isMissionMode()) {
            screens.game.classList.remove(...phaseClasses);
            document.getElementById('mission-phase-overlay')?.classList.add('hidden');
            clearTimeout(missionPhaseTransitionTimer);
            state.mission.transitionActive = false;
            return;
        }

        const securedCount = state.mission.securedIds.size;
        const targetCount = state.mission.targetWords.length;
        const percentage = targetCount > 0 ? Math.min(100, (securedCount / targetCount) * 100) : 0;
        const phase = getMissionPhase();
        const phaseLabels = {
            briefing: 'Briefing',
            scout: 'Aufklärung',
            attack: 'Angriffswelle',
            boss: 'Boss-Zone',
            extract: 'Extraktion'
        };
        const phaseOrder = ['briefing', 'scout', 'attack', 'boss', 'extract'];
        const activePhaseIndex = phaseOrder.indexOf(phase);

        const phaseLabel = document.getElementById('mission-phase-label');
        const encounterLabel = document.getElementById('mission-encounter-label');
        const progress = document.getElementById('mission-hud-progress');
        if (phaseLabel) phaseLabel.textContent = phaseLabels[phase];
        if (encounterLabel) encounterLabel.textContent = `⚔ ${state.mission.encounters} / ${CONFIG.missionMaxEncounters}`;
        if (progress) progress.style.width = `${percentage}%`;

        screens.game.classList.remove(...phaseClasses);
        screens.game.classList.add(`mission-phase-${phase}`);
        if (state.mission.currentPhase !== phase && !deferPhaseTransition) {
            state.mission.currentPhase = phase;
            showMissionPhaseTransition(phase);
        }

        document.querySelectorAll('[data-mission-phase]').forEach((step, index) => {
            step.classList.toggle('active', index === activePhaseIndex);
            step.classList.toggle('complete', index < activePhaseIndex);
        });
    }

    function getPendingCorrections() {
        return state.correction.queue.filter(entry => !entry.resolved);
    }

    function hasPendingCorrections() {
        return getPendingCorrections().length > 0;
    }

    function registerMissionEncounter(vocab, isCorrectionRetry = false) {
        if (!vocab) return;
        state.correction.encounterSerial++;
        state.lastVocabId = vocab.id;
        if (!isMissionMode()) return;
        if (!isCorrectionRetry) state.mission.encounters++;
        state.mission.lastVocabId = vocab.id;
        updateMissionHUD();
    }

    function finishMissionIfNeeded() {
        if (!isMissionMode()) return false;
        if (state.mission.finishing) return true;
        const objectiveReached = getMissionRemainingCount() === 0;
        // A marked zombie always gets its promised return. If the regular
        // encounter limit has been reached, its retry becomes an extra
        // correction encounter and does not consume another mission chance.
        const encounterLimitReached = state.mission.encounters >= CONFIG.missionMaxEncounters
            && !hasPendingCorrections();
        if (!objectiveReached && !encounterLimitReached) return false;

        state.mission.completed = objectiveReached;
        state.mission.endReason = objectiveReached ? 'objective' : 'encounter-limit';
        state.mission.finishing = true;
        updateMissionHUD();
        if (objectiveReached) {
            showMissionPhaseTransition('extract');
        }
        state.gameRunning = false;
        cancelAnimationFrame(animationId);
        setTimeout(endGame, objectiveReached ? CONFIG.missionExtractionTransitionDurationMs : 1000);
        return true;
    }

    function selectMissionTargets(vocabulary) {
        return window.VocabUtils.createMissionTargetSet(vocabulary, {
            targetSize: CONFIG.missionTargetSize,
            newWordLimit: CONFIG.missionNewWordLimit,
            isKnown(vocab) {
                const record = srsData.entries[getSrsKey(vocab)];
                return Boolean(record && record.timesCorrect > 0);
            }
        });
    }

    function isKnownMissionWord(vocab) {
        const record = srsData.entries[getSrsKey(vocab)];
        return Boolean(record && record.timesCorrect > 0);
    }

    function getVocabularyAudioPath(vocab) {
        if (!vocab) return '';
        if (vocab.audio) return vocab.audio;
        if (vocab.id && state.courseId) {
            return `assets/audio/vocab/${state.courseId}/${vocab.id}.mp3`;
        }
        return '';
    }

    function stopMissionBriefingAudio() {
        clearTimeout(missionRadioWordTimer);
        missionRadioWordTimer = null;
        clearTimeout(missionRadioFallbackTimer);
        missionRadioFallbackTimer = null;
        if (missionRadioStatic) {
            try { missionRadioStatic.stop(); } catch (error) { /* already stopped */ }
            missionRadioStatic = null;
        }
        if (missionRadioAudio) {
            missionRadioAudio.onended = null;
            missionRadioAudio.onerror = null;
            missionRadioAudio.pause();
            missionRadioAudio.currentTime = 0;
            missionRadioAudio = null;
        }
        if (missionBriefingAudio) {
            missionBriefingAudio.pause();
            missionBriefingAudio.currentTime = 0;
            missionBriefingAudio = null;
        }
    }

    function getMissionRadioMessage() {
        return currentBriefingRadioIntro
            ? `${currentBriefingRadioIntro.text} …`
            : `${getMissionRadioIntro()} …`;
    }

    function getMissionRadioIntro() {
        return 'The next password to jam the zombie radar is';
    }

    function playMissionRadioChirp() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(1180, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(760, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.055, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.18);
    }

    function startMissionRadioStatic() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const duration = 0.16;
        const buffer = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * duration), audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index++) {
            const envelope = Math.sin((index / data.length) * Math.PI);
            data[index] = (Math.random() * 2 - 1) * envelope;
        }
        const source = audioCtx.createBufferSource();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        source.buffer = buffer;
        source.loop = true;
        filter.type = 'bandpass';
        filter.frequency.value = 1650;
        filter.Q.value = 0.8;
        gain.gain.value = 0.012;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start();
        missionRadioStatic = source;
    }

    function finishMissionRadioIntro(vocab, radioAudio) {
        if (missionRadioAudio !== radioAudio) return;
        clearTimeout(missionRadioFallbackTimer);
        missionRadioFallbackTimer = null;
        radioAudio.onended = null;
        radioAudio.onerror = null;
        missionRadioAudio = null;
        if (missionRadioStatic) {
            try { missionRadioStatic.stop(); } catch (error) { /* already stopped */ }
            missionRadioStatic = null;
        }
        missionRadioWordTimer = setTimeout(() => {
            missionRadioWordTimer = null;
            playMissionWordAudio(vocab);
        }, 650);
    }

    function pickMissionRadioIntro() {
        if (MISSION_RADIO_INTROS.length === 1) return MISSION_RADIO_INTROS[0];
        const index = lastMissionRadioIntroIndex < 0
            ? Math.floor(Math.random() * MISSION_RADIO_INTROS.length)
            : (() => {
                const candidate = Math.floor(Math.random() * (MISSION_RADIO_INTROS.length - 1));
                return candidate >= lastMissionRadioIntroIndex ? candidate + 1 : candidate;
            })();
        lastMissionRadioIntroIndex = index;
        return MISSION_RADIO_INTROS[index];
    }

    function pickMissionRadioIntroPath() {
        return pickMissionRadioIntro().audio;
    }

    function playMissionWordAudio(vocab) {
        const audioPath = getVocabularyAudioPath(vocab);
        if (!audioPath || !screens.command?.classList.contains('active')) return;
        duckAmbientAudio(true, 150);
        missionBriefingAudio = new Audio(audioPath);
        const restoreAmbient = () => duckAmbientAudio(false, 350);
        missionBriefingAudio.onended = restoreAmbient;
        missionBriefingAudio.onerror = restoreAmbient;
        missionBriefingAudio.play().catch(error => {
            console.log('Mission briefing audio playback failed:', error);
            restoreAmbient();
        });
    }

    function playCurrentBriefingAudio() {
        if (!screens.command?.classList.contains('active')) return;
        const vocab = state.mission.briefingWords[state.mission.briefingIndex];
        if (!vocab) return;
        stopMissionBriefingAudio();
        if (!currentBriefingRadioIntro) {
            currentBriefingRadioIntro = pickMissionRadioIntro();
        }
        const intro = currentBriefingRadioIntro;
        const messageElement = document.getElementById('command-radio-message');
        if (messageElement) messageElement.textContent = `${intro.text} …`;
        playMissionRadioChirp();
        duckAmbientAudio(true, 150);
        const radioAudio = new Audio(intro.audio);
        missionRadioAudio = radioAudio;
        const finishRadioIntro = () => {
            duckAmbientAudio(false, 350);
            finishMissionRadioIntro(vocab, radioAudio);
        };
        radioAudio.onended = finishRadioIntro;
        radioAudio.onerror = finishRadioIntro;
        startMissionRadioStatic();
        missionRadioFallbackTimer = setTimeout(finishRadioIntro, 9000);
        radioAudio.play().catch(error => {
            console.log('Mission radio intro playback failed:', error);
            finishRadioIntro();
        });
    }

    function getActiveMissionDistrict() {
        return state.mission.districts.find(district => district.id === state.mission.activeDistrictId) || null;
    }

    function renderMissionBriefingWord() {
        const words = state.mission.briefingWords;
        const index = Math.min(state.mission.briefingIndex, Math.max(0, words.length - 1));
        const vocab = words[index];
        if (!vocab) {
            beginHaloSequence();
            return;
        }

        state.mission.briefingIndex = index;
        currentBriefingRadioIntro = pickMissionRadioIntro();
        const district = getActiveMissionDistrict();
        const card = document.getElementById('command-vocab-card');
        const newTargetCount = state.mission.targetWords.filter(target => !isKnownMissionWord(target)).length;
        const knownTargetCount = Math.max(0, state.mission.targetWords.length - newTargetCount);
        const progress = ((index + 1) / words.length) * 100;
        clearTimeout(missionBriefingAdvanceTimer);
        card?.classList.remove('word-secured', 'solution-concealed');

        const districtNameEl = document.getElementById('command-district-name');
        if (districtNameEl) {
            districtNameEl.textContent = district ? `${district.label} · ${district.subtitle}` : 'Zielviertel';
        }
        const districtDetailEl = document.getElementById('command-district-detail');
        if (districtDetailEl) {
            districtDetailEl.textContent = district
                ? `${newTargetCount} neu · ${knownTargetCount} bekannt. Mission abschließen und ${district.label} grün markieren.`
                : 'Unit und Part werden als Stadtviertel sichtbar.';
        }
        const progressLabelEl = document.getElementById('command-word-progress-label');
        if (progressLabelEl) progressLabelEl.textContent = `Passwort ${index + 1} von ${words.length}`;
        const progressFillEl = document.getElementById('command-word-progress-fill');
        if (progressFillEl) progressFillEl.style.width = `${progress}%`;
        const wordStatusEl = document.getElementById('command-word-status');
        if (wordStatusEl) {
            wordStatusEl.textContent = isKnownMissionWord(vocab) ? 'Einsatzwort auffrischen' : 'Neues Zielwort';
        }
        document.getElementById('command-german-word').textContent = getGerman(vocab);
        document.getElementById('command-foreign-label').textContent = activeCourse?.subjectLabel || 'Fremdsprache';
        document.getElementById('command-foreign-word').textContent = getForeign(vocab);
        document.getElementById('command-radio-message').textContent = getMissionRadioMessage();
        document.getElementById('command-feedback').textContent = '';

        renderLetterBuilder({
            pool: document.getElementById('command-letter-pool'),
            target: document.getElementById('command-letter-target'),
            answer: getPlayableAnswer(getForeign(vocab)),
            canInteract: () => screens.command.classList.contains('active') && !card?.classList.contains('word-secured'),
            onStart: () => card?.classList.add('solution-concealed'),
            onCorrect: () => {
                card?.classList.add('word-secured');
                document.getElementById('command-feedback').textContent = index === words.length - 1
                    ? '✓ Passwort entschlüsselt! Absprungroute wird geöffnet …'
                    : '✓ Passwort entschlüsselt! Nächstes Passwort wird geladen …';
                missionBriefingAdvanceTimer = setTimeout(advanceMissionBriefing, 1050);
            },
            onIncorrect: () => {
                document.getElementById('command-feedback').textContent = 'Fast – prüfe die Reihenfolge und versuche es noch einmal.';
                return false;
            }
        });

        setTimeout(playCurrentBriefingAudio, 260);
    }

    function beginMissionBriefing() {
        stopHaloSequence();
        clearTimeout(missionBriefingAdvanceTimer);
        state.mission.briefingIndex = 0;
        currentBriefingRadioIntro = null;
        document.body.style.backgroundImage = '';
        showScreen('command');
        startCommandAmbientAudio();
        clearTimeout(commandEvasiveTimer);
        commandEvasiveTimer = setTimeout(triggerEvasiveManeuver, 3200 + Math.random() * 1700);
        renderMissionBriefingWord();
    }

    function advanceMissionBriefing() {
        const card = document.getElementById('command-vocab-card');
        if (!card?.classList.contains('word-secured')) return;
        clearTimeout(missionBriefingAdvanceTimer);
        stopMissionBriefingAudio();
        if (state.mission.briefingIndex >= state.mission.briefingWords.length - 1) {
            stopCommandAmbientAudio();
            beginHaloSequence();
            return;
        }
        state.mission.briefingIndex++;
        if (Math.random() < 0.35 && !screens.command?.classList.contains('turbulence-active')) {
            clearTimeout(commandEvasiveTimer);
            commandEvasiveTimer = setTimeout(triggerEvasiveManeuver, 1800 + Math.random() * 700);
        }
        renderMissionBriefingWord();
    }

    function createTacticalOutpostElement(threat, isTarget, isCleared) {
        const outpost = document.createElement('div');
        outpost.className = 'tactical-outpost-icon'
            + (isTarget ? ' target' : '')
            + (isCleared ? ' cleared' : '')
            + (threat.status === 'emergency' ? ' emergency' : '')
            + (threat.status === 'reinfested' ? ' reinfested' : '');
        outpost.setAttribute('aria-hidden', 'true');

        outpost.innerHTML = `
            <div class="outpost-holo-ring"></div>
            <svg class="outpost-svg" viewBox="0 0 64 50" width="64" height="50" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="32" cy="42" rx="26" ry="7" class="outpost-shadow" />
                <polygon points="10,29 32,40 32,47 10,36" class="outpost-wall-left" />
                <polygon points="32,40 54,29 54,36 32,47" class="outpost-wall-right" />
                <polygon points="32,18 54,29 32,40 10,29" class="outpost-roof" />
                <polygon points="24,15 40,15 45,21 32,27 19,21" class="outpost-cupola" />
                <ellipse cx="32" cy="18" rx="10" ry="4.5" class="outpost-dome" />
                <line x1="15" y1="31" x2="28" y2="38" class="outpost-seam" />
                <line x1="36" y1="38" x2="49" y2="31" class="outpost-seam" />
                <polygon points="30,39 34,41 34,46 30,44" class="outpost-portal" />
                <line x1="32" y1="15" x2="32" y2="5" class="outpost-antenna" />
                <circle cx="32" cy="4.5" r="3.2" class="outpost-beacon-orb" />
                <circle cx="32" cy="4.5" r="6.5" class="outpost-beacon-wave" />
            </svg>
            <span class="district-cuboid" style="display:none"><i></i></span>
        `;
        return outpost;
    }

    function renderHaloDistricts() {
        const container = document.getElementById('halo-district-grid');
        if (!container) return;
        container.innerHTML = '';
        const career = window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue);
        const cleared = new Set(career.clearedDistricts);
        const activeDistrict = getActiveMissionDistrict();
        let activeDistrictThreat = null;

        const nextCurriculumDistrict = window.VocabUtils.findNextCurriculumDistrict(
            state.mission.districts,
            activeVocabulary,
            srsData,
            career.clearedDistricts,
            state.courseId
        );
        const emergencyDistrictId = nextCurriculumDistrict?.id || null;
        const cityPoints = getCityDistrictMapPoints(state.city);

        state.mission.districts.forEach((district, index) => {
            const isCleared = cleared.has(district.id);
            const isTarget = district.id === state.mission.activeDistrictId;
            const threat = window.VocabUtils.evaluateDistrictThreat(
                district,
                activeVocabulary,
                srsData,
                career,
                state.courseId,
                emergencyDistrictId
            );
            if (isTarget) activeDistrictThreat = threat;

            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'halo-district'
                + (isCleared ? ' cleared' : '')
                + (threat.status === 'emergency' ? ' emergency' : '')
                + (threat.status === 'reinfested' ? ' reinfested' : '')
                + (isTarget ? ' target' : '');
            tile.disabled = haloMode !== 'planning';
            tile.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
            tile.setAttribute('aria-label', `${district.label}, ${district.subtitle}: ${threat.description}`);
            const mapPoint = cityPoints[index % cityPoints.length];
            tile.style.setProperty('--map-x', `${mapPoint.x}%`);
            tile.style.setProperty('--map-y', `${mapPoint.y}%`);
            tile.style.setProperty('--map-scale', mapPoint.scale);

            const outpost = createTacticalOutpostElement(threat, isTarget, isCleared);
            const label = document.createElement('strong');
            label.textContent = district.label;
            const subtitle = document.createElement('small');
            subtitle.textContent = district.subtitle;

            const chip = document.createElement('span');
            chip.className = 'district-badge-chip';
            chip.textContent = threat.badge;

            tile.append(outpost, label, subtitle, chip);
            tile.addEventListener('click', () => selectMissionDistrict(district.id));
            container.appendChild(tile);
        });

        const eventBanner = document.getElementById('halo-event-banner');
        if (eventBanner) {
            if (activeDistrictThreat && (activeDistrictThreat.status === 'emergency' || activeDistrictThreat.status === 'reinfested')) {
                eventBanner.classList.remove('hidden');
                document.getElementById('halo-event-title').textContent = activeDistrictThreat.title;
                document.getElementById('halo-event-desc').textContent = `${activeDistrictThreat.description} · +50% Bonus-XP`;
            } else {
                eventBanner.classList.add('hidden');
            }
        }

        document.getElementById('halo-active-district').textContent = activeDistrict
            ? `${activeDistrict.label} · ${activeDistrict.subtitle}`
            : 'Zielviertel';
        document.getElementById('halo-district-counter').textContent = `${state.mission.districts.filter(district => cleared.has(district.id)).length} / ${state.mission.districts.length} befreit`;
    }

    function selectMissionDistrict(districtId) {
        if (haloMode !== 'planning') return;
        const district = state.mission.districts.find(candidate => candidate.id === districtId);
        if (!district) return;
        state.mission.activeDistrictId = district.id;
        state.mission.activeDistrictLabel = `${district.label} · ${district.subtitle}`;
        renderHaloDistricts();
        document.getElementById('halo-deploy-status').textContent = `${district.label} · ${district.subtitle} markiert · ${district.vocabCount} Wörter im Viertel`;
        const deployButton = document.getElementById('halo-deploy-btn');
        deployButton.disabled = false;
        deployButton.textContent = 'Briefing im Flugzeug starten';
    }

    function beginMissionDistrictSelection(preferredDistrictId = '') {
        stopCommandAmbientAudio();
        stopMissionBriefingAudio();
        clearTimeout(missionBriefingAdvanceTimer);
        stopHaloSequence();
        haloMode = 'planning';

        const validVocabs = activeVocabulary.filter(vocab => getForeign(vocab).trim() && getGerman(vocab).trim());
        const districts = window.VocabUtils.createVocabularyDistricts(validVocabs, state.courseId);
        const career = window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue);
        const preferred = districts.find(district => district.id === preferredDistrictId) || null;
        const nextCurriculumDistrict = window.VocabUtils.findNextCurriculumDistrict(
            districts,
            validVocabs,
            srsData,
            career.clearedDistricts,
            state.courseId
        );
        const suggested = preferred || nextCurriculumDistrict || window.VocabUtils.pickNextMissionDistrict(districts, preferred, career.clearedDistricts);
        state.mission.districts = districts;
        state.mission.activeDistrictId = suggested?.id || '';
        state.mission.activeDistrictLabel = suggested ? `${suggested.label} · ${suggested.subtitle}` : '';

        const selectedCity = CITIES.find(city => city.id === state.city) || CITIES[0];
        document.body.style.backgroundImage = `url('${selectedCity.mapImg || selectedCity.img}')`;

        document.getElementById('halo-city-name').textContent = selectedCity?.name || 'der Stadt';
        document.getElementById('halo-phase-badge').textContent = 'Phase 1 · Zielgebiet wählen';
        document.getElementById('halo-title').firstChild.textContent = 'Einsatzkarte ';
        document.getElementById('halo-subtitle').textContent = 'Wo soll das Rettungsteam landen?';
        document.getElementById('halo-map-eyebrow').textContent = 'Zielgebiet direkt markieren';
        document.getElementById('back-from-halo-btn').textContent = '⬅ Einsatzwahl';
        const deployButton = document.getElementById('halo-deploy-btn');
        deployButton.disabled = !suggested;
        deployButton.textContent = 'Briefing im Flugzeug starten';
        document.getElementById('halo-deploy-status').textContent = suggested
            ? `${suggested.label} · ${suggested.subtitle} als nächstes Ziel vorgeschlagen`
            : 'Markiere eine Unit und einen Part auf der Stadtkarte.';

        showScreen('halo');
        screens.halo.classList.add('is-planning');
        renderHaloDistricts();
    }

    function stopHaloSequence() {
        clearTimeout(haloDeploymentTimer);
        haloDeploymentTimer = null;
        document.body.classList.remove('halo-jumping');
        screens.halo?.classList.remove('is-jumping');
        const haloVideo = document.getElementById('halo-jump-video');
        if (haloVideo) {
            haloVideo.pause();
            haloVideo.onended = null;
            haloVideo.onerror = null;
            haloVideo.currentTime = 0;
        }
    }

    function beginHaloSequence() {
        stopCommandAmbientAudio();
        stopMissionBriefingAudio();
        stopHaloSequence();
        haloMode = 'deployment';
        const selectedCity = CITIES.find(city => city.id === state.city) || CITIES[0];
        document.body.style.backgroundImage = '';
        document.body.classList.add('halo-jumping');

        const activeDistrict = getActiveMissionDistrict();
        const deployButton = document.getElementById('halo-deploy-btn');
        const deployStatus = document.getElementById('halo-deploy-status');

        document.getElementById('halo-city-name').textContent = selectedCity?.name || 'der Stadt';
        document.getElementById('halo-phase-badge').textContent = 'Phase 3 · HALO-Absprung';
        document.getElementById('halo-title').firstChild.textContent = 'HALO über ';
        document.getElementById('halo-subtitle').textContent = activeDistrict
            ? `${activeDistrict.label} · ${activeDistrict.subtitle}`
            : '';
        document.getElementById('halo-map-eyebrow').textContent = 'Markierte Landezone';
        document.getElementById('back-from-halo-btn').textContent = '⬅ Stadtkarte';
        const landingDistrictEl = document.getElementById('halo-landing-district');
        if (landingDistrictEl) {
            landingDistrictEl.textContent = activeDistrict
                ? `${activeDistrict.label} · ${activeDistrict.subtitle}`
                : 'markierte Landezone';
        }
        deployButton.disabled = true;
        deployStatus.textContent = 'Absprung läuft · Kurs auf das Zielviertel';
        showScreen('halo');
        screens.halo.classList.remove('is-planning');
        void screens.halo.offsetWidth;
        screens.halo.classList.add('is-jumping');

        try {
            const freefallAudio = new Audio('assets/audio/ui/halo_freefall_wind.mp3');
            freefallAudio.volume = 0.65;
            duckAmbientAudio(true, 250);
            freefallAudio.onended = () => duckAmbientAudio(false, 500);
            freefallAudio.onerror = () => duckAmbientAudio(false, 400);
            freefallAudio.play().catch(() => {});
        } catch (e) {}

        const haloVideo = document.getElementById('halo-jump-video');
        if (haloVideo) {
            try {
                haloVideo.currentTime = 0;
                haloVideo.onended = () => {
                    if (haloVideo.currentTime > 2) {
                        stopHaloSequence();
                        launchGameSession();
                    }
                };
                haloVideo.onerror = (err) => {
                    console.log('HALO jump video playback note:', err);
                };
                haloVideo.play().catch(error => {
                    console.log('HALO jump video autoplay note:', error);
                });
            } catch (e) {
                console.log('HALO video start note:', e);
            }
        }

        haloDeploymentTimer = setTimeout(() => {
            stopHaloSequence();
            launchGameSession();
        }, 10200);
    }

    function launchGameSession() {
        state.gameRunning = true;
        state.startTime = Date.now();
        state.lastTimestamp = performance.now();
        const selectedCity = CITIES.find(c => c.id === state.city) || CITIES[0];
        document.body.style.backgroundImage = `url('${selectedCity.img}')`;

        const weatherOverlay = document.getElementById('weather-overlay');
        if (weatherOverlay) {
            weatherOverlay.className = '';
            if (state.city !== 'buehl' && Math.random() < 0.4) {
                weatherOverlay.classList.add('weather-rain');
            }
        }

        updateHeartsUI();
        updateMissionHUD();
        scoreEl.textContent = state.score;
        showScreen('game');
        spawnZombie();
        lastFrameTime = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        if (activeVocabulary.length === 0) {
            alert('Vokabeln werden noch geladen oder sind nicht verfügbar... Bitte warte kurz und versuche es erneut.');
            return;
        }

        const requestedMissionDistrictId = isMissionMode() ? state.mission.activeDistrictId : '';
        state.direction = isMissionMode() ? 'de-foreign' : document.getElementById('translation-direction').value;

        const selectedCheckboxes = Array.from(document.querySelectorAll('.filter-checkbox:checked'));
        const paths = isMissionMode() ? ['all'] : selectedCheckboxes.map(cb => cb.value);
        const decodeFilterSegment = window.VocabUtils.decodeFilterSegment;
        const getCategoryUnitName = unit => unit.match(/Unit\s*\d+/i)?.[0] || unit;
        
        // Nur vollständig übersetzte Einträge des aktiven Kurses verwenden.
        const validVocabs = activeVocabulary.filter(v => getForeign(v).trim() !== '' && getGerman(v).trim() !== '');

        if (paths.includes('all') || paths.length === 0) {
            state.vocabPool = [...validVocabs];
        } else {
            state.vocabPool = validVocabs.filter(v => {
                return paths.some(path => {
                    if (path.startsWith('unit:')) return v.unit === decodeFilterSegment(path.slice(5));
                    if (path.startsWith('part:')) {
                        const partsArr = path.split(':');
                        if (partsArr.length === 3) {
                            return v.unit === decodeFilterSegment(partsArr[1]) && v.part === decodeFilterSegment(partsArr[2]);
                        }
                        return false;
                    }
                    if (path.startsWith('page:')) {
                        const parts = path.split(':');
                        if (parts.length === 3) {
                            return v.unit === decodeFilterSegment(parts[1]) && String(v.page) === parts[2];
                        }
                        return String(v.page) === parts[1];
                    }
                    return false;
                });
            });
        }
        
        if (state.vocabPool.length === 0) {
            alert('Keine Vokabeln für diesen Pfad gefunden!');
            return;
        }

        let missionTargets = [];
        let missionBriefingWords = [];
        let missionDistricts = [];
        let activeMissionDistrict = null;
        if (isMissionMode()) {
            missionDistricts = window.VocabUtils.createVocabularyDistricts(validVocabs, state.courseId);
            const selectedDistricts = missionDistricts;
            const clearedDistrictIds = new Set(
                window.VocabUtils.normalizeRescueCareer(playerProfile.stats.rescue).clearedDistricts
            );
            const preliminaryTargets = selectMissionTargets(state.vocabPool);
            activeMissionDistrict = selectedDistricts.find(district => district.id === requestedMissionDistrictId)
                || window.VocabUtils.pickMissionDistrict(preliminaryTargets, state.courseId);
            if (!requestedMissionDistrictId) {
                activeMissionDistrict = window.VocabUtils.pickNextMissionDistrict(
                    selectedDistricts,
                    activeMissionDistrict,
                    clearedDistrictIds
                );
            }
            const districtPool = activeMissionDistrict
                ? state.vocabPool.filter(vocab => (
                    window.VocabUtils.getVocabularyDistrict(vocab, state.courseId).id === activeMissionDistrict.id
                ))
                : state.vocabPool;
            missionTargets = selectMissionTargets(districtPool);
            if (missionTargets.length === 0) missionTargets = preliminaryTargets;
            missionBriefingWords = missionTargets.filter(vocab => !isKnownMissionWord(vocab)).slice(0, CONFIG.missionNewWordLimit);
            if (missionBriefingWords.length === 0) {
                missionBriefingWords = missionTargets.slice(0, Math.min(3, missionTargets.length));
            }
            activeMissionDistrict = window.VocabUtils.pickMissionDistrict(missionTargets, state.courseId) || activeMissionDistrict;
            state.vocabPool = [...missionTargets];
        } else {
            // GAMIFICATION: Apply SRS weights to the classic endless hunt.
            const srsWeightedPool = [];
            state.vocabPool.forEach(vocab => {
                const srsKey = getSrsKey(vocab);
                let weight = 1;

                if (srsData.entries[srsKey]) {
                    const srs = srsData.entries[srsKey];
                    const totalAttempts = srs.timesCorrect + srs.timesFailed;
                    if (totalAttempts > 0) {
                        const failRate = srs.timesFailed / totalAttempts;
                        if (failRate > 0.5) weight = 3;
                        else if (failRate > 0.3) weight = 2;

                        const daysSinceLastSeen = (Date.now() - srs.lastSeen) / (1000 * 60 * 60 * 24);
                        if (daysSinceLastSeen > 7) weight += 1;
                    }
                } else {
                    weight = 2;
                }

                for (let i = 0; i < weight; i++) srsWeightedPool.push(vocab);
            });
            state.vocabPool = srsWeightedPool;
        }

        let unitStatus = new Map();

        if (paths.includes('all') || paths.length === 0) {
            const allUnits = [...new Set(activeVocabulary.map(v => {
                if (!v.unit) return null;
                const match = v.unit.match(/Unit\s*\d+/i);
                return match ? match[0] : v.unit;
            }).filter(Boolean))];
            
            allUnits.forEach(u => {
                unitStatus.set(u, { full: true, partial: false });
            });
        } else {
            paths.forEach(p => {
                if (p.startsWith('unit:')) {
                    const u = getCategoryUnitName(decodeFilterSegment(p.slice(5)));
                    if (!unitStatus.has(u)) unitStatus.set(u, { full: false, partial: false });
                    unitStatus.get(u).full = true;
                } else if (p.startsWith('part:')) {
                    const partsArr = p.split(':');
                    const u = getCategoryUnitName(decodeFilterSegment(partsArr[1]));
                    if (!unitStatus.has(u)) unitStatus.set(u, { full: false, partial: false });
                    unitStatus.get(u).partial = true;
                } else if (p.startsWith('page:')) {
                    const parts = p.split(':');
                    if (parts.length === 3) {
                        const decodedUnit = decodeFilterSegment(parts[1]);
                        const match = decodedUnit.match(/Unit\s*\d+/i);
                        const u = match ? match[0] : decodedUnit;
                        if (!unitStatus.has(u)) unitStatus.set(u, { full: false, partial: false });
                        unitStatus.get(u).partial = true;
                    } else {
                        const pageNum = parts[1];
                        const matchingVocabs = activeVocabulary.filter(v => String(v.page) === pageNum);
                        const pageUnits = [...new Set(matchingVocabs.map(v => v.unit).filter(Boolean))];
                        
                        if (pageUnits.length > 0) {
                            pageUnits.forEach(pu => {
                                const match = pu.match(/Unit\s*\d+/i);
                                const u = match ? match[0] : pu;
                                if (!unitStatus.has(u)) unitStatus.set(u, { full: false, partial: false });
                                unitStatus.get(u).partial = true;
                            });
                        } else {
                            const u = 'Seite ' + pageNum;
                            if (!unitStatus.has(u)) unitStatus.set(u, { full: false, partial: false });
                            unitStatus.get(u).partial = true;
                        }
                    }
                }
            });
        }

        let formattedUnits = [];
            for (let [u, status] of unitStatus.entries()) {
                if (status.full) {
                    formattedUnits.push(u);
                } else {
                    formattedUnits.push(`${u} - Mix`);
                }
            }
            
        // Aufsteigend sortieren
        formattedUnits.sort();

        if (formattedUnits.length === 0) {
            state.kategorie = `${getCourseLabel()}: Mix`;
        } else {
            state.kategorie = `${getCourseLabel()}: ${formattedUnits.join(', ')}`;
        }
        
        if (state.direction === 'de-foreign-write') {
            state.kategorie += ", schreiben";
        } else if (state.direction === 'mixed') {
            state.kategorie += ", gemischt";
        } else if (state.direction === 'foreign-de') {
            state.kategorie += ", nach Deutsch";
        }
        if (isMissionMode()) state.kategorie += ', Mission';

        // Reset State
        state.hearts = 3;
        state.score = 0;
        state.zombieSpeed = 1.5;
        state.gameRunning = false;
        state.totalAttempts = 0;
        state.correctAttempts = 0;
        state.weaknesses = {};
        state.startTime = 0;
        state.level = 1;
        state.streak = 0;
        state.maxStreak = 0;
        state.correctSinceLastRegen = 0;
        state.lastTimestamp = performance.now();
        state.wrongAttemptsForCurrentWord = 0;
        state.settingsPending = false;
        state.wordsSinceLastBoss = 0;
        state.bossActive = false;
        state.bossHealth = 0;
        state.bossMaxHealth = 0;
        state.lastVocabId = '';
        if (state.correction?.confirmationTimer) clearTimeout(state.correction.confirmationTimer);
        if (state.correction?.audio) {
            state.correction.audio.pause();
            state.correction.audio.currentTime = 0;
        }
        stopCriticalHealthAudio(0);
        state.correction = {
            queue: [],
            activeEntry: null,
            currentRetry: null,
            encounterSerial: 0,
            createdOrder: 0,
            confirmationTimer: null,
            resolvedBannerTimer: null,
            audio: null
        };
        state.mission = {
            targetWords: missionTargets,
            securedIds: new Set(),
            encounters: 0,
            lastVocabId: '',
            completed: false,
            endReason: '',
            currentPhase: '',
            finishing: false,
            transitionActive: false,
            startXp: playerProfile.xp,
            answerXp: 0,
            recoveredCorrectionIds: new Set(),
            briefingWords: missionBriefingWords,
            briefingIndex: 0,
            districts: missionDistricts,
            activeDistrictId: activeMissionDistrict?.id || '',
            activeDistrictLabel: activeMissionDistrict
                ? `${activeMissionDistrict.label} · ${activeMissionDistrict.subtitle}`
                : ''
        };
        settingsBtn.classList.remove('pending');
        correctionPanel?.classList.add('hidden');
        markedRetryBanner?.classList.add('hidden');
        screens.game.classList.remove('correction-active');
        
        updateBoostUI();
        
        const selectedHunter = HUNTERS.find(h => h.id === state.hunterType) || HUNTERS[0];
        resetHunterAnimation();
        hunterEl.src = selectedHunter.img;
        
        if (isMissionMode()) {
            beginMissionBriefing();
        } else {
            launchGameSession();
        }
    }

    function getQuestionAndAnswer(vocab, isForeignToGerman) {
        if (isForeignToGerman === undefined) {
            isForeignToGerman = state.direction === 'foreign-de';
            if (state.direction === 'mixed') {
                isForeignToGerman = Math.random() > 0.5;
            }
        }
        return isForeignToGerman ?
            { q: getForeign(vocab), a: getGerman(vocab), vocab: vocab } :
            { q: getGerman(vocab), a: getForeign(vocab), vocab: vocab };
    }

    function setZombieWord(question) {
        const text = String(question ?? '');
        const density = window.VocabUtils.getWordBubbleDensity(text);

        zombieWordEl.textContent = text;
        zombieWordEl.classList.remove('word-bubble-long', 'word-bubble-very-long');
        if (density !== 'normal') zombieWordEl.classList.add(`word-bubble-${density}`);
    }

    function getPlayableAnswer(answer) {
        return String(answer || '').replace(/,\s*pl[\s\S]*/i, '');
    }

    function stopCorrectionAudio() {
        if (!state.correction.audio) return;
        state.correction.audio.pause();
        state.correction.audio.currentTime = 0;
        state.correction.audio = null;
        duckAmbientAudio(false, 250);
    }

    function playCorrectionAudio(vocab) {
        stopCorrectionAudio();
        const audioPath = getVocabularyAudioPath(vocab);
        if (!audioPath) return;
        duckAmbientAudio(true, 150);
        state.correction.audio = new Audio(audioPath);
        const restoreAmbient = () => duckAmbientAudio(false, 350);
        state.correction.audio.onended = restoreAmbient;
        state.correction.audio.onerror = restoreAmbient;
        state.correction.audio.play().catch(error => {
            console.log('Correction audio playback failed:', error);
            restoreAmbient();
        });
    }

    function scheduleCurrentCorrection(speedPenalty = 0) {
        const vocab = state.currentWord.vocab;
        const schedule = window.VocabUtils.createCorrectionSchedule(state.correction.encounterSerial);
        let entry = state.correction.queue.find(candidate => candidate.vocab.id === vocab.id && !candidate.resolved);

        if (!entry) {
            entry = {
                vocab,
                createdOrder: state.correction.createdOrder++,
                retryCount: 0,
                speedPenalty: 0,
                resolved: false
            };
            state.correction.queue.push(entry);
        }

        entry.question = state.currentWord.q;
        entry.answer = state.currentWord.a;
        entry.spacerCount = schedule.spacerCount;
        entry.dueEncounter = schedule.dueEncounter;
        entry.retryCount++;
        entry.speedPenalty = Math.min(12, Number(entry.speedPenalty || 0) + Number(speedPenalty || 0));
        entry.resolved = false;
        return entry;
    }

    function selectNextEncounter() {
        const pendingCorrections = getPendingCorrections();
        const nextEncounter = state.correction.encounterSerial + 1;
        const forceCorrection = isMissionMode()
            && state.mission.encounters >= CONFIG.missionMaxEncounters
            && pendingCorrections.length > 0;
        let correctionEntry = window.VocabUtils.pickDueCorrection(
            pendingCorrections,
            nextEncounter,
            forceCorrection
        );

        if (correctionEntry) return { vocab: correctionEntry.vocab, correctionEntry };

        const excludedIds = new Set(pendingCorrections.map(entry => entry.vocab.id));
        let vocab = null;
        if (isMissionMode()) {
            vocab = window.VocabUtils.pickMissionVocabulary(
                state.mission.targetWords,
                state.mission.securedIds,
                state.mission.lastVocabId,
                Math.random,
                excludedIds
            );
        } else {
            // Free Hunt intentionally keeps its established random draw. The
            // correction queue is a Rescue Mission mechanic only.
            vocab = state.vocabPool[Math.floor(Math.random() * state.vocabPool.length)] || null;
        }

        // Very small custom pools may not contain enough spacer words. In that
        // edge case, return the oldest marked zombie instead of stalling.
        if (!vocab && pendingCorrections.length > 0) {
            correctionEntry = window.VocabUtils.pickDueCorrection(pendingCorrections, nextEncounter, true);
            if (correctionEntry) return { vocab: correctionEntry.vocab, correctionEntry };
        }

        return { vocab, correctionEntry: null };
    }

    function setMarkedZombieUI(correctionEntry) {
        const isMarked = Boolean(correctionEntry);
        const preserveResolvedBanner = !isMarked && markedRetryBanner?.classList.contains('resolved');
        zombieEl.classList.remove('marked-fleeing', 'marked-rescued');
        zombieEl.classList.toggle('marked-zombie', isMarked);
        clearTimeout(state.correction.resolvedBannerTimer);
        state.correction.resolvedBannerTimer = null;
        if (preserveResolvedBanner) {
            state.correction.resolvedBannerTimer = setTimeout(() => {
                markedRetryBanner?.classList.add('hidden');
                markedRetryBanner?.classList.remove('resolved');
                state.correction.resolvedBannerTimer = null;
            }, 1500);
        } else {
            markedRetryBanner?.classList.toggle('hidden', !isMarked);
            markedRetryBanner?.classList.remove('resolved');
        }
        if (markedRetryBanner && !preserveResolvedBanner) {
            const symbol = markedRetryBanner.querySelector('.marked-retry-symbol');
            const kicker = markedRetryBanner.querySelector('.marked-retry-kicker');
            const title = markedRetryBanner.querySelector('.marked-retry-title');
            if (symbol) symbol.textContent = '⟳';
            if (kicker) kicker.textContent = 'Markierter Zombie';
            if (title) title.textContent = 'Du kennst ihn – hol dir das Wort jetzt zurück!';
        }
    }

    function beginCorrectionConfirmation(speedPenalty = 0) {
        if (!state.currentWord || state.correction.activeEntry) return;
        const entry = scheduleCurrentCorrection(speedPenalty);
        state.correction.activeEntry = entry;
        state.zombieDead = true;
        screens.game.classList.add('correction-active');
        document.getElementById('mission-phase-overlay')?.classList.add('hidden');
        optionsContainer.classList.add('hidden');
        document.getElementById('writing-container').classList.add('hidden');
        markedRetryBanner?.classList.add('hidden');

        correctionPanel?.classList.remove('hidden', 'confirmed', 'solution-concealed');
        const emblemSymbol = correctionPanel?.querySelector('.correction-mark-emblem > span');
        if (emblemSymbol) emblemSymbol.textContent = '⟳';
        document.getElementById('correction-question').textContent = entry.question;
        document.getElementById('correction-answer').textContent = entry.answer;
        document.getElementById('correction-return-label').textContent = `nach ${entry.spacerCount} ${entry.spacerCount === 1 ? 'Wort' : 'Wörtern'}`;
        if (correctionFeedback) correctionFeedback.textContent = 'Setze die Buchstaben in der richtigen Reihenfolge ein.';

        const playableAnswer = getPlayableAnswer(entry.answer);
        const letterCount = tokenizeAnswer(playableAnswer).filter(token => token.type === 'letter').length;
        const builder = correctionPanel?.querySelector('.correction-builder');
        builder?.classList.remove('builder-dense', 'builder-very-dense');
        if (letterCount > 36) builder?.classList.add('builder-very-dense');
        else if (letterCount > 20) builder?.classList.add('builder-dense');

        renderLetterBuilder({
            pool: correctionPool,
            target: correctionTarget,
            answer: playableAnswer,
            canInteract: () => Boolean(state.correction.activeEntry),
            onStart: () => correctionPanel?.classList.add('solution-concealed'),
            onCorrect: completeCorrectionConfirmation,
            onIncorrect: () => {
                if (correctionFeedback) correctionFeedback.textContent = 'Fast – die markierten Buchstaben springen zurück. Versuch es noch einmal.';
            }
        });

        setZombieWord(`${entry.answer}  ✓`);
        zombieEl.classList.remove('dead', 'walking', 'hidden');
        zombieEl.classList.add('marked-zombie', 'marked-fleeing');
        zombieEl.style.opacity = '1';
        playCorrectionAudio(entry.vocab);
    }

    function completeCorrectionConfirmation() {
        const entry = state.correction.activeEntry;
        if (!entry) return;
        entry.confirmed = true;
        correctionPanel?.classList.add('confirmed');
        const emblemSymbol = correctionPanel?.querySelector('.correction-mark-emblem > span');
        if (emblemSymbol) emblemSymbol.textContent = '✓';
        if (correctionFeedback) {
            correctionFeedback.textContent = `Lösung bestätigt! Achte auf das ⟳ – der Zombie kehrt nach ${entry.spacerCount} ${entry.spacerCount === 1 ? 'Wort' : 'Wörtern'} zurück.`;
        }
        stopCorrectionAudio();

        clearTimeout(state.correction.confirmationTimer);
        state.correction.confirmationTimer = setTimeout(() => {
            correctionPanel?.classList.add('hidden');
            correctionPanel?.classList.remove('confirmed');
            screens.game.classList.remove('correction-active');
            zombieEl.classList.remove('marked-fleeing', 'marked-zombie');
            state.correction.activeEntry = null;
            state.correction.currentRetry = null;

            if (!isMissionMode() && state.hearts <= 0) {
                endGame();
            } else {
                spawnZombie();
            }
        }, 1050);
    }

    function resolveCurrentCorrectionRetry() {
        const entry = state.correction.currentRetry;
        if (!entry) return false;
        if (isMissionMode()) state.mission.recoveredCorrectionIds.add(entry.vocab.id);
        entry.resolved = true;
        state.correction.queue = state.correction.queue.filter(candidate => candidate !== entry);
        state.correction.currentRetry = null;
        zombieEl.classList.add('marked-rescued');

        if (markedRetryBanner) {
            markedRetryBanner.classList.add('resolved');
            const symbol = markedRetryBanner.querySelector('.marked-retry-symbol');
            const kicker = markedRetryBanner.querySelector('.marked-retry-kicker');
            const title = markedRetryBanner.querySelector('.marked-retry-title');
            if (symbol) symbol.textContent = '✓';
            if (kicker) kicker.textContent = 'Spur gesichert';
            if (title) title.textContent = 'Stark erinnert – dieser Zombie ist erledigt.';
        }
        return true;
    }

    function spawnZombie() {
        if (!state.gameRunning) return;
        
        if (state.settingsPending) {
            state.gameRunning = false;
            settingsDialog.classList.remove('hidden');
            settingsBtn.classList.remove('pending');
            return;
        }

        state.correction.currentRetry = null;
        setMarkedZombieUI(null);
        if (finishMissionIfNeeded()) return;

        state.wrongAttemptsForCurrentWord = 0;
        state.zombieDead = false;

        state.wordsSinceLastBoss++;
        
        let isBoss = false;
        if (isMissionMode()) {
            const remainingCount = getMissionRemainingCount();
            isBoss = remainingCount > 0 && remainingCount <= getMissionBossTargetCount();
        } else if ((state.wordsSinceLastBoss >= 10 && Math.random() > 0.5) || state.wordsSinceLastBoss >= 15) {
            isBoss = true;
            state.wordsSinceLastBoss = 0;
        }

        if (isBoss) {
            state.bossActive = true;
            state.bossHealth = isMissionMode()
                ? Math.max(3, CONFIG.missionBossWordCount)
                : Math.floor(Math.random() * 2) + 3;
            state.bossMaxHealth = state.bossHealth;
            zombieEl.classList.add('boss');
            
            const hb = document.getElementById('boss-health-bar');
            hb.innerHTML = '';
            hb.classList.remove('hidden');
            for(let i=0; i<state.bossHealth; i++) {
                const hp = document.createElement('div');
                hp.className = 'boss-hp';
                hb.appendChild(hp);
            }
        } else {
            state.bossActive = false;
            zombieEl.classList.remove('boss');
            document.getElementById('boss-health-bar').classList.add('hidden');
        }

        const nextEncounter = selectNextEncounter();
        const vocab = nextEncounter.vocab;
        if (!vocab) {
            if (isMissionMode()) finishMissionIfNeeded();
            return;
        }
        state.correction.currentRetry = nextEncounter.correctionEntry;
        registerMissionEncounter(vocab, Boolean(nextEncounter.correctionEntry));
        setMarkedZombieUI(nextEncounter.correctionEntry);
        
        let currentMode = state.direction;
        if (state.direction === 'mixed') {
            const modes = ['foreign-de', 'de-foreign', 'de-foreign-write'];
            currentMode = modes[Math.floor(Math.random() * modes.length)];
        }
        state.currentMode = currentMode;

        let isForeignToGerman = currentMode === 'foreign-de';
        if (currentMode === 'de-foreign-write') {
            isForeignToGerman = false;
        }

        state.currentWord = getQuestionAndAnswer(vocab, isForeignToGerman);

        // Dynamische Schwierigkeit: Zombie wird kontinuierlich schneller bis 100 Vokabeln
        let progress = Math.min(state.correctAttempts / CONFIG.maxVocabsForMaxSpeed, 1.0);
        let maxDuration = CONFIG.maxZombieDuration;
        let minDuration = CONFIG.minZombieDuration;
        
        if (currentMode === 'de-foreign-write') {
            // Schreibmodus: Zeit basiert auf der Wortlänge. Zu Beginn 5.0s pro Buchstabe (Faktor 10 langsamer).
            let letters = tokenizeAnswer(state.currentWord.a).filter(token => token.type === 'letter').length;
            maxDuration = Math.max(10.0, letters * 3.0);
            minDuration = Math.max(3.0, letters * 1.0);
        }

        let currentDuration = maxDuration - (progress * (maxDuration - minDuration));
        if (isMissionMode() && getMissionPhase() === 'scout') {
            // Phase 1 is intentionally calmer: the player should first orient
            // themselves and retrieve three words without immediate pressure.
            currentDuration *= 1.45;
        }
        let startX = canvas.clientWidth;
        let distance = startX - 200; // 200 ist der Hit-Bereich
        let framesNeeded = currentDuration * 60; // Geht von 60fps aus

        state.zombieSpeed = distance / framesNeeded;
        if (nextEncounter.correctionEntry) {
            // The existing speed penalty remains attached to the zombie that
            // escaped, while the correction itself is untimed.
            state.zombieSpeed += Number(nextEncounter.correctionEntry.speedPenalty || 0);
        }

        setZombieWord(state.currentWord.q);
        state.zombiePosition = canvas.clientWidth; 
        zombieEl.style.left = state.zombiePosition + 'px';
        zombieEl.style.opacity = '0';
        zombieEl.classList.add('walking');
        zombieEl.classList.remove('dead');
        zombieImgEl.style.animationDuration = `${Math.max(0.3, 1.5 / Math.max(0.6, state.zombieSpeed || 1.0))}s`;
        
        if (CONFIG.bubbleOnLeft) {
            zombieEl.classList.add('bubble-left');
        } else {
            zombieEl.classList.remove('bubble-left');
        }
        
        const chosenZombieSrc = state.bossActive
            ? 'assets/zombie10.png'
            : zombieImages[Math.floor(Math.random() * zombieImages.length)];
        zombieImgEl.src = chosenZombieSrc;

        const spriteConfig = ZOMBIE_SPRITES[chosenZombieSrc];
        if (zombieSpriteCanvas && spriteConfig && spriteConfig.img.complete) {
            activeZombieSprite = spriteConfig;
            zombieImgEl.style.display = 'none';
            zombieSpriteCanvas.style.display = 'block';
            zombieCurrentFrame = 0;
            zombieLastFrameTime = 0;
            renderZombieSpriteFrame(); // Ersten Frame sofort zeichnen
        } else {
            activeZombieSprite = null;
            zombieImgEl.style.display = '';
            if (zombieSpriteCanvas) zombieSpriteCanvas.style.display = 'none';
        }

        if (currentMode === 'de-foreign-write') {
            document.getElementById('options-container').classList.add('hidden');
            document.getElementById('writing-container').classList.remove('hidden');
            generateWritingUI(vocab);
        } else {
            document.getElementById('options-container').classList.remove('hidden');
            document.getElementById('writing-container').classList.add('hidden');
            generateOptions(vocab, isForeignToGerman);
        }
    }

    function generateNewWordForBoss() {
        const nextEncounter = selectNextEncounter();
        const vocab = nextEncounter.vocab;
        if (!vocab) return false;
        state.correction.currentRetry = nextEncounter.correctionEntry;
        registerMissionEncounter(vocab, Boolean(nextEncounter.correctionEntry));
        setMarkedZombieUI(nextEncounter.correctionEntry);
        
        let currentMode = state.direction;
        if (state.direction === 'mixed') {
            const modes = ['foreign-de', 'de-foreign', 'de-foreign-write'];
            currentMode = modes[Math.floor(Math.random() * modes.length)];
        }
        state.currentMode = currentMode;

        let isForeignToGerman = currentMode === 'foreign-de';
        if (currentMode === 'de-foreign-write') {
            isForeignToGerman = false;
        }

        state.currentWord = getQuestionAndAnswer(vocab, isForeignToGerman);
        setZombieWord(state.currentWord.q);
        state.wrongAttemptsForCurrentWord = 0; // Fehlerzähler für neues Wort zurücksetzen
        if (nextEncounter.correctionEntry) {
            state.zombieSpeed += Number(nextEncounter.correctionEntry.speedPenalty || 0);
        }
        
        if (currentMode === 'de-foreign-write') {
            document.getElementById('options-container').classList.add('hidden');
            document.getElementById('writing-container').classList.remove('hidden');
            generateWritingUI(vocab);
        } else {
            document.getElementById('options-container').classList.remove('hidden');
            document.getElementById('writing-container').classList.add('hidden');
            generateOptions(vocab, isForeignToGerman);
        }
        return true;
    }

    function generateOptions(correctVocab, isForeignToGerman) {
        optionsContainer.innerHTML = '';
        optionsContainer.classList.remove('options-dense', 'options-very-dense');
        // Dynamische Schwierigkeit: Mehr Auswahlmöglichkeiten je besser der Streak ist (max 8)
        const optionsCount = Math.min(8, 4 + Math.floor(state.streak / CONFIG.streakForExtraOption));
        let options = [state.currentWord.a];

        let attempts = 0;
        // Zuerst aus dem aktiven Vokabelpool auffüllen
        while (options.length < optionsCount && attempts < 100) {
            const randomV = state.vocabPool[Math.floor(Math.random() * state.vocabPool.length)];
            const wrongA = getQuestionAndAnswer(randomV, isForeignToGerman).a;
            if (!options.includes(wrongA)) {
                options.push(wrongA);
            }
            attempts++;
        }
        
        // Falls der Pool zu klein war (z.B. nur 3 Vokabeln auf einer Seite),
        // fülle den Rest aus dem globalen Vokabular auf
        attempts = 0;
        while (options.length < optionsCount && attempts < 100) {
            const randomV = activeVocabulary[Math.floor(Math.random() * activeVocabulary.length)];
            const wrongA = getQuestionAndAnswer(randomV, isForeignToGerman).a;
            if (!options.includes(wrongA) && wrongA && wrongA.trim() !== '') {
                options.push(wrongA);
            }
            attempts++;
        }

        options.sort(() => Math.random() - 0.5);

        const optionDensity = window.VocabUtils.getOptionDensity(options);
        if (optionDensity === 'dense') {
            optionsContainer.classList.add('options-dense');
        } else if (optionDensity === 'very-dense') {
            optionsContainer.classList.add('options-very-dense');
        }

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = opt;
            btn.dataset.correct = opt === state.currentWord.a ? 'true' : 'false';
            btn.addEventListener('click', () => handleAnswer(opt, btn));
            optionsContainer.appendChild(btn);
        });

        adjustOptionsFontSize();
    }

    function adjustOptionsFontSize() {
        const buttons = Array.from(optionsContainer.querySelectorAll('.option-btn'));
        if (buttons.length === 0) return;
        
        // Zurücksetzen auf Standard
        buttons.forEach(btn => {
            btn.style.fontSize = '';
            btn.style.padding = '';
        });
        
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        let fontSize = parseFloat(getComputedStyle(buttons[0]).fontSize) / rootFontSize;
        const minFontSize = optionsContainer.classList.contains('options-very-dense') ? 1.5 : 1.6;
        const step = 0.2;
        const maxOptionsHeight = Math.max(170, Math.min(250, window.innerHeight * 0.23));
        
        while (fontSize >= minFontSize) {
            let rows = 1;
            let lastTop = buttons[0].offsetTop;
            
            for (let i = 1; i < buttons.length; i++) {
                if (Math.abs(buttons[i].offsetTop - lastTop) > 5) {
                    rows++;
                    lastTop = buttons[i].offsetTop;
                }
            }
            
            if (rows <= 3 && optionsContainer.scrollHeight <= maxOptionsHeight) {
                break; // Passt in Zeilenzahl und verfügbaren oberen Bereich
            }
            
            fontSize -= step;
            buttons.forEach(btn => {
                btn.style.fontSize = `${fontSize}rem`;
                // Passendes Padding verringern, damit die Buttons kompakter werden
                const paddingY = Math.max(10, fontSize * 5);
                const paddingX = Math.max(15, fontSize * 8);
                btn.style.padding = `${paddingY}px ${paddingX}px`;
            });
        }
    }

    function tokenizeAnswer(answer) {
        return window.VocabUtils.tokenizeAnswer(answer);
    }

    function renderLetterBuilder({ pool, target, answer, canInteract, onStart, onCorrect, onIncorrect }) {
        pool.innerHTML = '';
        target.innerHTML = '';
        const tokens = tokenizeAnswer(answer);
        const lettersToType = tokens.filter(t => t.type === 'letter').map(t => t.text);
        const shuffled = [...lettersToType];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        let completed = false;
        let started = false;

        function createWordGroup() {
            const group = document.createElement('div');
            group.className = 'word-group';
            group.style.display = 'flex';
            group.style.flexWrap = 'wrap';
            group.style.justifyContent = 'center';
            group.style.gap = '10px';
            return group;
        }

        function disableBuilder() {
            completed = true;
            Array.from(target.querySelectorAll('.letter-btn')).forEach(button => {
                button.classList.add('disabled');
                button.disabled = true;
            });
            Array.from(pool.querySelectorAll('.letter-btn')).forEach(button => {
                button.classList.add('disabled');
                button.disabled = true;
            });
        }

        function checkAnswer() {
            if (completed || pool.children.length !== 0) return;
            const slots = Array.from(target.querySelectorAll('.letter-slot'));
            const incorrectSlots = slots.filter(slot => {
                const button = slot.firstElementChild;
                return !button || button.dataset.char.toLocaleLowerCase() !== slot.dataset.expectedChar.toLocaleLowerCase();
            });

            if (incorrectSlots.length === 0) {
                disableBuilder();
                onCorrect();
                return;
            }

            if (onIncorrect() === true) {
                disableBuilder();
                return;
            }
            incorrectSlots.forEach(slot => {
                const button = slot.firstElementChild;
                if (!button) return;
                button.classList.add('wrong-anim');
                setTimeout(() => {
                    button.classList.remove('wrong-anim');
                    slot.dataset.filled = 'false';
                    pool.appendChild(button);
                }, 400);
            });
        }

        let currentWordGroup = createWordGroup();

        tokens.forEach((token) => {
            const el = document.createElement('div');
            let isWordBoundary = false;

            if (token.type === 'fixed') {
                el.className = 'fixed-token';
                if (token.text === ' ') {
                    el.classList.add('space-token');
                    isWordBoundary = true;
                } else if (token.text === '/' || token.text === '|') {
                    el.textContent = token.text;
                    isWordBoundary = true;
                } else {
                    el.textContent = token.text;
                }
            } else {
                el.className = 'letter-slot';
                el.dataset.expectedChar = token.text;
                el.dataset.filled = 'false';
            }

            if (isWordBoundary) {
                if (currentWordGroup.children.length > 0) {
                    target.appendChild(currentWordGroup);
                }
                target.appendChild(el);
                currentWordGroup = createWordGroup();
            } else {
                currentWordGroup.appendChild(el);
            }
        });

        if (currentWordGroup.children.length > 0) {
            target.appendChild(currentWordGroup);
        }

        shuffled.forEach((char) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'letter-btn';
            btn.textContent = char;
            btn.dataset.char = char;
            btn.setAttribute('aria-label', `Buchstabe ${char}`);

            btn.addEventListener('click', () => {
                if (!canInteract() || completed || btn.classList.contains('disabled')) return;
                if (btn.parentElement === pool) {
                    const firstEmptySlot = target.querySelector('.letter-slot[data-filled="false"]');
                    if (firstEmptySlot) {
                        if (!started) {
                            started = true;
                            if (typeof onStart === 'function') onStart();
                        }
                        firstEmptySlot.dataset.filled = 'true';
                        firstEmptySlot.appendChild(btn);
                        checkAnswer();
                    }
                } else {
                    const slot = btn.parentElement;
                    if (slot.classList.contains('letter-slot')) {
                        slot.dataset.filled = 'false';
                    }
                    pool.appendChild(btn);
                }
            });
            pool.appendChild(btn);
        });
    }

    function generateWritingUI(vocab) {
        const pool = document.getElementById('writing-pool');
        const target = document.getElementById('writing-target');
        renderLetterBuilder({
            pool,
            target,
            answer: getPlayableAnswer(state.currentWord.a),
            canInteract: () => !state.zombieDead,
            onCorrect: () => {
                const dummyBtn = document.createElement('button');
                handleAnswer(state.currentWord.a, dummyBtn);
            },
            onIncorrect: () => {
                const dummyBtn = document.createElement('button');
                handleAnswer('wrong-answer-trigger', dummyBtn);
                return state.wrongAttemptsForCurrentWord >= 3;
            }
        });
    }

    function handleAnswer(selectedOption, btn) {
        if (state.zombieDead) return;
        state.totalAttempts++;
        const correct = selectedOption === state.currentWord.a;

        if (correct) {
            const recoveredCorrectionRetry = resolveCurrentCorrectionRetry();
            let newlySecuredMissionTarget = false;
            if (isMissionMode()) {
                newlySecuredMissionTarget = !state.mission.securedIds.has(state.currentWord.vocab.id);
                state.mission.securedIds.add(state.currentWord.vocab.id);
                // Keep the projectile, hit and solution sequence unobstructed.
                // The next encounter announces the new phase only after the
                // defeated zombie's complete feedback has finished.
                updateMissionHUD(true);
            }

            // GAMIFICATION: Add XP and Update SRS
            if (isMissionMode()) state.mission.answerXp += 10;
            addXP(10);
            playerProfile.stats.totalZombies++;
            if (state.currentMode === 'de-foreign-write') playerProfile.stats.writeModeCorrect++;
            const srsRecord = getOrCreateSrsRecord(state.currentWord.vocab);
            if (state.wrongAttemptsForCurrentWord === 0) srsRecord.timesCorrect++;
            srsRecord.lastSeen = Date.now();
            saveSRS(srsData);
            saveProfile(playerProfile);

            const allBtns = document.querySelectorAll('.option-btn');
            allBtns.forEach(b => b.disabled = true);
            // Wenn die Vokabel mehrmals im Pool ist, ein Exemplar entfernen (bis auf 1)
            let occurrences = 0;
            let lastIndex = -1;
            for (let i = 0; i < state.vocabPool.length; i++) {
                if (state.vocabPool[i] === state.currentWord.vocab) {
                    occurrences++;
                    lastIndex = i;
                }
            }
            if (occurrences > 1 && lastIndex > -1) {
                state.vocabPool.splice(lastIndex, 1);
            }

            state.correctAttempts++;
            state.streak++;
            state.correctSinceLastRegen++;
            
            if (state.streak > state.maxStreak) {
                state.maxStreak = state.streak;
            }
            
            if (state.streak >= 3) {
                state.level = Math.min(5, state.level + 1); // Level Up! Max Level 5
                // Streak wird nicht mehr resettet, da wir ihn für Herzen und Optionen brauchen
            }
            
            // Ein Herz wird aufgefüllt und animiert, wenn man N Vokabeln in Folge fehlerfrei gelöst hat
            if (state.streak > 0 && state.streak % CONFIG.streakForHeart === 0) {
                if (state.hearts < 3) {
                    state.hearts++;
                    updateHeartsUI();
                    showStreakAnimation(state.streak);
                }
            }

            const poolSize = state.vocabPool.length;
            const points = Math.floor(10 + (state.streak * (poolSize / 100)));
            state.score += points;
            scoreEl.textContent = state.score;
            btn.classList.add('correct');
            
            // Score-Popup anzeigen
            showScorePopup(points, state.zombiePosition + 50, 250);
            
            // Leichter Screen-Shake bei Treffer
            triggerScreenShake('light');
            
            updateBoostUI();
            
            playShootSound();
            triggerHunterShootAnimation();
            
            // Laser/Schuss abfeuern
            projectile.className = 'proj-' + state.hunterType;

            const hunterConfig = HUNTER_SPRITES[state.hunterType] || HUNTER_SPRITES['laser'];
            const startX = hunterConfig.startX || 430;
            projectile.style.left = startX + 'px';
            projectile.style.width = '0px';

            // Mündungshöhe exakt nach Vorgabe berechnen (1024-px Quellhöhe auf aktuelle Hunter-Höhe skaliert)
            const hunterVisualHeight = (hunterSpriteCanvas && hunterSpriteCanvas.style.display !== 'none')
                ? hunterSpriteCanvas.offsetHeight
                : (hunterEl.offsetHeight || 360);
            const muzzleBottom = 140 + ((1024 - hunterConfig.muzzleY) / 1024) * hunterVisualHeight;
            projectile.style.bottom = muzzleBottom + 'px';
            
            // Zielpunkt auf dem Zombie (Brustbereich bei ~55% Höhe vom Boden mit dezentem Jitter)
            const zombieVisualHeight = (state.bossActive && zombieSpriteCanvas && zombieSpriteCanvas.style.display !== 'none') 
                ? zombieSpriteCanvas.offsetHeight 
                : (zombieImgEl.offsetHeight || 360);
            const targetBottom = 140 + (zombieVisualHeight * 0.55) + ((Math.random() - 0.5) * 20);
            
            // Zielpunkt 20% links von der horizontalen Mitte des Zombies (bei 30% der Breite)
            const targetX = state.zombiePosition + (zombieEl.offsetWidth * 0.3);
            const distanceX = Math.max(10, targetX - startX);
            const deltaY = targetBottom - muzzleBottom; // Positiv = Ziel ist höher als Mündung

            // Winkel berechnen und strikt auf [-10°, +10°] begrenzen (verhindert Schüsse in Boden oder Himmel)
            const rawAngleDeg = Math.atan2(-deltaY, distanceX) * (180 / Math.PI);
            const maxAngle = 10;
            const clampedAngle = Math.max(-maxAngle, Math.min(maxAngle, rawAngleDeg));
            projectile.style.rotate = clampedAngle + 'deg';
            
            const shootDistance = Math.sqrt(distanceX * distanceX + deltaY * deltaY);
            
            state.zombieDead = true; // Stop zombie immediately

            // Strahl schnell ausfahren (~100ms) und ca. 900ms halten (synchron zur 1s Hunter-Sprite-Animation)
            setTimeout(() => {
                projectile.style.width = shootDistance + 'px';

                // Kontinuierliche Treffer-Partikel am Ziel während des anhaltenden Schusses
                const impactX = targetX;
                const impactY = zombieEl.offsetTop + (zombieVisualHeight * 0.45);
                spawnParticles(impactX, impactY, state.hunterType);
                const pTimer1 = setTimeout(() => spawnParticles(impactX, impactY, state.hunterType), 250);
                const pTimer2 = setTimeout(() => spawnParticles(impactX, impactY, state.hunterType), 500);
                const pTimer3 = setTimeout(() => spawnParticles(impactX, impactY, state.hunterType), 750);

                setTimeout(() => {
                    clearTimeout(pTimer1);
                    clearTimeout(pTimer2);
                    clearTimeout(pTimer3);
                    projectile.className = 'hidden';
                    const bossNeedsAnotherHit = state.bossActive && state.bossHealth > 1;
                    if (bossNeedsAnotherHit) {
                        state.bossHealth--;
                        zombieEl.classList.add('boss-hit');
                        setTimeout(() => zombieEl.classList.remove('boss-hit'), 100);
                        
                        const hps = document.querySelectorAll('.boss-hp');
                        if (hps[state.bossHealth]) {
                            hps[state.bossHealth].classList.add('lost');
                        }
                        
                        // Boss um halbe Strecke zurückwerfen, aber so, dass er noch gut sichtbar bleibt.
                        const maxRight = canvas.clientWidth - 150;
                        let targetPos = state.zombiePosition + (canvas.clientWidth / 2);
                        
                        // Wenn er schon weiter rechts als maxRight ist, werfen wir ihn nicht weiter zurück, 
                        // um ihn nicht aus dem Bild zu schieben.
                        const newPos = Math.min(Math.max(state.zombiePosition, maxRight), targetPos);
                        
                        state.zombiePosition = newPos;
                        
                        zombieEl.classList.add('knockback');
                        zombieEl.style.left = newPos + 'px';
                        
                        const hasNextBossWord = generateNewWordForBoss();
                        if (hasNextBossWord) {
                            setTimeout(() => {
                                zombieEl.classList.remove('knockback');
                                state.zombieDead = false;
                            }, 400);
                        }
                    } else {
                        if (state.bossActive) {
                            // Bonus score for defeating boss
                            const bossBonus = 50 * state.bossMaxHealth;
                            state.score += bossBonus;
                            scoreEl.textContent = state.score;
                            showScorePopup(bossBonus, state.zombiePosition, 200);
                        }
                        killZombie(recoveredCorrectionRetry);
                    }
                }, 900);
            }, 40);
            
        } else {
            // GAMIFICATION: Update SRS failed
            const srsRecord = getOrCreateSrsRecord(state.currentWord.vocab);
            srsRecord.timesFailed++;
            srsRecord.lastSeen = Date.now();
            saveSRS(srsData);

            btn.classList.add('wrong');
            btn.disabled = true;

            // Score sinkt bei falscher Antwort
            state.score = Math.max(0, state.score - 10);
            scoreEl.textContent = state.score;
            
            state.wrongAttemptsForCurrentWord++;
            let appliedSpeedPenalty = 3;
            if (state.wrongAttemptsForCurrentWord >= 3) {
                state.zombieSpeed = 40; // Blitzschnell
                appliedSpeedPenalty = 40;
                // Alle Buttons deaktivieren, damit der Zombie den Jäger sicher schnappt
                const buttons = document.querySelectorAll('.option-btn');
                buttons.forEach(b => b.disabled = true);
            } else {
                state.zombieSpeed += 3.0; // Deutlich schneller werden
            }
            zombieImgEl.style.animationDuration = `${Math.max(0.2, 1.5 / Math.max(0.6, state.zombieSpeed || 1.0))}s`;

            state.streak = 0;
            updateBoostUI();
            state.level = Math.max(1, state.level - 1); // Level Down!
            
            recordWeakness(state.currentWord.q, state.currentWord.a, state.currentWord.vocab);
            if (isMissionMode()) beginCorrectionConfirmation(appliedSpeedPenalty);
        }
    }

    function killZombie(holdResolvedBanner = false) {
        zombieEl.classList.remove('walking');
        zombieEl.classList.add('dead');
        
        spawnParticles(state.zombiePosition + (zombieEl.offsetWidth / 2), zombieEl.offsetTop + (zombieEl.offsetHeight / 2), state.hunterType);
        
        setTimeout(() => {
            showSolutionDialog(spawnZombie);
        }, holdResolvedBanner ? 1500 : 600);
    }

    function showSolutionDialog(onClose) {
        state.onDialogClose = onClose || spawnZombie;

        const dialog = document.getElementById('solution-dialog');
        const enEl = document.getElementById('solution-en');
        const deEl = document.getElementById('solution-de');
        
        enEl.textContent = getForeign(state.currentWord.vocab);
        deEl.textContent = getGerman(state.currentWord.vocab);
        
        dialog.classList.remove('hidden');
        
        const audioPath = getVocabularyAudioPath(state.currentWord.vocab);
        const audio = audioPath ? new Audio(audioPath) : null;
        
        let dialogClosed = false;
        let fallbackTimer = null;

        const safeClose = () => {
            if (!dialogClosed) {
                dialogClosed = true;
                if (fallbackTimer) clearTimeout(fallbackTimer);
                if (audio) {
                    audio.pause();
                    audio.currentTime = 0;
                }
                closeSolutionDialog();
            }
        };
        
        if (audio) {
            duckAmbientAudio(true, 150);
            const wrappedSafeClose = () => {
                duckAmbientAudio(false, 350);
                safeClose();
            };
            audio.onended = wrappedSafeClose;
            audio.onerror = wrappedSafeClose;
            audio.play().catch(err => {
                console.log("Audio playback failed or file not found:", err);
                setTimeout(wrappedSafeClose, 900);
            });
            fallbackTimer = setTimeout(wrappedSafeClose, 20000);
        } else {
            setTimeout(safeClose, 900);
        }
    }

    function closeSolutionDialog() {
        const dialog = document.getElementById('solution-dialog');
        dialog.classList.add('hidden');
        if (state.onDialogClose) {
            state.onDialogClose();
        } else {
            spawnZombie();
        }
    }

    function takeDamage() {
        if (state.zombieDead) return;
        state.zombieDead = true;

        playHitSound();
        state.totalAttempts++; // Zählt als falscher Versuch, wenn der Zombie einen erreicht
        recordWeakness(state.currentWord.q, state.currentWord.a, state.currentWord.vocab); // Unbeantwortetes Wort als Schwäche erfassen!
        state.streak = 0;
        updateBoostUI();
        state.level = Math.max(1, state.level - 1);
        
        const previousHearts = state.hearts;
        state.hearts = Math.max(0, state.hearts - 1);
        updateHeartsUI();
        
        // Schwerer Screen-Shake bei Schaden
        triggerScreenShake('heavy');
        
        hunterContainer.classList.add('wrong');
        setTimeout(() => hunterContainer.classList.remove('wrong'), 400);

        if (isMissionMode() && previousHearts === 0) {
            state.mission.failed = true;
            state.mission.completed = false;
            state.mission.endReason = 'defeated';
            state.gameRunning = false;
            cancelAnimationFrame(animationId);
            playUIAudio('mission_fail_retreat.mp3');
            setTimeout(endGame, 900);
            return;
        }

        if (isMissionMode()) {
            beginCorrectionConfirmation();
            return;
        }
        
        zombieEl.classList.add('hidden'); // Zombie während Dialog ausblenden

        const afterDialog = () => {
            zombieEl.classList.remove('hidden');
            if (!isMissionMode() && state.hearts <= 0) {
                endGame();
            } else {
                spawnZombie();
            }
        };

        showSolutionDialog(afterDialog);
    }

    function updateHeartsUI() {
        hearts.forEach((h, i) => {
            if (i < state.hearts) {
                h.classList.remove('lost');
            } else {
                h.classList.add('lost');
            }
        });
        updateVignetteUI();
        if (state.hearts === 1 && state.gameRunning && screens.game?.classList.contains('active')) {
            startCriticalHealthAudio();
        } else {
            stopCriticalHealthAudio(400);
        }
    }

    // Zombie Sprite Sheet: Einzelnen Frame auf Canvas zeichnen
    function renderZombieSpriteFrame() {
        if (!zombieSpriteCtx || !activeZombieSprite || !activeZombieSprite.img.complete) return;
        const sprite = activeZombieSprite;
        const frameW = sprite.img.width / sprite.cols;
        const frameH = sprite.img.height / sprite.rows;
        const srcX = (zombieCurrentFrame % sprite.cols) * frameW;
        const srcY = Math.floor(zombieCurrentFrame / sprite.cols) * frameH;

        zombieSpriteCanvas.width = frameW;
        zombieSpriteCanvas.height = frameH;
        zombieSpriteCtx.clearRect(0, 0, frameW, frameH);
        zombieSpriteCtx.drawImage(sprite.img, srcX, srcY, frameW, frameH, 0, 0, frameW, frameH);
    }

    function gameLoop(timestamp) {
        if (!state.gameRunning) return;

        const delta = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        if (isMissionMode() && state.mission.transitionActive) {
            animationId = requestAnimationFrame(gameLoop);
            return;
        }

        if (!state.zombieDead) {
            const frameSpeed = state.zombieSpeed * (delta / 16.66);
            state.zombiePosition -= frameSpeed;
        }
        
        // Zombie Sprite Sheet Animation: Frame dynamisch anhand der Laufgeschwindigkeit weiterschalten
        if (activeZombieSprite && zombieSpriteCanvas && zombieSpriteCanvas.style.display !== 'none') {
            const baseFps = activeZombieSprite.fps || 8;
            const speedFactor = Math.max(0.6, (state.zombieSpeed || 1.0) / 1.0);
            const dynamicFps = Math.min(28, baseFps * speedFactor);
            const frameDuration = 1000 / dynamicFps;
            if (timestamp - zombieLastFrameTime >= frameDuration) {
                zombieCurrentFrame = (zombieCurrentFrame + 1) % activeZombieSprite.frameCount;
                renderZombieSpriteFrame();
                zombieLastFrameTime = timestamp;
            }
        }

        // Hunter Sprite Sheet Animation: Schuss- und Rückstoß-Animation bei 24 fps abspielen
        if (hunterAnimationActive && hunterSpriteCanvas && hunterSpriteCanvas.style.display !== 'none') {
            const hunterSprite = HUNTER_SPRITES[state.hunterType] || HUNTER_SPRITES['laser'];
            const frameDuration = 1000 / (hunterSprite.fps || 24);
            if (timestamp - hunterLastFrameTime >= frameDuration) {
                hunterLastFrameTime = timestamp;
                hunterCurrentFrame++;
                if (hunterCurrentFrame >= hunterSprite.frameCount) {
                    hunterAnimationActive = false;
                    hunterSpriteCanvas.style.display = 'none';
                    hunterEl.style.display = '';
                } else {
                    renderHunterSpriteFrame(hunterSprite);
                }
            }
        }
        
        // Parallax Scroll
        if (CONFIG.enableParallax) {
            const bgPos = (timestamp * 0.02) % 2000;
            document.body.style.backgroundPositionX = `-${bgPos}px`;
        }
        
        updateParticles();
        
        if (state.zombiePosition <= 200 && !state.zombieDead) { 
            takeDamage();
        } else {
            zombieEl.style.left = state.zombiePosition + 'px';
            
            // Fade-in effect over the first 450 pixels
            const fadeDistance = 450;
            const startX = canvas.clientWidth;
            if (state.zombiePosition > startX - fadeDistance) {
                const opacity = (startX - state.zombiePosition) / fadeDistance;
                zombieEl.style.opacity = opacity;
            } else {
                zombieEl.style.opacity = 1;
            }
        }

        animationId = requestAnimationFrame(gameLoop);
    }

    function endGame() {
        state.gameRunning = false;
        cancelAnimationFrame(animationId);
        clearTimeout(state.correction.confirmationTimer);
        stopCorrectionAudio();
        stopCriticalHealthAudio(250);
        state.correction.activeEntry = null;
        correctionPanel?.classList.add('hidden');
        markedRetryBanner?.classList.add('hidden');
        screens.game.classList.remove('correction-active');
        zombieEl.classList.remove('marked-zombie', 'marked-fleeing', 'marked-rescued');
        
        // GAMIFICATION: Update stats & check achievements
        playerProfile.stats.totalRounds++;
        if (!playerProfile.stats.citiesPlayed.includes(state.city)) {
            playerProfile.stats.citiesPlayed.push(state.city);
        }
        if (!playerProfile.stats.huntersUsed.includes(state.hunterType)) {
            playerProfile.stats.huntersUsed.push(state.hunterType);
        }
        
        // Vignette entfernen
        const vignetteOverlay = document.getElementById('vignette-overlay');
        if (vignetteOverlay) vignetteOverlay.className = '';
        
        const accuracy = state.totalAttempts > 0 ? Math.round((state.correctAttempts / state.totalAttempts) * 100) : 0;
        const totalTimeSeconds = (Date.now() - state.startTime) / 1000;
        const timePerWord = state.totalAttempts > 0 ? (totalTimeSeconds / state.totalAttempts).toFixed(1) : 0;
        const avgTimeMs = state.totalAttempts > 0 ? (totalTimeSeconds * 1000) / state.totalAttempts : 0;
        const missionReward = isMissionMode() ? finalizeMissionReward() : null;

        const missionResult = document.getElementById('mission-result');
        const missionProgression = document.getElementById('mission-progression');
        const endScreenTitle = document.getElementById('end-screen-title');
        const endScreen = document.getElementById('end-screen');
        const changeMissionSettingsBtn = document.getElementById('change-mission-settings-btn');
        endScreen?.classList.toggle('mission-summary-mode', isMissionMode());
        if (isMissionMode()) {
            const securedCount = state.mission.securedIds.size;
            const targetCount = state.mission.targetWords.length;
            const missionPercentage = targetCount > 0 ? Math.min(100, (securedCount / targetCount) * 100) : 0;
            const medal = state.mission.failed ? '❌' : ({ gold: '🥇', silver: '🥈', bronze: '🥉' }[missionReward.medal] || '🥉');
            if (endScreenTitle) endScreenTitle.textContent = state.mission.failed
                ? 'Mission Gescheitert!'
                : (state.mission.completed ? 'Mission erfüllt!' : 'Extraktion erreicht!');
            missionResult?.classList.remove('hidden');
            missionResult?.classList.toggle('failed', state.mission.failed);
            missionResult?.classList.toggle('incomplete', !state.mission.completed && !state.mission.failed);
            document.getElementById('mission-medal').textContent = medal;
            document.getElementById('mission-result-title').textContent = state.mission.failed
                ? 'Rettungsteam evakuiert'
                : (state.mission.completed ? 'Operation Morgenrot abgeschlossen' : 'Ziel fast erreicht – Wörter vorgemerkt');
            document.getElementById('mission-result-summary').textContent = state.mission.failed
                ? `${securedCount} von ${targetCount} Zielwörtern gesichert · Alle Herzen verloren`
                : (state.mission.completed
                    ? `${securedCount} von ${targetCount} Zielwörtern gesichert · ${state.mission.encounters} Begegnungen`
                    : `${securedCount} von ${targetCount} Zielwörtern gesichert · Extraktion nach ${state.mission.encounters} Begegnungen`);
            document.getElementById('mission-result-progress').style.width = `${missionPercentage}%`;
            restartBtn.textContent = state.mission.failed ? 'Erneut versuchen' : 'Zum nächsten HALO-Sprung';
            changeMissionSettingsBtn?.classList.add('hidden');
        } else {
            if (endScreenTitle) endScreenTitle.textContent = 'Jagd beendet!';
            missionResult?.classList.add('hidden');
            missionResult?.classList.remove('incomplete', 'failed');
            missionProgression?.classList.add('hidden');
            restartBtn.textContent = 'Neue Jagd';
            changeMissionSettingsBtn?.classList.add('hidden');
        }

        const newlyUnlocked = checkAchievements({
            totalWords: state.totalAttempts,
            correctWords: state.correctAttempts,
            avgTime: avgTimeMs
        });
        if (missionReward) prepareMissionProgression(missionReward, newlyUnlocked);
        saveProfile(playerProfile);

        if (showLeaderboardBtn) {
            showLeaderboardBtn.style.display = isMissionMode() ? 'none' : 'inline-block';
        }

        // Animated Score Counter (statt sofortige Anzeige)
        const scoreEl2 = document.getElementById('stat-final-score');
        scoreEl2.textContent = '0';
        
        // Rang berechnen und anzeigen
        const rankInfo = calculateRank(accuracy);
        const rankBadge = document.getElementById('rank-badge');
        const rankLabel = document.getElementById('rank-label');
        if (rankBadge) {
            rankBadge.className = 'rank-badge ' + rankInfo.css;
            rankBadge.textContent = rankInfo.rank;
            // Retrigger animation
            rankBadge.style.animation = 'none';
            void rankBadge.offsetWidth;
            rankBadge.style.animation = '';
        }
        if (rankLabel) {
            rankLabel.textContent = rankInfo.label;
        }
        
        // Persönliche Bestleistungen prüfen
        const isNewRecord = checkAndUpdatePersonalBests(state.score, state.maxStreak, accuracy);
        const newRecordEl = document.getElementById('new-record-indicator');
        if (newRecordEl) {
            if (isNewRecord) {
                newRecordEl.classList.remove('hidden');
            } else {
                newRecordEl.classList.add('hidden');
            }
        }

        document.getElementById('stat-max-streak-text').textContent = state.maxStreak;

        document.getElementById('stat-accuracy-text').textContent = accuracy + '%';
        const pieChart = document.getElementById('accuracy-pie');
        pieChart.style.background = `conic-gradient(var(--accent-color) ${accuracy}%, rgba(255,255,255,0.1) ${accuracy}%)`;

        document.getElementById('stat-time-text').textContent = timePerWord + 's / Wort';
        const timeHand = document.getElementById('time-hand');
        
        // Reset position first
        timeHand.style.transform = `translateX(-50%) rotate(0deg)`;
        
        // 20 seconds = 360 degrees -> 1 second = 18 degrees.
        const degrees = Math.min(360, timePerWord * 18);
        
        // Timeout to allow transition to play
        setTimeout(() => {
            timeHand.style.transform = `translateX(-50%) rotate(${degrees}deg)`;
        }, 50);

        const tbody = document.getElementById('stat-weaknesses-body');
        tbody.innerHTML = '';
        const sortedWeaknesses = Object.entries(state.weaknesses).sort((a,b) => b[1].count - a[1].count).slice(0, 5);
        
        if (sortedWeaknesses.length > 0) {
            sortedWeaknesses.forEach(([q, data]) => {
                const tr = document.createElement('tr');
                const u = data.vocab && data.vocab.unit ? data.vocab.unit : '-';
                const p = data.vocab && data.vocab.part ? data.vocab.part : '-';
                const s = data.vocab && data.vocab.page ? data.vocab.page : '-';
                tr.innerHTML = `<td>${q}</td><td>${data.a}</td><td>${u}</td><td>${p}</td><td>${s}</td><td>${data.count}x</td>`;
                tbody.appendChild(tr);
            });
        } else {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="6" style="text-align:center;">Perfekt! Keine Schwächen erkannt.</td>`;
            tbody.appendChild(tr);
        }

        showScreen('end');
        
        // Score-Animation nach Screen-Transition starten
        setTimeout(() => {
            animateScoreCounter(state.score, scoreEl2);
            if (missionReward) animateMissionProgression(missionReward);
        }, 300);
    }


    // Resize Logic
    function resizeApp() {
        const app = document.getElementById('app-container');
        // Logische Auflösung: 1920x1200 (16:10)
        const scaleX = window.innerWidth / 1920;
        const scaleY = window.innerHeight / 1200;
        const scale = Math.min(scaleX, scaleY);
        app.style.transform = `scale(${scale})`;
    }

    window.addEventListener('resize', resizeApp);
    resizeApp(); // Initiale Skalierung

    function updateBoostUI() {
        const boostBar = document.getElementById('streak-boost-bar');
        const proj = document.getElementById('projectile');
        const container = document.getElementById('streak-boost-container');
        if (!boostBar || !proj || !container) return;
        
        const maxStreak = 50;
        const currentBoost = Math.min(maxStreak, state.streak);
        const percentage = (currentBoost / maxStreak) * 100;
        
        boostBar.style.height = percentage + '%';
        
        const boostFactor = 1 + (currentBoost / maxStreak) * 2; 
        const baseHeights = {
            'water': 18,
            'fire': 22,
            'lightning': 12,
            'laser': 10,
            'fuchsia': 16,
            'pink': 18
        };
        const baseHeight = baseHeights[state.hunterType] || 10;
        proj.style.setProperty('--boost-height', (baseHeight * boostFactor) + 'px');
        proj.style.setProperty('--boost-glow', (16 * boostFactor) + 'px');

        const colors = {
            'lightning': { color: '#ffff00', glow: 'rgba(255, 255, 0, 0.6)' },
            'fire': { color: '#ff3300', glow: 'rgba(255, 51, 0, 0.6)' },
            'water': { color: '#00d2ff', glow: 'rgba(0, 210, 255, 0.6)' },
            'laser': { color: '#00ffff', glow: 'rgba(0, 255, 255, 0.6)' },
            'fuchsia': { color: '#ff00ea', glow: 'rgba(255, 0, 234, 0.6)' },
            'pink': { color: '#ff1493', glow: 'rgba(255, 20, 147, 0.6)' }
        };
        const theme = colors[state.hunterType] || colors['laser'];
        container.style.setProperty('--boost-border-color', theme.color);
        container.style.setProperty('--boost-border-glow', theme.glow);
    }

    function showStreakAnimation(streak) {
        let animEl = document.getElementById('streak-animation');
        if (!animEl) {
            animEl = document.createElement('div');
            animEl.id = 'streak-animation';
            document.getElementById('game-screen').appendChild(animEl);
        }
        
        animEl.classList.remove('animate');
        void animEl.offsetWidth; // Trigger reflow
        
        animEl.innerHTML = `❤️ +1 <br> <span style="font-size: 0.8em">${streak}x STREAK!</span>`;
        animEl.classList.add('streak-anim', 'animate');
    }
    // ========== PARTICLE SYSTEM ==========
    const fxCanvas = document.getElementById('fx-canvas');
    const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
    let particles = [];

    window.addEventListener('resize', () => {
        if (fxCanvas) {
            fxCanvas.width = fxCanvas.offsetWidth;
            fxCanvas.height = fxCanvas.offsetHeight;
        }
    });
    if (fxCanvas) {
        fxCanvas.width = fxCanvas.offsetWidth;
        fxCanvas.height = fxCanvas.offsetHeight;
    }

    function spawnParticles(x, y, element) {
        if (!fxCanvas || !fxCtx) return;
        const count = 45;
        const colorPalettes = {
            'laser': ['#00ffff', '#80ffff', '#ffffff', '#00aaff'],
            'water': ['#00d2ff', '#0077b6', '#caf0f8', '#ffffff'],
            'fire': ['#ff3300', '#ff9900', '#ffcc00', '#ffffff'],
            'lightning': ['#ffff00', '#ffff99', '#ffffff', '#ffaa00'],
            'fuchsia': ['#ff00ea', '#d500f9', '#ffffff', '#aa00ff'],
            'pink': ['#ff1493', '#ff69b4', '#ffd1dc', '#ffffff']
        };
        const palette = colorPalettes[element] || colorPalettes['laser'];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 9 + 2;
            const chosenColor = palette[Math.floor(Math.random() * palette.length)];
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + (element === 'fire' ? -4 : 0),
                life: 1.0,
                decay: Math.random() * 0.025 + 0.015,
                color: chosenColor,
                size: Math.random() * 5 + 2,
                element: element
            });
        }
    }

    function updateParticles() {
        if (!fxCanvas || !fxCtx) return;
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            
            if (p.element === 'water' || p.element === 'pink') p.vy += 0.3; // gravity
            if (p.element === 'fire') p.vy -= 0.18; // rising heat/embers

            if (p.life <= 0) {
                particles.splice(i, 1);
            } else {
                fxCtx.globalAlpha = p.life;
                fxCtx.fillStyle = p.color;
                if (p.element === 'lightning') {
                    fxCtx.fillRect(p.x, p.y, p.size * 0.8, p.size * 2.2);
                } else if (p.element === 'laser') {
                    fxCtx.fillRect(p.x, p.y, p.size * 1.8, p.size * 0.8);
                } else {
                    fxCtx.beginPath();
                    fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    fxCtx.fill();
                }
            }
        }
        fxCtx.globalAlpha = 1.0;
    }
});
