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
});

test('mission loop is a separate play style with a finite learning objective', () => {
    const html = read('index.html');
    const app = read('js/app.js');
    const css = read('css/style.css');
    assert.match(html, /id="mission-selection-screen"/);
    assert.match(html, /data-play-style="mission"/);
    assert.match(html, /data-play-style="hunt"/);
    assert.match(html, /class="mission-route"/);
    assert.match(html, /id="mission-hud"/);
    assert.match(html, /id="mission-encounter-label"/);
    assert.match(html, /id="mission-phase-overlay"/);
    assert.match(html, /id="mission-result"/);
    assert.doesNotMatch(html, /Klares Lernziel · sichtbares Ende/);
    assert.doesNotMatch(html, /<option value="mission"/);
    assert.match(app, /missionTargetSize:\s*12/);
    assert.match(app, /missionMaxEncounters:\s*20/);
    assert.match(app, /missionNewWordLimit:\s*6/);
    assert.match(app, /finishMissionIfNeeded/);
    assert.match(app, /currentDuration \*= 1\.45/);
    assert.match(app, /showMissionPhaseTransition/);
    assert.match(app, /Empfohlene nächste Mission/);
    assert.match(css, /\.mission-route\s*\{/);
    assert.match(css, /\.mission-hud\s*\{/);
    assert.match(css, /\.mission-phase-overlay\s*\{/);
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

test('portrait orientation notice is limited to the active game and can be dismissed', () => {
    const html = read('index.html');
    const css = read('css/style.css');
    const app = read('js/app.js');
    assert.match(html, /id="orientation-notice"[\s\S]*?id="dismiss-orientation-notice-btn"/);
    assert.match(css, /@media \(orientation: portrait\)[\s\S]*?body\.game-active:not\(\.orientation-notice-dismissed\) #orientation-notice/);
    assert.match(app, /classList\.toggle\('game-active', screenName === 'game'\)/);
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
