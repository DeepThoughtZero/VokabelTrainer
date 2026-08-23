const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('all local index resources exist and remain deployable as static files', () => {
    const html = read('index.html');
    const references = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    const localReferences = references.filter(reference => (
        reference
        && !reference.startsWith('#')
        && !reference.startsWith('//')
        && !/^[a-z][a-z0-9+.-]*:/i.test(reference)
    ));
    assert.ok(localReferences.length > 0, 'index.html should load local assets');
    for (const reference of localReferences) {
        const withoutQuery = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
        assert.ok(fs.existsSync(path.join(root, withoutQuery)), `missing local resource: ${reference}`);
    }
});

test('DOM ids are unique and screen dependencies load before app.js', () => {
    const html = read('index.html');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');

    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
    const requiredOrder = [
        'js/courses.js',
        'js/leaderboard.js',
        'js/vocabs.js',
        'js/vocabs_en_6.js',
        'js/vocab_utils.js',
        'js/app.js'
    ];
    assert.deepEqual(scripts, requiredOrder);
});

test('password, terms and course screens preserve the required entry flow', () => {
    const html = read('index.html');
    const app = read('js/app.js');
    const password = html.indexOf('id="login-screen"');
    const terms = html.indexOf('id="terms-screen"');
    const course = html.indexOf('id="course-selection-screen"');
    assert.ok(password >= 0 && terms >= 0 && course >= 0);
    assert.match(html, /<section id="login-screen" class="screen active">/);
    assert.match(html, /<section id="terms-screen" class="screen">/);
    assert.match(html, /<section id="course-selection-screen" class="screen">/);
    assert.match(html, /<h2>Klasse<\/h2>/);
    assert.match(html, /<h2>Fach<\/h2>/);
    assert.doesNotMatch(html, /<h2>\d+\.\s+(?:Klasse|Fach)<\/h2>/);
    assert.doesNotMatch(html, /course-selection-hint/);
    assert.doesNotMatch(app, /Ausgewählt:\s*\$\{window\.getCourseLabel/);
});

test('mission loop is a separate play style with a finite learning objective', () => {
    const html = read('index.html');
    const app = read('js/app.js');
    const css = read('css/style.css');
    const vocabUtils = read('js/vocab_utils.js');
    assert.match(html, /id="mission-selection-screen"/);
    assert.match(html, /data-play-style="mission"/);
    assert.match(html, /data-play-style="hunt"/);
    assert.ok(html.indexOf('data-play-style="hunt"') < html.indexOf('data-play-style="mission"'));
    assert.match(html, /class="play-style-card active"[^>]*data-play-style="hunt"/);
    assert.match(html, /id="command-center-screen"/);
    assert.match(html, /id="command-letter-pool"/);
    assert.match(html, /id="command-replay-audio-btn"/);
    assert.match(html, /id="halo-screen"/);
    assert.match(html, /id="halo-district-grid"/);
    assert.match(html, /id="halo-deploy-btn"/);
    assert.match(html, /class="mission-route"/);
    assert.match(html, /id="mission-hud"/);
    assert.match(html, /id="mission-encounter-label"/);
    assert.match(html, /id="mission-phase-overlay"/);
    assert.match(html, /id="mission-result"/);
    assert.match(html, /id="mission-progression"/);
    assert.match(html, /id="mission-xp-earned"/);
    assert.match(html, /id="mission-level-fill"/);
    assert.match(html, /id="profile-rescue-missions"/);
    assert.match(html, /id="profile-rescue-medals"/);
    assert.doesNotMatch(html, /Klares Lernziel · sichtbares Ende/);
    assert.doesNotMatch(html, /<option value="mission"/);
    assert.match(app, /missionTargetSize:\s*12/);
    assert.match(app, /missionMaxEncounters:\s*20/);
    assert.match(app, /missionNewWordLimit:\s*3/);
    assert.match(app, /finishMissionIfNeeded/);
    assert.match(app, /currentDuration \*= 1\.45/);
    assert.match(app, /showMissionPhaseTransition/);
    assert.match(app, /missionPhaseTransitionDurationMs:\s*6000/);
    assert.match(app, /missionExtractionTransitionDurationMs:\s*4000/);
    assert.match(app, /state\.mission\.transitionActive/);
    assert.match(app, /updateMissionHUD\(true\)/);
    assert.match(app, /finalizeMissionReward/);
    assert.match(app, /animateMissionProgression/);
    assert.match(app, /missionsCompleted/);
    assert.match(app, /erste_rettung/);
    assert.match(app, /einsatzleiter/);
    assert.match(app, /goldkommando/);
    assert.match(app, /wortretter/);
    assert.match(app, /Zum nächsten HALO-Sprung/);
    assert.match(app, /playStyle:\s*'hunt'/);
    assert.match(app, /beginMissionBriefing/);
    assert.match(app, /beginHaloSequence/);
    assert.match(app, /launchGameSession/);
    assert.match(app, /createVocabularyDistricts/);
    assert.match(app, /clearedDistricts/);
    assert.match(css, /\.mission-route\s*\{/);
    assert.match(css, /\.mission-hud\s*\{/);
    assert.match(css, /\.mission-phase-overlay\s*\{/);
    assert.match(css, /\.mission-progression\s*\{/);
    assert.match(css, /\.profile-rescue-career\s*\{/);
    assert.match(css, /#profile-rescue-medals\s*\{[^}]*white-space:\s*nowrap;/s);
    assert.match(css, /\.command-center-screen::before\s*\{[^}]*background-image:\s*url\('\.\.\/assets\/background_helicopter_command\.webp'\)/s);
    assert.match(css, /\.halo-screen::before\s*\{[^}]*background-image:\s*url\('\.\.\/assets\/background_halo_city\.webp'\)/s);
    assert.match(css, /\.district-cuboid\s*\{/);
    assert.ok(fs.existsSync(path.join(root, 'assets/background_helicopter_command.webp')));
    assert.ok(fs.existsSync(path.join(root, 'assets/background_halo_city.webp')));
    assert.ok(fs.existsSync(path.join(root, 'assets/video/HaloJump.mp4')));
    for (let variant = 1; variant <= 8; variant++) {
        assert.ok(fs.existsSync(path.join(root, `assets/audio/ui/mission_radio_password_intro_${variant}.mp3`)));
    }
    const ambientAudioAssets = [
        'helicopter_cabin_ambient.mp3',
        'helicopter_evasion_wind.mp3',
        'mission_fail_retreat.mp3',
        'halo_cargo_plane_ambient.mp3',
        'halo_freefall_wind.mp3',
        'apocalypse_street_ambient.mp3',
        'tactical_war_room_ambient.mp3',
        'safezone_victory_ambient.mp3'
    ];
    for (const audioAsset of ambientAudioAssets) {
        assert.ok(fs.existsSync(path.join(root, 'assets/audio/ui', audioAsset)), `Missing UI audio asset: ${audioAsset}`);
    }
    assert.match(app, /AMBIENT_SCENES/);
    assert.match(app, /startSceneAmbient/);
    assert.match(app, /duckAmbientAudio/);
    assert.match(app, /missionNewWordLimit:\s*3/);
    assert.match(app, /beginMissionDistrictSelection/);
    assert.match(app, /solution-concealed/);
    assert.doesNotMatch(html, /id="command-pilot-alert"/);
    assert.doesNotMatch(html, /id="command-auto-advance"/);
    assert.doesNotMatch(html, /class="command-mission-file/);
    assert.doesNotMatch(html, /id="halo-altitude"/);
    assert.doesNotMatch(html, /class="halo-map-legend"/);
    assert.doesNotMatch(html, /<span>🪂<\/span>/);
    assert.match(html, /id="halo-jump-video"/);
    assert.match(html, /assets\/video\/HaloJump\.mp4/);
    assert.match(html, /id="skip-halo-video-btn"/);
    assert.match(html, /id="command-radio-message"/);
    assert.match(app, /Echo One to Rescue Team/);
    assert.match(app, /getMissionRadioIntro/);
    assert.match(app, /startMissionRadioStatic/);
    assert.match(app, /MISSION_RADIO_INTRO_PATHS = Array\.from\(\s*\{ length: 8 \}/);
    assert.match(app, /pickMissionRadioIntroPath/);
    assert.match(app, /currentBriefingRadioIntro/);
    assert.match(app, /}, 650\)/);
    assert.doesNotMatch(app, /SpeechSynthesisUtterance/);
    assert.doesNotMatch(html, /class="halo-atmosphere"/);
    assert.match(vocabUtils, /const nextUnclearedDistrict = availableDistricts\.find/);
    assert.doesNotMatch(app, /getMissionRadioMessage\(vocab\)/);
    assert.match(app, /stopHaloSequence\(\);\s*launchGameSession\(\);/);
    assert.match(app, /MISSION_DISTRICT_MAP_POINTS/);
    assert.match(css, /\.halo-jump-video\s*\{/);
    assert.match(app, /liberationBonusXp/);
    assert.match(app, /streakBonusXp/);
    assert.doesNotMatch(html, /id="command-next-word-btn"/);
    assert.match(css, /\.halo-screen\.is-planning \.halo-city-map\s*\{/);
    assert.match(css, /body\.halo-active\s*\{[^}]*background-image:\s*url\('\.\.\/assets\/background_halo_city\.webp'\)/s);
    assert.match(css, /\.halo-screen:not\(\.is-planning\) \.halo-city-map/);
    assert.match(css, /#end-screen\.mission-summary-mode #show-leaderboard-btn/);
});

test('active correction is mission-only and returns as a visibly marked zombie', () => {
    const html = read('index.html');
    const app = read('js/app.js');
    const css = read('css/style.css');
    assert.match(html, /id="correction-panel"/);
    assert.match(html, /id="correction-pool"/);
    assert.match(html, /id="correction-target"/);
    assert.match(html, /id="marked-retry-banner"/);
    assert.match(html, /class="marked-retry-kicker"/);
    assert.match(html, /class="marked-retry-title"/);
    assert.doesNotMatch(html, /id="marked-zombie-badge"/);
    assert.match(app, /createCorrectionSchedule\(state\.correction\.encounterSerial\)/);
    assert.match(app, /if \(isMissionMode\(\)\) beginCorrectionConfirmation\(appliedSpeedPenalty\)/);
    assert.match(app, /if \(isMissionMode\(\)\) \{\s*beginCorrectionConfirmation\(\);\s*return;/);
    assert.match(app, /Free Hunt intentionally keeps its established random draw/);
    assert.match(app, /resolveCurrentCorrectionRetry/);
    assert.doesNotMatch(app, /querySelector\('div > span'\)/);
    assert.match(css, /\.correction-panel\s*\{/);
    assert.match(css, /\.marked-retry-kicker\s*\{/);
    assert.doesNotMatch(css, /\.marked-zombie-badge\s*\{/);
    assert.match(css, /#zombie\.marked-fleeing\s*\{/);
});

test('course-specific persistence and leaderboard category construction stay separated', () => {
    const app = read('js/app.js');
    const leaderboard = read('js/leaderboard.js');
    assert.match(app, /return `\$\{state\.courseId\}:\$\{vocab\.id\}`/);
    assert.match(app, /all\.courses\[state\.courseId\]/);
    assert.match(app, /state\.kategorie = `\$\{getCourseLabel\(\)\}: Mix`/);
    assert.match(app, /state\.kategorie = `\$\{getCourseLabel\(\)\}: \$\{formattedUnits\.join\(', '\)\}`/);
    assert.match(leaderboard, /replace\(\/\^Englisch\\s\*:\/i, 'Englisch 5:'\)/);
});

test('Google Apps Script stores category as free text without a class schema change', () => {
    const script = read('scripts/apps-script.js');
    assert.match(script, /String\(e\.parameter\.kategorie \|\| ''\)\.substring\(0, 100\)/);
    assert.match(script, /String\(data\.kategorie \|\| ''\)\.substring\(0, 100\)/);
    assert.doesNotMatch(script, /Englisch\s*[56]/);
    assert.match(script, /kategorie:\s*row\[2\]/);
});

test('leaderboard filters are stacked and separate class from learning path', () => {
    const html = read('index.html');
    const css = read('css/style.css');
    assert.match(html, /class="leaderboard-filters"/);
    assert.match(html, /<label for="klassen-filter">Klasse<\/label>/);
    assert.match(html, /<label for="kategorie-filter">Lernpfad<\/label>/);
    assert.match(html, /<label for="sort-filter">Sortieren nach<\/label>/);
    assert.doesNotMatch(html, /id="kurs-filter"/);
    assert.match(css, /\.leaderboard-filters\s*\{[\s\S]*?flex-direction:\s*column;/);
    assert.match(css, /\.leaderboard-filter-field select\s*\{[\s\S]*?width:\s*100%;/);
});

test('portrait orientation notice is active after terms and can be dismissed', () => {
    const html = read('index.html');
    const css = read('css/style.css');
    const app = read('js/app.js');
    assert.match(html, /id="orientation-notice"[\s\S]*?id="dismiss-orientation-notice-btn"/);
    assert.match(css, /@media \(orientation: portrait\)[\s\S]*?body\.requires-landscape:not\(\.orientation-notice-dismissed\) #orientation-notice/);
    assert.match(app, /classList\.toggle\('requires-landscape',/);
    assert.match(app, /classList\.add\('orientation-notice-dismissed'\)/);
});

test('visual dense-options fixture stays wired to the production styles and classifier', () => {
    const fixture = read('tests/fixtures/options-density-preview.html');
    assert.match(fixture, /\.\.\/\.\.\/css\/style\.css/);
    assert.match(fixture, /\.\.\/\.\.\/js\/vocab_utils\.js/);
    assert.equal((fixture.match(/class="option-btn"/g) || []).length, 7);
    assert.match(fixture, /getOptionDensity\(labels\)/);
    assert.match(fixture, /getWordBubbleDensity\(bubble\.textContent\)/);
});

test('visual leaderboard fixture exercises class grouping with production code', () => {
    const fixture = read('tests/fixtures/leaderboard-preview.html');
    assert.match(fixture, /\.\.\/\.\.\/css\/style\.css/);
    assert.match(fixture, /\.\.\/\.\.\/js\/leaderboard\.js/);
    assert.match(fixture, /Englisch 5:/);
    assert.match(fixture, /Englisch 6:/);
    assert.match(fixture, /updateCategoryDropdown\(previewEntries\)/);
});

test('local Git verification does not depend on a Codex-only ripgrep binary', () => {
    for (const file of ['.githooks/pre-commit', '.githooks/pre-push', 'scripts/verify.sh']) {
        assert.doesNotMatch(read(file), /\brg\b/, `${file} must run in a regular user PATH`);
    }
});

test('local hooks test the staged commit and clean push snapshots', () => {
    const preCommit = read('.githooks/pre-commit');
    const prePush = read('.githooks/pre-push');
    assert.match(preCommit, /check_tested_snapshot\.sh" --staged/);
    assert.match(prePush, /check_tested_snapshot\.sh" --head/);
    assert.match(read('scripts/verify.sh'), /bash tests\/check_staged_snapshot_test\.sh/);
});

test('full local verification includes the dependency-free browser smoke test', () => {
    const verify = read('scripts/verify.sh');
    const browserSmoke = read('scripts/browser_smoke_test.mjs');
    assert.match(verify, /node scripts\/browser_smoke_test\.mjs/);
    assert.doesNotMatch(browserSmoke, /from ['"](?:playwright|puppeteer)/);
    assert.match(browserSmoke, /1280/);
    assert.match(browserSmoke, /width:\s*390/);
    assert.match(browserSmoke, /Englisch 6/);
});

test('audio evidence freshness is content-addressed instead of timestamp-based', () => {
    const checker = read('scripts/check_audio_integrity.py');
    const verifier = read('scripts/verify_audio_speaches.py');
    assert.match(checker, /content_hashes/);
    assert.match(verifier, /contentHashSchema/);
    assert.doesNotMatch(checker, /st_mtime/);
});

test('hunter intros and hero-city specific audio assets exist and remain wired', () => {
    const uiTexts = JSON.parse(read('js/ui_texts.json'));
    const app = read('js/app.js');
    const hunters = ['laser', 'water', 'fire', 'lightning', 'fuchsia', 'pink'];
    const cities = ['london', 'brighton', 'buehl', 'capetown', 'istanbul', 'rio', 'sf'];

    assert.deepEqual(Object.keys(uiTexts.hunter_voices).sort(), [...hunters].sort());
    assert.deepEqual(Object.keys(uiTexts.hunter_intros).sort(), [...hunters].sort());
    assert.deepEqual(Object.keys(uiTexts.hunter_cities).sort(), [...hunters].sort());

    for (const hunter of hunters) {
        assert.ok(uiTexts.hunter_voices[hunter]);
        assert.ok(uiTexts.hunter_intros[hunter]?.trim());
        const introFile = path.join(root, `assets/audio/ui/hunter_${hunter}_intro.mp3`);
        assert.ok(fs.existsSync(introFile), `missing hunter intro audio: ${introFile}`);
        assert.ok(fs.statSync(introFile).size > 1000, `empty hunter intro audio: ${introFile}`);

        assert.deepEqual(Object.keys(uiTexts.hunter_cities[hunter]).sort(), [...cities].sort());
        for (const city of cities) {
            assert.ok(uiTexts.hunter_cities[hunter][city]?.trim());
            const cityFile = path.join(root, `assets/audio/ui/hunter_${hunter}_city_${city}.mp3`);
            assert.ok(fs.existsSync(cityFile), `missing hero-city audio: ${cityFile}`);
            assert.ok(fs.statSync(cityFile).size > 1000, `empty hero-city audio: ${cityFile}`);
        }
    }

    assert.match(app, /playUIAudio\(`hunter_\$\{hunterId\}_intro\.mp3`\)/);
    assert.match(app, /playUIAudio\(`hunter_\$\{hunterId\}_city_\$\{cityId\}\.mp3`\)/);
});

test('critical health audio asset exists and is wired to 1 heart condition', () => {
    const app = read('js/app.js');
    const html = read('index.html');
    const audioFile = path.join(root, 'assets/audio/ui/critical_health_heartbeat.mp3');
    assert.ok(fs.existsSync(audioFile), `missing critical health heartbeat audio: ${audioFile}`);
    assert.ok(fs.statSync(audioFile).size > 1000, `empty critical health heartbeat audio: ${audioFile}`);

    assert.match(app, /startCriticalHealthAudio/);
    assert.match(app, /stopCriticalHealthAudio/);
    assert.match(app, /state\.hearts === 1/);

    // Banner is placed under the vocabulary options
    const optionsIndex = html.indexOf('id="options-container"');
    const bannerIndex = html.indexOf('id="marked-retry-banner"');
    assert.ok(optionsIndex !== -1 && bannerIndex !== -1);
    assert.ok(bannerIndex > optionsIndex, 'marked-retry-banner must be placed below options-container');
});
