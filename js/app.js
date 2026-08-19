document.addEventListener('DOMContentLoaded', () => {
    // Game Config
    const CONFIG = {
        maxVocabsForMaxSpeed: 100,
        minZombieDuration: 2.0,
        maxZombieDuration: 15.0,
        streakForExtraOption: 3,
        streakForHeart: 10,
        missionTargetSize: 12,
        missionNewWordLimit: 6,
        missionMaxEncounters: 20,
        missionBossWordCount: 3,
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
        playStyle: 'mission',
        mission: {
            targetWords: [],
            securedIds: new Set(),
            encounters: 0,
            lastVocabId: '',
            completed: false,
            endReason: '',
            currentPhase: '',
            finishing: false
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

    function playUIAudio(filename) {
        if (currentUIAudio) {
            currentUIAudio.pause();
            currentUIAudio.currentTime = 0;
        }
        currentUIAudio = new Audio('assets/audio/ui/' + filename);
        currentUIAudio.play().catch(e => console.log('UI audio playback failed:', e));
    }

    function stopUIAudio() {
        if (currentUIAudio) {
            currentUIAudio.pause();
            currentUIAudio.currentTime = 0;
            currentUIAudio = null;
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
        { id: 'ausdauernd', title: 'Ausdauernd', desc: '7 Tage in Folge gespielt', icon: '🗓️' }
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

    function loadProfile() {
        try {
            const data = localStorage.getItem(PROFILE_KEY);
            if (data) return JSON.parse(data);
        } catch (e) {
            console.warn('localStorage not available:', e);
        }
        return {
            xp: 0,
            dailyStreak: 0,
            lastPlayDate: null,
            achievements: [], // list of unlocked ids
            stats: {
                totalZombies: 0,
                citiesPlayed: [],
                huntersUsed: [],
                totalRounds: 0,
                writeModeCorrect: 0
            }
        };
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
        
        if (newlyUnlocked.length > 0) {
            playerProfile.achievements.push(...newlyUnlocked);
            saveProfile(playerProfile);
            // We could show a toast here, but we will just fire confetti on the end screen
            fireConfetti();
        }
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
        const hint = document.getElementById('course-selection-hint');
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

        const selected = window.getCourseById(pendingCourseId);
        if (hint) {
            hint.textContent = selected
                ? `Ausgewählt: ${window.getCourseLabel(selected)}`
                : 'Für diese Klasse ist noch kein Fach spielbereit.';
        }
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

    // Boss Sprite Sheet Animation
    const zombieSpriteCanvas = document.getElementById('zombie-sprite-canvas');
    const zombieSpriteCtx = zombieSpriteCanvas ? zombieSpriteCanvas.getContext('2d') : null;
    const bossSheetImg = new Image();
    bossSheetImg.src = 'assets/zombie10_sheet.png';
    const BOSS_SHEET_COLS = 6;
    const BOSS_SHEET_ROWS = 11;
    const BOSS_FRAME_COUNT = 64; // 6x11=66 tiles, but only 64 actual frames
    const BOSS_FPS = 8;
    let bossCurrentFrame = 0;
    let bossLastFrameTime = 0;

    const HUNTERS = [
        { id: 'laser', name: 'Commander Neon', desc: 'Meister der Laser-Waffen.', img: 'assets/hunter_commanderneon.png', element: 'laser' },
        { id: 'water', name: 'Hydro Striker', desc: 'Spezialist für Wasser-Angriffe.', img: 'assets/hunter_water.png', element: 'water' },
        { id: 'fire', name: 'Pyro Blaze', desc: 'Entfesselt die Kraft des Feuers.', img: 'assets/hunter_pyroblaze.png', element: 'fire' },
        { id: 'lightning', name: 'Volt Master', desc: 'Elektrisiert die Untoten.', img: 'assets/hunter_voltmaster.png', element: 'lightning' },
        { id: 'fuchsia', name: 'Fuchsia', desc: 'Meisterin der arkanen Künste.', img: 'assets/hunter_fuchsia.png', element: 'fuchsia' },
        { id: 'pink', name: 'Pinky Pump', desc: 'Mit der Pumpgun auf Zombiejagd.', img: 'assets/hunter_pinkypump.png', element: 'pink' }
    ];

    const CITIES = [
        { id: 'london', name: 'London', img: 'assets/background_london.png' },
        { id: 'brighton', name: 'Brighton', img: 'assets/background_brighton.png' },
        { id: 'buehl', name: 'Bühl', img: 'assets/background_buehl.png' },
        { id: 'capetown', name: 'Cape Town', img: 'assets/background_capetown.png' },
        { id: 'istanbul', name: 'Istanbul', img: 'assets/background_istanbul.png' },
        { id: 'rio', name: 'Rio', img: 'assets/background_rio.png' },
        { id: 'sf', name: 'San Francisco', img: 'assets/background_sf.png' }
    ];

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
    try {
        const preferredPlayStyle = localStorage.getItem('vokabelzombie_last_play_style');
        if (preferredPlayStyle === 'mission' || preferredPlayStyle === 'hunt') {
            state.playStyle = preferredPlayStyle;
        }
    } catch (error) {}
    initCarousel();
    initCityCarousel();
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', () => {
        if (state.playStyle === 'mission') {
            startGame();
        } else {
            showHunterScreen();
        }
    });

    document.getElementById('back-to-hunter-from-city-btn').addEventListener('click', showHunterScreen);
    document.getElementById('confirm-hunter-btn').addEventListener('click', () => {
        const isFemale = state.hunterType === 'fuchsia' || state.hunterType === 'pink';
        const phraseIndex = Math.floor(Math.random() * 5);
        if (isFemale) {
            playUIAudio(`hunter_female_${phraseIndex}.mp3`);
        } else {
            playUIAudio(`hunter_male_${phraseIndex}.mp3`);
        }
        showCityScreen();
    });
    document.getElementById('back-to-city-from-mission-btn').addEventListener('click', showCityScreen);
    document.getElementById('back-to-mission-btn').addEventListener('click', showMissionSelectionScreen);
    document.getElementById('change-play-style-btn').addEventListener('click', showMissionSelectionScreen);
    document.getElementById('change-mission-settings-btn').addEventListener('click', showStartScreen);
    document.getElementById('confirm-city-btn').addEventListener('click', () => {
        const phraseIndex = Math.floor(Math.random() * 5);
        playUIAudio(`city_select_${phraseIndex}.mp3`);
        showMissionSelectionScreen();
    });

    document.querySelectorAll('.play-style-card').forEach(button => {
        button.addEventListener('click', () => selectPlayStyle(button.dataset.playStyle));
    });
    document.getElementById('confirm-play-style-btn').addEventListener('click', showStartScreen);

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
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
        document.body.classList.toggle('game-active', screenName === 'game');
        if (screenName !== 'game') {
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
            Math.max(1, state.mission.targetWords.length - 4)
        );
    }

    function getMissionPhase() {
        const securedCount = state.mission.securedIds.size;
        const remainingCount = getMissionRemainingCount();
        if (state.mission.completed || remainingCount === 0) return 'extract';
        if (state.bossActive || remainingCount <= getMissionBossTargetCount()) return 'boss';
        if (securedCount < 3) return 'scout';
        return 'attack';
    }

    function showMissionPhaseTransition(phase) {
        const overlay = document.getElementById('mission-phase-overlay');
        if (!overlay) return;
        const presentations = {
            scout: {
                icon: '📡',
                kicker: 'Phase 1 · Aufklärung',
                title: 'Gebiet scannen',
                detail: 'Drei ruhige Ziele. Präge dir jedes Wort ein.'
            },
            attack: {
                icon: '🧟',
                kicker: 'Phase 2 · Angriffswelle',
                title: 'Die Horde ist da!',
                detail: 'Das Tempo steigt. Halte die Linie und sichere das Gebiet.'
            },
            boss: {
                icon: '👑',
                kicker: 'Phase 3 · Bossalarm',
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
        missionPhaseTransitionTimer = setTimeout(() => overlay.classList.add('hidden'), 2350);
    }

    function updateMissionHUD() {
        const hud = document.getElementById('mission-hud');
        if (!hud) return;
        hud.classList.toggle('hidden', !isMissionMode());
        const phaseClasses = ['mission-phase-scout', 'mission-phase-attack', 'mission-phase-boss', 'mission-phase-extract'];
        if (!isMissionMode()) {
            screens.game.classList.remove(...phaseClasses);
            document.getElementById('mission-phase-overlay')?.classList.add('hidden');
            return;
        }

        const securedCount = state.mission.securedIds.size;
        const targetCount = state.mission.targetWords.length;
        const percentage = targetCount > 0 ? Math.min(100, (securedCount / targetCount) * 100) : 0;
        const phase = getMissionPhase();
        const phaseLabels = {
            scout: 'Aufklärung',
            attack: 'Angriffswelle',
            boss: 'Boss-Zone',
            extract: 'Extraktion'
        };
        const phaseOrder = ['scout', 'attack', 'boss', 'extract'];
        const activePhaseIndex = phaseOrder.indexOf(phase);

        const phaseLabel = document.getElementById('mission-phase-label');
        const objectiveLabel = document.getElementById('mission-objective-label');
        const encounterLabel = document.getElementById('mission-encounter-label');
        const progress = document.getElementById('mission-hud-progress');
        if (phaseLabel) phaseLabel.textContent = phaseLabels[phase];
        if (objectiveLabel) {
            objectiveLabel.textContent = `${securedCount} / ${targetCount} gesichert`;
        }
        if (encounterLabel) encounterLabel.textContent = `⚔ ${state.mission.encounters} / ${CONFIG.missionMaxEncounters}`;
        if (progress) progress.style.width = `${percentage}%`;

        screens.game.classList.remove(...phaseClasses);
        screens.game.classList.add(`mission-phase-${phase}`);
        if (state.mission.currentPhase !== phase) {
            state.mission.currentPhase = phase;
            showMissionPhaseTransition(phase);
        }

        document.querySelectorAll('[data-mission-phase]').forEach((step, index) => {
            step.classList.toggle('active', index === activePhaseIndex);
            step.classList.toggle('complete', index < activePhaseIndex);
        });
    }

    function registerMissionEncounter(vocab) {
        if (!isMissionMode() || !vocab) return;
        state.mission.encounters++;
        state.mission.lastVocabId = vocab.id;
        updateMissionHUD();
    }

    function finishMissionIfNeeded() {
        if (!isMissionMode()) return false;
        if (state.mission.finishing) return true;
        const objectiveReached = getMissionRemainingCount() === 0;
        const encounterLimitReached = state.mission.encounters >= CONFIG.missionMaxEncounters;
        if (!objectiveReached && !encounterLimitReached) return false;

        state.mission.completed = objectiveReached;
        state.mission.endReason = objectiveReached ? 'objective' : 'encounter-limit';
        state.mission.finishing = true;
        updateMissionHUD();
        showMissionPhaseTransition('extract');
        state.gameRunning = false;
        cancelAnimationFrame(animationId);
        setTimeout(endGame, 1400);
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

    function startGame() {
        if (activeVocabulary.length === 0) {
            alert('Vokabeln werden noch geladen oder sind nicht verfügbar... Bitte warte kurz und versuche es erneut.');
            return;
        }

        state.direction = document.getElementById('translation-direction').value;

        const selectedCheckboxes = Array.from(document.querySelectorAll('.filter-checkbox:checked'));
        const paths = selectedCheckboxes.map(cb => cb.value);
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
        if (isMissionMode()) {
            missionTargets = selectMissionTargets(state.vocabPool);
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
        state.gameRunning = true;
        state.totalAttempts = 0;
        state.correctAttempts = 0;
        state.weaknesses = {};
        state.startTime = Date.now();
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
        state.mission = {
            targetWords: missionTargets,
            securedIds: new Set(),
            encounters: 0,
            lastVocabId: '',
            completed: false,
            endReason: '',
            currentPhase: '',
            finishing: false
        };
        settingsBtn.classList.remove('pending');
        
        updateBoostUI();
        
        const selectedHunter = HUNTERS.find(h => h.id === state.hunterType) || HUNTERS[0];
        hunterEl.src = selectedHunter.img;
        
        const selectedCity = CITIES.find(c => c.id === state.city) || CITIES[0];
        document.body.style.backgroundImage = `url('${selectedCity.img}')`;

        // Initialize weather overlay
        const weatherOverlay = document.getElementById('weather-overlay');
        if (weatherOverlay) {
            weatherOverlay.className = '';
            // 40% chance of rain, but never in Bühl (indoors)
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

    function spawnZombie() {
        if (!state.gameRunning) return;
        
        if (state.settingsPending) {
            state.gameRunning = false;
            settingsDialog.classList.remove('hidden');
            settingsBtn.classList.remove('pending');
            return;
        }

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
                ? getMissionRemainingCount()
                : Math.floor(Math.random() * 2) + 2;
            state.bossMaxHealth = state.bossHealth;
            zombieEl.classList.add('boss');
            
            // Boss Sprite Sheet: Canvas zeigen, statisches Bild verstecken
            if (zombieSpriteCanvas && bossSheetImg.complete) {
                zombieImgEl.style.display = 'none';
                zombieSpriteCanvas.style.display = 'block';
                bossCurrentFrame = 0;
                bossLastFrameTime = 0;
                renderBossFrame(); // Ersten Frame sofort zeichnen
            } else {
                // Fallback: Statisches Bild verwenden, falls Sheet noch nicht geladen
                zombieImgEl.style.display = '';
                if (zombieSpriteCanvas) zombieSpriteCanvas.style.display = 'none';
            }
            
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
            
            // Normaler Zombie: Canvas verstecken, statisches Bild zeigen
            zombieImgEl.style.display = '';
            if (zombieSpriteCanvas) zombieSpriteCanvas.style.display = 'none';
        }

        const vocab = isMissionMode()
            ? window.VocabUtils.pickMissionVocabulary(
                state.mission.targetWords,
                state.mission.securedIds,
                state.mission.lastVocabId
            )
            : state.vocabPool[Math.floor(Math.random() * state.vocabPool.length)];
        if (!vocab) {
            if (isMissionMode()) finishMissionIfNeeded();
            return;
        }
        registerMissionEncounter(vocab);
        
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

        setZombieWord(state.currentWord.q);
        state.zombiePosition = canvas.clientWidth; 
        zombieEl.style.left = state.zombiePosition + 'px';
        zombieEl.style.opacity = '0';
        zombieEl.classList.add('walking');
        zombieEl.classList.remove('dead');
        
        if (CONFIG.bubbleOnLeft) {
            zombieEl.classList.add('bubble-left');
        } else {
            zombieEl.classList.remove('bubble-left');
        }
        
        if (state.bossActive) {
            // Boss nutzt Sprite Sheet Canvas – statisches Bild nur als Fallback setzen
            zombieImgEl.src = 'assets/zombie10.png';
        } else {
            zombieImgEl.src = zombieImages[Math.floor(Math.random() * zombieImages.length)];
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
        if (finishMissionIfNeeded()) return false;
        const vocab = isMissionMode()
            ? window.VocabUtils.pickMissionVocabulary(
                state.mission.targetWords,
                state.mission.securedIds,
                state.mission.lastVocabId
            )
            : state.vocabPool[Math.floor(Math.random() * state.vocabPool.length)];
        if (!vocab) return false;
        registerMissionEncounter(vocab);
        
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

    function generateWritingUI(vocab) {
        const pool = document.getElementById('writing-pool');
        const target = document.getElementById('writing-target');
        pool.innerHTML = '';
        target.innerHTML = '';

        let answer = state.currentWord.a;
        // Strip plural extensions like ", pl strawberries"
        answer = answer.replace(/,\s*pl[\s\S]*/i, '');
        
        const tokens = tokenizeAnswer(answer);
        
        const lettersToType = tokens.filter(t => t.type === 'letter').map(t => t.text);
        let shuffled = [...lettersToType].sort(() => Math.random() - 0.5);

        let currentWordGroup = document.createElement('div');
        currentWordGroup.className = 'word-group';
        currentWordGroup.style.display = 'flex';
        currentWordGroup.style.flexWrap = 'wrap';
        currentWordGroup.style.justifyContent = 'center';
        currentWordGroup.style.gap = '10px';

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
                
                currentWordGroup = document.createElement('div');
                currentWordGroup.className = 'word-group';
                currentWordGroup.style.display = 'flex';
                currentWordGroup.style.flexWrap = 'wrap';
                currentWordGroup.style.justifyContent = 'center';
                currentWordGroup.style.gap = '10px';
            } else {
                currentWordGroup.appendChild(el);
            }
        });

        if (currentWordGroup.children.length > 0) {
            target.appendChild(currentWordGroup);
        }

        shuffled.forEach((char) => {
            const btn = document.createElement('div');
            btn.className = 'letter-btn';
            btn.textContent = char;
            btn.dataset.char = char;
            
            btn.addEventListener('click', () => {
                if (state.zombieDead || btn.classList.contains('disabled')) return;
                
                if (btn.parentElement === pool) {
                    const firstEmptySlot = target.querySelector('.letter-slot[data-filled="false"]');
                    if (firstEmptySlot) {
                        firstEmptySlot.dataset.filled = 'true';
                        firstEmptySlot.appendChild(btn);
                        checkWritingAnswer();
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

    function checkWritingAnswer() {
        const pool = document.getElementById('writing-pool');
        const target = document.getElementById('writing-target');
        
        if (pool.children.length === 0) {
            let isCorrect = true;
            const slots = Array.from(target.querySelectorAll('.letter-slot'));
            
            slots.forEach(slot => {
                const btn = slot.firstChild;
                if (!btn || btn.dataset.char.toLowerCase() !== slot.dataset.expectedChar.toLowerCase()) {
                    isCorrect = false;
                }
            });
            
            const dummyBtn = document.createElement('button');
            
            if (isCorrect) {
                Array.from(target.querySelectorAll('.letter-btn')).forEach(btn => {
                    btn.classList.add('disabled');
                    btn.style.pointerEvents = 'none';
                });
                handleAnswer(state.currentWord.a, dummyBtn);
            } else {
                slots.forEach(slot => {
                    const btn = slot.firstChild;
                    if (btn && btn.dataset.char.toLowerCase() !== slot.dataset.expectedChar.toLowerCase()) {
                        btn.classList.add('wrong-anim');
                        setTimeout(() => {
                            btn.classList.remove('wrong-anim');
                            slot.dataset.filled = 'false';
                            pool.appendChild(btn);
                        }, 400);
                    }
                });
                
                handleAnswer('wrong-answer-trigger', dummyBtn);
                
                if (state.wrongAttemptsForCurrentWord >= 3) {
                    Array.from(target.querySelectorAll('.letter-btn')).forEach(btn => {
                        btn.classList.add('disabled');
                        btn.style.pointerEvents = 'none';
                    });
                    Array.from(pool.children).forEach(btn => {
                        btn.classList.add('disabled');
                        btn.style.pointerEvents = 'none';
                    });
                }
            }
        }
    }

    function handleAnswer(selectedOption, btn) {
        if (state.zombieDead) return;
        state.totalAttempts++;
        const correct = selectedOption === state.currentWord.a;

        if (correct) {
            let newlySecuredMissionTarget = false;
            if (isMissionMode()) {
                newlySecuredMissionTarget = !state.mission.securedIds.has(state.currentWord.vocab.id);
                state.mission.securedIds.add(state.currentWord.vocab.id);
                updateMissionHUD();
            }

            // GAMIFICATION: Add XP and Update SRS
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
            
            // Laser/Schuss abfeuern
            projectile.className = 'proj-' + state.hunterType;
            const startX = 430;
            projectile.style.left = startX + 'px';
            projectile.style.width = '0px';
            
            // Zielpunkt 20% links von der horizontalen Mitte des Zombies (bei 30% der Breite)
            const targetX = state.zombiePosition + (zombieEl.offsetWidth * 0.3);
            const distanceX = Math.max(10, targetX - startX);
            
            // Zielpunkt auf der Y-Achse: Lasse 20% oben und unten frei, treffe also die mittleren 60%
            // 30% vom Zentrum in beide Richtungen
            const zombieVisualHeight = (state.bossActive && zombieSpriteCanvas && zombieSpriteCanvas.style.display !== 'none') 
                ? zombieSpriteCanvas.offsetHeight 
                : zombieImgEl.offsetHeight;
            const maxVerticalOffset = zombieVisualHeight * 0.3;
            const randomYOffset = (Math.random() - 0.5) * 2 * maxVerticalOffset;
            
            // Winkel und tatsächliche Schusslänge (Hypotenuse) berechnen
            const angleRad = Math.atan2(randomYOffset, distanceX);
            const randomAngle = angleRad * (180 / Math.PI);
            projectile.style.rotate = randomAngle + 'deg';
            
            const shootDistance = Math.sqrt(distanceX * distanceX + randomYOffset * randomYOffset);
            
            state.zombieDead = true; // Stop zombie immediately
            setTimeout(() => {
                projectile.style.width = shootDistance + 'px';
                setTimeout(() => {
                    projectile.className = 'hidden';
                    const bossNeedsAnotherHit = state.bossActive && (
                        state.bossHealth > 1 || (isMissionMode() && !newlySecuredMissionTarget)
                    );
                    if (bossNeedsAnotherHit) {
                        if (!isMissionMode() || newlySecuredMissionTarget) state.bossHealth--;
                        zombieEl.classList.add('boss-hit');
                        setTimeout(() => zombieEl.classList.remove('boss-hit'), 100);
                        
                        const hps = document.querySelectorAll('.boss-hp');
                        if ((!isMissionMode() || newlySecuredMissionTarget) && hps[state.bossHealth]) {
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
                        killZombie();
                    }
                }, 300);
            }, 50);
            
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
            if (state.wrongAttemptsForCurrentWord >= 3) {
                state.zombieSpeed = 40; // Blitzschnell
                // Alle Buttons deaktivieren, damit der Zombie den Jäger sicher schnappt
                const buttons = document.querySelectorAll('.option-btn');
                buttons.forEach(b => b.disabled = true);
            } else {
                state.zombieSpeed += 3.0; // Deutlich schneller werden
            }

            state.streak = 0;
            updateBoostUI();
            state.level = Math.max(1, state.level - 1); // Level Down!
            
            recordWeakness(state.currentWord.q, state.currentWord.a, state.currentWord.vocab);
        }
    }

    function killZombie() {
        zombieEl.classList.remove('walking');
        zombieEl.classList.add('dead');
        
        spawnParticles(state.zombiePosition + (zombieEl.offsetWidth / 2), zombieEl.offsetTop + (zombieEl.offsetHeight / 2), state.hunterType);
        
        setTimeout(() => {
            showSolutionDialog(spawnZombie);
        }, 600);
    }

    function showSolutionDialog(onClose) {
        state.onDialogClose = onClose || spawnZombie;

        const dialog = document.getElementById('solution-dialog');
        const enEl = document.getElementById('solution-en');
        const deEl = document.getElementById('solution-de');
        
        enEl.textContent = getForeign(state.currentWord.vocab);
        deEl.textContent = getGerman(state.currentWord.vocab);
        
        dialog.classList.remove('hidden');
        
        const legacyFilename = getForeign(state.currentWord.vocab).replace(/\//g, '_') + '.mp3';
        const audioPath = state.currentWord.vocab.audio
            || (state.courseId === 'en-5' ? `assets/audio/${legacyFilename}` : '');
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
            audio.onended = safeClose;
            audio.onerror = safeClose;
            audio.play().catch(err => {
                console.log("Audio playback failed or file not found:", err);
                setTimeout(safeClose, 900);
            });
            fallbackTimer = setTimeout(safeClose, 20000);
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
        
        state.hearts = Math.max(0, state.hearts - 1);
        updateHeartsUI();
        
        // Schwerer Screen-Shake bei Schaden
        triggerScreenShake('heavy');
        
        hunterContainer.classList.add('wrong');
        setTimeout(() => hunterContainer.classList.remove('wrong'), 400);
        
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
    }

    // Boss Sprite Sheet: Einzelnen Frame auf Canvas zeichnen
    function renderBossFrame() {
        if (!zombieSpriteCtx || !bossSheetImg.complete) return;
        const frameW = bossSheetImg.width / BOSS_SHEET_COLS;
        const frameH = bossSheetImg.height / BOSS_SHEET_ROWS;
        const srcX = (bossCurrentFrame % BOSS_SHEET_COLS) * frameW;
        const srcY = Math.floor(bossCurrentFrame / BOSS_SHEET_COLS) * frameH;

        zombieSpriteCanvas.width = frameW;
        zombieSpriteCanvas.height = frameH;
        zombieSpriteCtx.clearRect(0, 0, frameW, frameH);
        zombieSpriteCtx.drawImage(bossSheetImg, srcX, srcY, frameW, frameH, 0, 0, frameW, frameH);
    }

    function gameLoop(timestamp) {
        if (!state.gameRunning) return;

        const delta = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        if (!state.zombieDead) {
            const frameSpeed = state.zombieSpeed * (delta / 16.66);
            state.zombiePosition -= frameSpeed;
        }
        
        // Boss Sprite Sheet Animation: Frame weiterschalten
        if (state.bossActive && zombieSpriteCanvas && zombieSpriteCanvas.style.display !== 'none') {
            const frameDuration = 1000 / BOSS_FPS;
            if (timestamp - bossLastFrameTime >= frameDuration) {
                bossCurrentFrame = (bossCurrentFrame + 1) % BOSS_FRAME_COUNT;
                renderBossFrame();
                bossLastFrameTime = timestamp;
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

        const missionResult = document.getElementById('mission-result');
        const endScreenTitle = document.getElementById('end-screen-title');
        const changeMissionSettingsBtn = document.getElementById('change-mission-settings-btn');
        if (isMissionMode()) {
            const securedCount = state.mission.securedIds.size;
            const targetCount = state.mission.targetWords.length;
            const missionPercentage = targetCount > 0 ? Math.min(100, (securedCount / targetCount) * 100) : 0;
            const medal = state.hearts >= 3 ? '🥇' : state.hearts === 2 ? '🥈' : '🥉';
            if (endScreenTitle) endScreenTitle.textContent = state.mission.completed ? 'Mission erfüllt!' : 'Extraktion erreicht!';
            missionResult?.classList.remove('hidden');
            missionResult?.classList.toggle('incomplete', !state.mission.completed);
            document.getElementById('mission-medal').textContent = medal;
            document.getElementById('mission-result-title').textContent = state.mission.completed
                ? 'Operation Morgenrot abgeschlossen'
                : 'Ziel fast erreicht – Wörter vorgemerkt';
            document.getElementById('mission-result-summary').textContent = state.mission.completed
                ? `${securedCount} von ${targetCount} Zielwörtern gesichert · ${state.mission.encounters} Begegnungen`
                : `${securedCount} von ${targetCount} Zielwörtern gesichert · Extraktion nach ${state.mission.encounters} Begegnungen`;
            document.getElementById('mission-result-progress').style.width = `${missionPercentage}%`;
            restartBtn.textContent = 'Empfohlene nächste Mission';
            changeMissionSettingsBtn?.classList.remove('hidden');
        } else {
            if (endScreenTitle) endScreenTitle.textContent = 'Jagd beendet!';
            missionResult?.classList.add('hidden');
            missionResult?.classList.remove('incomplete');
            restartBtn.textContent = 'Neue Jagd';
            changeMissionSettingsBtn?.classList.add('hidden');
        }

        checkAchievements({
            totalWords: state.totalAttempts,
            correctWords: state.correctAttempts,
            avgTime: avgTimeMs
        });
        saveProfile(playerProfile);

        const showLeaderboardBtn = document.getElementById('show-leaderboard-btn');
        if (showLeaderboardBtn) {
            showLeaderboardBtn.style.display = 'inline-block';
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
            'water': 15,
            'fire': 20,
            'lightning': 10,
            'laser': 8,
            'fuchsia': 12,
            'pink': 15
        };
        const baseHeight = baseHeights[state.hunterType] || 8;
        proj.style.setProperty('--boost-height', (baseHeight * boostFactor) + 'px');
        proj.style.setProperty('--boost-glow', (15 * boostFactor) + 'px');

        const colors = {
            'lightning': { color: '#ffff00', glow: 'rgba(255, 255, 0, 0.5)' },
            'fire': { color: '#ff3300', glow: 'rgba(255, 51, 0, 0.5)' },
            'water': { color: '#00ccff', glow: 'rgba(0, 204, 255, 0.5)' },
            'laser': { color: '#0000ff', glow: 'rgba(0, 0, 255, 0.5)' },
            'fuchsia': { color: '#ff00ff', glow: 'rgba(255, 0, 255, 0.5)' },
            'pink': { color: '#ff66b2', glow: 'rgba(255, 102, 178, 0.5)' }
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
        const count = 40;
        let baseColor = '#00ff88';
        if (element === 'laser' || element === 'fuchsia') baseColor = '#00ffff';
        else if (element === 'fire') baseColor = '#ff5500';
        else if (element === 'water' || element === 'pink') baseColor = '#0088ff';
        else if (element === 'lightning') baseColor = '#ffff00';

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + (element === 'fire' ? -4 : 0),
                life: 1.0,
                decay: Math.random() * 0.02 + 0.015,
                color: baseColor,
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
            if (p.element === 'fire') p.vy -= 0.15; // rise

            if (p.life <= 0) {
                particles.splice(i, 1);
            } else {
                fxCtx.globalAlpha = p.life;
                fxCtx.fillStyle = p.color;
                if (p.element === 'lightning') {
                    fxCtx.fillRect(p.x, p.y, p.size, p.size * 2);
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
