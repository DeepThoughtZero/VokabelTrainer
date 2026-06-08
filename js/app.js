document.addEventListener('DOMContentLoaded', () => {
    // Game Config
    const CONFIG = {
        maxVocabsForMaxSpeed: 100,
        minZombieDuration: 2.0,
        maxZombieDuration: 15.0,
        streakForExtraOption: 3,
        streakForHeart: 10,
        bubbleOnLeft: true // Schalter: Setze auf false, um die Sprechblase wieder oben anzuzeigen
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
        direction: 'en-de',
        level: 1,
        streak: 0,
        lastHeartRegenTime: 0,
        wrongAttemptsForCurrentWord: 0,
        zombieDead: false,
        maxStreak: 0
    };

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

    // DOM Elements
    const screens = {
        login: document.getElementById('login-screen'),
        start: document.getElementById('start-screen'),
        game: document.getElementById('game-screen'),
        end: document.getElementById('end-screen')
    };

    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('secret-password');
    const loginError = document.getElementById('login-error');
    
    // Obfuscated password ("Zombie" in base64)
    const SECRET_HASH = "Wm9tYmll";

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    function handleLogin() {
        const input = passwordInput.value.trim();
        // Simple base64 encoding check (btoa)
        // btoa("Zombie") === "Wm9tYmll"
        if (btoa(input) === SECRET_HASH) {
            showScreen('start');
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

    const zombieImages = [
        'assets/zombie1.png',
        'assets/zombie2.png',
        'assets/zombie3.png',
        'assets/zombie4.png',
        'assets/zombie5.png'
    ];

    // Init
    initFilters();
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', showStartScreen);

    settingsBtn.addEventListener('click', () => {
        state.gameRunning = false;
        settingsDialog.classList.remove('hidden');
    });

    cancelSettingsBtn.addEventListener('click', () => {
        settingsDialog.classList.add('hidden');
        state.gameRunning = true;
        lastFrameTime = performance.now();
        requestAnimationFrame(gameLoop);
    });

    confirmSettingsBtn.addEventListener('click', () => {
        settingsDialog.classList.add('hidden');
        state.gameRunning = false;
        cancelAnimationFrame(animationId);
        showStartScreen();
    });

    // Charakter-Auswahl
    const charCards = document.querySelectorAll('.char-card');
    charCards.forEach(card => {
        card.addEventListener('click', () => {
            charCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.hunterType = card.dataset.hunter;
        });
    });

    function initFilters() {
        const container = document.getElementById('learning-path-container');
        
        if (typeof VOCABULARY === 'undefined' || VOCABULARY.length === 0) {
            if (container) container.innerHTML = '<p>Lade Vokabeln...</p>';
            return;
        }

        if (!container) return;
        container.innerHTML = '';

        const units = new Set();
        const parts = new Map();
        const pages = new Map();

        VOCABULARY.forEach(v => {
            if (v.unit) {
                units.add(v.unit);
                if (!parts.has(v.unit)) parts.set(v.unit, new Set());
                if (!pages.has(v.unit)) pages.set(v.unit, new Set());

                if (v.part && v.part.trim() !== '') {
                    parts.get(v.unit).add(`${v.unit} - ${v.part}`);
                }
                if (v.page) {
                    pages.get(v.unit).add(v.page);
                }
            }
        });

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
                if (isAll) {
                    if (inp.checked) {
                        document.querySelectorAll('.filter-checkbox').forEach(cb => {
                            if (cb !== inp) {
                                cb.checked = false;
                                cb.parentElement.classList.remove('active');
                            }
                        });
                        lbl.classList.add('active');
                    } else {
                        inp.checked = true; // All can't be unchecked directly
                    }
                } else {
                    if (inp.checked) {
                        lbl.classList.add('active');
                        const allCb = document.querySelector('input[value="all"]');
                        if (allCb && allCb.checked) {
                            allCb.checked = false;
                            allCb.parentElement.classList.remove('active');
                        }
                    } else {
                        lbl.classList.remove('active');
                        const anyChecked = Array.from(document.querySelectorAll('.filter-checkbox')).some(cb => cb.checked && cb.value !== 'all');
                        if (!anyChecked) {
                            const allCb = document.querySelector('input[value="all"]');
                            if(allCb) {
                                allCb.checked = true;
                                allCb.parentElement.classList.add('active');
                            }
                        }
                    }
                }
            });

            return lbl;
        }

        const unitList = Array.from(units).sort();
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

            // Unit Cell
            const unitCell = document.createElement('div');
            unitCell.className = 'filter-cell unit-cell';
            unitCell.style.gridRow = `${row}`;
            unitCell.style.gridColumn = '2';
            unitCell.appendChild(createCheckbox(`unit:${u}`, u));
            container.appendChild(unitCell);

            // Part Cell
            const partCell = document.createElement('div');
            partCell.className = 'filter-cell part-cell';
            partCell.style.gridRow = `${row}`;
            partCell.style.gridColumn = '3';
            const unitParts = Array.from(parts.get(u) || []).sort();
            unitParts.forEach(p => partCell.appendChild(createCheckbox(`part:${p}`, p)));
            container.appendChild(partCell);

            // Page Cell
            const pageCell = document.createElement('div');
            pageCell.className = 'filter-cell page-cell';
            pageCell.style.gridRow = `${row}`;
            pageCell.style.gridColumn = '4';
            const unitPages = Array.from(pages.get(u) || []).sort((a,b) => a - b);
            unitPages.forEach(p => pageCell.appendChild(createCheckbox(`page:${p}`, `${p}`)));
            container.appendChild(pageCell);
        });
    }

    function showScreen(screenName) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    function showStartScreen() {
        showScreen('start');
    }

    function startGame() {
        if (typeof VOCABULARY === 'undefined' || VOCABULARY.length === 0) {
            alert('Vokabeln werden noch geladen oder sind nicht verfügbar... Bitte warte kurz und versuche es erneut.');
            return;
        }

        state.direction = document.getElementById('translation-direction').value;

        const selectedCheckboxes = Array.from(document.querySelectorAll('.filter-checkbox:checked'));
        const paths = selectedCheckboxes.map(cb => cb.value);
        
        // Immer nur Vokabeln nehmen, bei denen sowohl Englisch als auch Deutsch nicht leer sind
        const validVocabs = VOCABULARY.filter(v => v.english && v.german && v.english.trim() !== '' && v.german.trim() !== '');

        if (paths.includes('all') || paths.length === 0) {
            state.vocabPool = [...validVocabs];
        } else {
            state.vocabPool = validVocabs.filter(v => {
                return paths.some(path => {
                    if (path.startsWith('unit:')) return v.unit === path.split(':')[1];
                    if (path.startsWith('part:')) return `${v.unit} - ${v.part}` === path.split(':')[1];
                    if (path.startsWith('page:')) return String(v.page) === path.split(':')[1];
                    return false;
                });
            });
        }
        
        if (state.vocabPool.length === 0) {
            alert('Keine Vokabeln für diesen Pfad gefunden!');
            return;
        }

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
        
        if (state.hunterType === 'water') {
            hunterEl.src = 'assets/hunter_water.png';
        } else if (state.hunterType === 'fire') {
            hunterEl.src = 'assets/hunter_fire.png';
        } else if (state.hunterType === 'lightning') {
            hunterEl.src = 'assets/hunter_lightning.png';
        } else {
            hunterEl.src = 'assets/hunter.png';
        }

        updateHeartsUI();
        scoreEl.textContent = state.score;

        showScreen('game');
        spawnZombie();
        
        lastFrameTime = performance.now();
        animationId = requestAnimationFrame(gameLoop);
    }

    function getQuestionAndAnswer(vocab, isEnToDe) {
        if (isEnToDe === undefined) {
            isEnToDe = state.direction === 'en-de';
            if (state.direction === 'mixed') {
                isEnToDe = Math.random() > 0.5;
            }
        }
        return isEnToDe ? 
            { q: vocab.english, a: vocab.german, vocab: vocab } : 
            { q: vocab.german, a: vocab.english, vocab: vocab };
    }

    function spawnZombie() {
        if (!state.gameRunning) return;
        
        // Dynamische Schwierigkeit: Zombie wird kontinuierlich schneller bis 100 Vokabeln (2 Sekunden)
        let progress = Math.min(state.correctAttempts / CONFIG.maxVocabsForMaxSpeed, 1.0);
        let currentDuration = CONFIG.maxZombieDuration - (progress * (CONFIG.maxZombieDuration - CONFIG.minZombieDuration));
        let startX = canvas.clientWidth;
        let distance = startX - 200; // 200 ist der Hit-Bereich
        let framesNeeded = currentDuration * 60; // Geht von 60fps aus
        state.zombieSpeed = distance / framesNeeded;
        
        state.wrongAttemptsForCurrentWord = 0;
        state.zombieDead = false;

        const randomIndex = Math.floor(Math.random() * state.vocabPool.length);
        const vocab = state.vocabPool[randomIndex];
        
        let isEnToDe = state.direction === 'en-de';
        if (state.direction === 'mixed') {
            isEnToDe = Math.random() > 0.5;
        }

        state.currentWord = getQuestionAndAnswer(vocab, isEnToDe);

        zombieWordEl.textContent = state.currentWord.q;
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
        
        zombieImgEl.src = zombieImages[Math.floor(Math.random() * zombieImages.length)];

        generateOptions(vocab, isEnToDe);
    }

    function generateOptions(correctVocab, isEnToDe) {
        optionsContainer.innerHTML = '';
        // Dynamische Schwierigkeit: Mehr Auswahlmöglichkeiten je besser der Streak ist (max 8)
        const optionsCount = Math.min(8, 4 + Math.floor(state.streak / CONFIG.streakForExtraOption));
        let options = [state.currentWord.a];

        while (options.length < optionsCount) {
            const randomV = state.vocabPool[Math.floor(Math.random() * state.vocabPool.length)];
            const wrongA = getQuestionAndAnswer(randomV, isEnToDe).a;
            if (!options.includes(wrongA)) {
                options.push(wrongA);
            }
        }

        options.sort(() => Math.random() - 0.5);

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
        
        let fontSize = 3.6; // Startwert aus CSS (3.6rem)
        const minFontSize = 1.6;
        const step = 0.2;
        
        while (fontSize >= minFontSize) {
            let rows = 1;
            let lastTop = buttons[0].offsetTop;
            
            for (let i = 1; i < buttons.length; i++) {
                if (Math.abs(buttons[i].offsetTop - lastTop) > 5) {
                    rows++;
                    lastTop = buttons[i].offsetTop;
                }
            }
            
            if (rows <= 3) {
                break; // Passt in 3 oder weniger Zeilen
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

    function handleAnswer(selectedOption, btn) {
        if (state.zombieDead) return;
        state.totalAttempts++;
        const correct = selectedOption === state.currentWord.a;

        if (correct) {
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

            state.score += 10;
            scoreEl.textContent = state.score;
            btn.classList.add('correct');
            
            playShootSound();
            
            // Laser/Schuss abfeuern
            projectile.className = 'proj-' + state.hunterType;
            const startX = 430;
            projectile.style.left = startX + 'px';
            projectile.style.width = '0px';
            
            // Zielpunkt in der horizontalen Mitte des Zombies
            const targetX = state.zombiePosition + (zombieEl.offsetWidth / 2);
            const distanceX = Math.max(10, targetX - startX);
            
            // Zielpunkt auf der Y-Achse: Lasse 20% oben und unten frei, treffe also die mittleren 60%
            // 30% vom Zentrum in beide Richtungen
            const maxVerticalOffset = zombieImgEl.offsetHeight * 0.3;
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
                    killZombie();
                }, 300);
            }, 50);
            
        } else {
            btn.classList.add('wrong');
            btn.disabled = true;

            // Score sinkt bei falscher Antwort
            state.score = Math.max(0, state.score - 5);
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
            state.level = Math.max(1, state.level - 1); // Level Down!
            
            recordWeakness(state.currentWord.q, state.currentWord.a, state.currentWord.vocab);
        }
    }

    function killZombie() {
        zombieEl.classList.remove('walking');
        zombieEl.classList.add('dead');
        
        setTimeout(() => {
            showSolutionDialog(spawnZombie);
        }, 600);
    }

    function showSolutionDialog(onClose) {
        state.onDialogClose = onClose || spawnZombie;

        const dialog = document.getElementById('solution-dialog');
        const enEl = document.getElementById('solution-en');
        const deEl = document.getElementById('solution-de');
        
        enEl.textContent = state.currentWord.vocab.english;
        deEl.textContent = state.currentWord.vocab.german;
        
        dialog.classList.remove('hidden');
        
        // Dateiname analog zu generate_audio.sh bauen
        const filename = state.currentWord.vocab.english.replace(/\//g, '_') + '.mp3';
        const audio = new Audio('assets/audio/' + filename);
        
        let dialogClosed = false;

        const safeClose = () => {
            if (!dialogClosed) {
                dialogClosed = true;
                closeSolutionDialog();
            }
        };
        
        audio.onended = () => {
            safeClose();
        };
        
        audio.onerror = () => {
            safeClose();
        };
        
        audio.play().catch(err => {
            console.log("Audio playback failed or file not found:", err);
            // 2 Sekunden Fallback, wenn Audio fehlt
            setTimeout(safeClose, 2000);
        });
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
        state.level = Math.max(1, state.level - 1);
        
        state.hearts--;
        updateHeartsUI();
        
        hunterContainer.classList.add('wrong');
        setTimeout(() => hunterContainer.classList.remove('wrong'), 400);
        
        zombieEl.classList.add('hidden'); // Zombie während Dialog ausblenden

        const afterDialog = () => {
            zombieEl.classList.remove('hidden');
            if (state.hearts <= 0) {
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
    }

    function gameLoop(timestamp) {
        if (!state.gameRunning) return;

        const delta = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        if (!state.zombieDead) {
            const frameSpeed = state.zombieSpeed * (delta / 16.66);
            state.zombiePosition -= frameSpeed;
        }
        
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
        
        const accuracy = state.totalAttempts > 0 ? Math.round((state.correctAttempts / state.totalAttempts) * 100) : 0;
        const totalTimeSeconds = (Date.now() - state.startTime) / 1000;
        const timePerWord = state.totalAttempts > 0 ? (totalTimeSeconds / state.totalAttempts).toFixed(1) : 0;

        document.getElementById('stat-final-score').textContent = state.score;
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
});
