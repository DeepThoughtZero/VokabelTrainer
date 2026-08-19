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
