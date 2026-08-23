const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const audioDirectoryEn6 = path.join(root, 'assets/audio/vocab/en-6');
const audioDirectoryEn5 = path.join(root, 'assets/audio/vocab/en-5');
const audioDirectoryRoot = path.join(root, 'assets/audio');

function loadEnglish5() {
    const context = { window: { VOCABULARIES: {} } };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(root, 'js/vocabs.js'), 'utf8'),
        context,
        { filename: 'js/vocabs.js' }
    );
    return Array.from(context.window.VOCABULARIES['en-5']);
}

function loadEnglish6() {
    const context = { window: { VOCABULARIES: {} } };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(root, 'js/vocabs_en_6.js'), 'utf8'),
        context,
        { filename: 'js/vocabs_en_6.js' }
    );
    return Array.from(context.window.VOCABULARIES['en-6']);
}

test('English 5 entries satisfy the stable id and schema contract', () => {
    const entries = loadEnglish5();
    assert.ok(entries.length > 0);
    const seenIds = new Set();
    for (const entry of entries) {
        const foreign = entry.foreign || entry.english;
        assert.equal(typeof foreign, 'string');
        assert.ok(foreign.trim(), `empty foreign text: ${entry.id}`);
        assert.equal(typeof entry.german, 'string');
        assert.ok(entry.german.trim(), `empty German text: ${entry.id}`);
        assert.ok(entry.unit.trim(), `empty unit: ${entry.id}`);
        assert.ok(Number.isInteger(entry.page) && entry.page >= 225 && entry.page <= 261);
        assert.match(entry.id, new RegExp(`^en-5-p${entry.page}-\\d{3}$`));
        assert.equal(seenIds.has(entry.id), false, `duplicate id: ${entry.id}`);
        seenIds.add(entry.id);
    }
    assert.equal(seenIds.size, entries.length);
});

test('English 5 audio directory is a complete one-to-one materialization of the database', () => {
    const entries = loadEnglish5();
    const expected = entries.map(entry => `${entry.id}.mp3`).sort();
    const actual = fs.readdirSync(audioDirectoryEn5).filter(file => file.endsWith('.mp3')).sort();
    assert.deepEqual(actual, expected);
    assert.equal(actual.length, entries.length);
    for (const file of actual) {
        const stats = fs.statSync(path.join(audioDirectoryEn5, file));
        assert.ok(stats.size >= 1000, `implausibly small audio file: ${file} (${stats.size} bytes)`);
        assert.equal(file.endsWith('.tmp.mp3'), false);
    }
});

test('root audio directory contains no loose vocabulary MP3 files', () => {
    const looseMp3s = fs.readdirSync(audioDirectoryRoot).filter(file => file.endsWith('.mp3'));
    assert.deepEqual(looseMp3s, [], 'assets/audio must only contain subdirectories (ui, vocab), no loose mp3s');
});

test('generated vocabulary agrees with the reviewed import report', () => {
    const entries = loadEnglish6();
    const report = JSON.parse(
        fs.readFileSync(path.join(root, 'scripts/vocab_import/class6_import_report.json'), 'utf8')
    );
    assert.equal(report.courseId, 'en-6');
    assert.deepEqual(report.pageRange, [285, 318]);
    assert.equal(report.uniquePages, 34);
    assert.equal(report.sourcePhotos, 39);
    assert.equal(report.entryCount, 869);
    assert.equal(entries.length, report.entryCount);

    const pageCounts = Object.fromEntries(
        [...new Set(entries.map(entry => entry.page))]
            .sort((a, b) => a - b)
            .map(page => [String(page), entries.filter(entry => entry.page === page).length])
    );
    assert.deepEqual(pageCounts, report.pageCounts);
});

test('every entry satisfies the stable id and audio-path contract', () => {
    const entries = loadEnglish6();
    const seenIds = new Set();
    const seenAudio = new Set();
    for (const entry of entries) {
        assert.equal(typeof entry.foreign, 'string');
        assert.ok(entry.foreign.trim(), `empty foreign text: ${entry.id}`);
        assert.equal(typeof entry.german, 'string');
        assert.ok(entry.german.trim(), `empty German text: ${entry.id}`);
        assert.ok(entry.unit.trim(), `empty unit: ${entry.id}`);
        assert.ok(Number.isInteger(entry.page) && entry.page >= 285 && entry.page <= 318);
        assert.match(entry.id, new RegExp(`^en6-p${entry.page}-\\d{3}$`));
        assert.equal(entry.audio, `assets/audio/vocab/en-6/${entry.id}.mp3`);
        assert.equal(seenIds.has(entry.id), false, `duplicate id: ${entry.id}`);
        assert.equal(seenAudio.has(entry.audio), false, `duplicate audio path: ${entry.audio}`);
        seenIds.add(entry.id);
        seenAudio.add(entry.audio);
    }
});

test('audio directory is a complete one-to-one materialization of the database', () => {
    const entries = loadEnglish6();
    const expected = entries.map(entry => path.basename(entry.audio)).sort();
    const actual = fs.readdirSync(audioDirectoryEn6).filter(file => file.endsWith('.mp3')).sort();
    assert.deepEqual(actual, expected);
    assert.equal(actual.length, 869);
    for (const file of actual) {
        const stats = fs.statSync(path.join(audioDirectoryEn6, file));
        assert.ok(stats.size >= 1000, `implausibly small audio file: ${file} (${stats.size} bytes)`);
        assert.equal(file.endsWith('.tmp.mp3'), false);
    }
});

test('source-photo manifest includes page 285 correction and all photos exactly once', () => {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(root, 'scripts/vocab_import/class6_pages.json'), 'utf8')
    );
    assert.equal(manifest.sourceDirectory, 'pictures/Englisch_Klasse6');
    assert.equal(manifest.pages[0].page, 285);
    assert.equal(manifest.pages[0].file, 'PXL_20260817_124608540.jpg');
    const files = manifest.pages.flatMap(page => [page.file, ...(page.alternatives || [])]);
    assert.equal(files.length, 39);
    assert.equal(new Set(files).size, files.length);
});

test('SPEACHES evidence is content-addressed to every vocabulary text and MP3', () => {
    const entries = loadEnglish6();
    const report = JSON.parse(
        fs.readFileSync(path.join(root, 'scripts/vocab_import/class6_audio_stt_report.json'), 'utf8')
    );
    assert.equal(report.contentHashSchema, 'sha256-v1');
    assert.equal(report.results.length, entries.length);
    const results = new Map(report.results.map(result => [result.id, result]));

    for (const entry of entries) {
        const result = results.get(entry.id);
        assert.ok(result, `missing STT evidence: ${entry.id}`);
        const audio = fs.readFileSync(path.join(root, entry.audio));
        const audioHash = crypto.createHash('sha256').update(audio).digest('hex');
        const foreignHash = crypto.createHash('sha256').update(entry.foreign, 'utf8').digest('hex');
        const expectedSpokenHash = crypto.createHash('sha256')
            .update(result.expectedSpoken, 'utf8')
            .digest('hex');
        assert.equal(result.audioSha256, audioHash, `stale audio evidence: ${entry.id}`);
        assert.equal(result.foreignSha256, foreignHash, `stale vocabulary evidence: ${entry.id}`);
        assert.equal(
            result.expectedSpokenSha256,
            expectedSpokenHash,
            `stale spoken-text evidence: ${entry.id}`
        );
    }
});
