const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const audioDirectory = path.join(root, 'assets/audio/vocab/en-6');

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
    const actual = fs.readdirSync(audioDirectory).filter(file => file.endsWith('.mp3')).sort();
    assert.deepEqual(actual, expected);
    assert.equal(actual.length, 869);
    for (const file of actual) {
        const stats = fs.statSync(path.join(audioDirectory, file));
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
