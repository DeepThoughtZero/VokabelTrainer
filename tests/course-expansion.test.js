const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function evaluateScripts(files, additions = {}) {
    const context = {
        console,
        window: {},
        ...additions
    };
    vm.createContext(context);
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    return context;
}

test('password is the only initially active entry screen', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<section id="login-screen" class="screen active">/);
    assert.match(html, /<section id="terms-screen" class="screen">/);
    assert.match(html, /<section id="course-selection-screen" class="screen">/);
    assert.doesNotMatch(html, /<h2>[12]\. (?:Klasse|Fach)<\/h2>/);
});

test('course catalogue exposes the intended availability matrix', () => {
    const context = evaluateScripts(['js/courses.js']);
    const courses = Array.from(context.window.COURSES);
    assert.deepEqual(courses.map(course => course.id), ['en-5', 'en-6', 'fr-6', 'la-6']);
    assert.equal(courses.find(course => course.id === 'en-5').available, true);
    assert.equal(courses.find(course => course.id === 'en-6').available, true);
    assert.equal(courses.find(course => course.id === 'fr-6').available, false);
    assert.equal(courses.find(course => course.id === 'la-6').available, false);
});

test('class 5 remains complete and class 6 covers every photographed page', () => {
    const context = evaluateScripts(['js/courses.js', 'js/vocabs.js', 'js/vocabs_en_6.js']);
    const english5 = Array.from(context.window.VOCABULARIES['en-5']);
    const english6 = Array.from(context.window.VOCABULARIES['en-6']);
    assert.equal(english5.length, 999);
    assert.equal(english6.length, 869);
    assert.deepEqual([...new Set(english6.map(row => row.page))], Array.from({ length: 34 }, (_, i) => 285 + i));
    assert.equal(new Set(english6.map(row => row.id)).size, english6.length);
    for (const row of english6) {
        assert.ok(row.foreign.trim(), `missing foreign value in ${row.id}`);
        assert.ok(row.german.trim(), `missing German value in ${row.id}`);
        assert.ok(row.unit.trim(), `missing unit in ${row.id}`);
        assert.match(row.audio, new RegExp(`^assets/audio/vocab/en-6/${row.id}\\.mp3$`));
    }
    const units = [...new Set(english6.map(row => row.unit))];
    assert.equal(units[0], 'Welcome back to Brighton');
    const tenMinuteWalk = english6.filter(row => row.page === 302 && row.foreign === 'a ten-minute walk');
    assert.equal(tenMinuteWalk.length, 1);
    assert.equal(tenMinuteWalk[0].german, 'ein zehnminütiger Spaziergang');
    assert.equal(english6.some(row => row.page === 297 && ['fought', 'held out', 'paid'].includes(row.foreign)), false);
    assert.equal(english6.some(row => row.page === 304 && row.foreign === 'hung up'), false);
});

test('unicode writing tokenizer keeps French letters playable', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const tokens = context.window.VocabUtils.tokenizeAnswer('(to) préférer sth. – œuvre');
    const letters = Array.from(tokens).filter(token => token.type === 'letter').map(token => token.text).join('');
    assert.equal(letters, 'préférerœuvre');
    assert.ok(Array.from(tokens).some(token => token.type === 'fixed' && token.text === 'sth.'));
});

test('answer choices become compact only when count or text volume requires it', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const density = context.window.VocabUtils.getOptionDensity;
    assert.equal(density(['cat', 'dog', 'owl', 'fox']), 'normal');
    assert.equal(density(['one', 'two', 'three', 'four', 'five', 'six']), 'dense');
    assert.equal(density([
        '(to) blow, blew, blown',
        'awful',
        '(to) forget',
        '(to) throw',
        'centre',
        '(to) log out (of a website)',
        '(to) understand, understood'
    ]), 'very-dense');
});

test('long vocabulary prompts use smaller speech-bubble text', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const density = context.window.VocabUtils.getWordBubbleDensity;
    assert.equal(density('die Waffe'), 'normal');
    assert.equal(density('Essen zum Mitnehmen; Restaurant/Imbissgeschäft, das auch Essen zum Mitnehmen verkauft'), 'long');
    assert.equal(density('sich drehen; sich umdrehen; ausschalten ... einschalten; (nach) links/rechts abbiegen; lauter stellen; dunkel werden'), 'very-long');
});

test('mission planning teaches three new words and fills the rest with known words', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    const vocabulary = Array.from({ length: 18 }, (_, index) => ({
        id: `word-${index + 1}`,
        known: index < 8
    }));
    const targets = Array.from(utilities.createMissionTargetSet(vocabulary, {
        targetSize: 12,
        newWordLimit: 3,
        isKnown: vocab => vocab.known,
        random: () => 0.25
    }));

    assert.equal(targets.length, 11, 'only eight known words are available to fill the mission');
    assert.equal(targets.filter(vocab => !vocab.known).length, 3);
    assert.equal(targets.filter(vocab => vocab.known).length, 8);
    assert.equal(new Set(targets.map(vocab => vocab.id)).size, targets.length);

    const lastTarget = targets[0];
    const securedIds = targets.slice(1).map(vocab => vocab.id);
    const next = utilities.pickMissionVocabulary(targets, securedIds, lastTarget.id, () => 0);
    assert.notEqual(next.id, lastTarget.id, 'mission word repeated without a spacer');
});

test('book units and parts become stable mission districts', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    const vocabulary = [
        { id: 'a', unit: 'Unit 1: Holiday stories', part: 'Part A' },
        { id: 'b', unit: 'Unit 1: Holiday stories', part: 'Part A' },
        { id: 'c', unit: 'Unit 1: Holiday stories', part: 'Part B' },
        { id: 'd', unit: 'Unit 2: Shopping', part: 'Part A' }
    ];
    const districts = Array.from(utilities.createVocabularyDistricts(vocabulary, 'en-6'));

    assert.equal(districts.length, 3);
    assert.deepEqual(
        districts.map(district => [district.label, district.subtitle, district.vocabCount]),
        [['Unit 1', 'Part A', 2], ['Unit 1', 'Part B', 1], ['Unit 2', 'Part A', 1]]
    );
    assert.equal(utilities.pickMissionDistrict(vocabulary.slice(0, 3), 'en-6').subtitle, 'Part A');

    const clearedPreferred = districts[0];
    const nextDistrict = utilities.pickNextMissionDistrict(
        districts,
        clearedPreferred,
        [clearedPreferred.id],
        () => 0
    );
    assert.equal(nextDistrict.id, districts[1].id, 'an uncleared district should become the next target');
    assert.equal(
        utilities.pickNextMissionDistrict(districts, districts[2], [clearedPreferred.id], () => 0.99).id,
        districts[1].id,
        'the earliest uncleared district wins over a later preferred or random district'
    );
});

test('mission corrections return after two to four spacer encounters', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    assert.deepEqual(
        { ...utilities.createCorrectionSchedule(7, () => 0) },
        { spacerCount: 2, dueEncounter: 10 }
    );
    assert.deepEqual(
        { ...utilities.createCorrectionSchedule(7, () => 0.5) },
        { spacerCount: 3, dueEncounter: 11 }
    );
    assert.deepEqual(
        { ...utilities.createCorrectionSchedule(7, () => 0.999999) },
        { spacerCount: 4, dueEncounter: 12 }
    );

    const corrections = [
        { id: 'later', dueEncounter: 12, createdOrder: 1, resolved: false },
        { id: 'first', dueEncounter: 10, createdOrder: 0, resolved: false }
    ];
    assert.equal(utilities.pickDueCorrection(corrections, 9), null);
    assert.equal(utilities.pickDueCorrection(corrections, 10).id, 'first');
    assert.equal(utilities.pickDueCorrection(corrections, 9, true).id, 'first');
});

test('marked mission words stay out of random spacer encounters', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    const targets = [
        { id: 'marked' },
        { id: 'spacer-a' },
        { id: 'spacer-b' }
    ];
    const picked = utilities.pickMissionVocabulary(
        targets,
        new Set(),
        '',
        () => 0,
        new Set(['marked'])
    );
    assert.equal(picked.id, 'spacer-a');
});

test('mission rewards make liberation, survival and rescue streaks meaningfully attractive', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    const perfectReward = { ...utilities.calculateMissionReward({
        answerXp: 120,
        securedCount: 12,
        targetCount: 12,
        recoveredCorrections: 0,
        hearts: 3,
        totalAttempts: 12,
        correctAttempts: 12,
        currentMissionStreak: 2,
        districtAlreadyCleared: false
    }) };
    assert.deepEqual(perfectReward, {
        answerXp: 120,
        completionBonusXp: 120,
        recoveryBonusXp: 0,
        survivalBonusXp: 75,
        liberationBonusXp: 100,
        streakBonusXp: 60,
        totalXp: 475,
        securedCount: 12,
        recoveredCorrections: 0,
        completed: true,
        perfect: true,
        medal: 'gold'
    });

    const recoveredReward = { ...utilities.calculateMissionReward({
        answerXp: 140,
        securedCount: 12,
        targetCount: 12,
        recoveredCorrections: 2,
        hearts: 2,
        totalAttempts: 16,
        correctAttempts: 14,
        currentMissionStreak: 0,
        districtAlreadyCleared: true
    }) };
    assert.equal(recoveredReward.completionBonusXp, 120);
    assert.equal(recoveredReward.recoveryBonusXp, 50);
    assert.equal(recoveredReward.survivalBonusXp, 40);
    assert.equal(recoveredReward.liberationBonusXp, 25);
    assert.equal(recoveredReward.streakBonusXp, 20);
    assert.equal(recoveredReward.totalXp, 395);
    assert.equal(recoveredReward.perfect, false);
    assert.equal(recoveredReward.medal, 'silver');
});

test('rescue career persists completed missions, medals, rescued words and perfect missions', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const utilities = context.window.VocabUtils;
    const migrated = { ...utilities.normalizeRescueCareer({ missionsCompleted: 2 }) };
    assert.deepEqual({ ...migrated.medals }, { gold: 0, silver: 0, bronze: 0 });
    assert.equal(migrated.rescuedWords, 0);

    const afterGold = utilities.addMissionToRescueCareer(migrated, {
        completed: true,
        medal: 'gold',
        perfect: true,
        securedCount: 12,
        recoveredCorrections: 0,
        districtId: 'en-6:Unit%201:Part%20A'
    });
    assert.equal(afterGold.missionsCompleted, 3);
    assert.equal(afterGold.medals.gold, 1);
    assert.equal(afterGold.rescuedWords, 12);
    assert.equal(afterGold.perfectMissions, 1);
    assert.equal(afterGold.currentStreak, 1);
    assert.equal(afterGold.bestStreak, 1);
    assert.deepEqual(Array.from(afterGold.clearedDistricts), ['en-6:Unit%201:Part%20A']);

    const afterIncomplete = utilities.addMissionToRescueCareer(afterGold, {
        completed: false,
        medal: 'gold',
        perfect: false,
        securedCount: 8,
        recoveredCorrections: 2
    });
    assert.equal(afterIncomplete.missionsCompleted, 3);
    assert.equal(afterIncomplete.medals.gold, 1);
    assert.equal(afterIncomplete.rescuedWords, 20);
    assert.equal(afterIncomplete.correctionsRecovered, 2);
    assert.equal(afterIncomplete.clearedDistricts.length, 1);
    assert.equal(afterIncomplete.currentStreak, 0);
    assert.equal(afterIncomplete.bestStreak, 1);
});

test('a first mission contains exactly three entirely new words', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const vocabulary = Array.from({ length: 20 }, (_, index) => ({ id: `new-${index + 1}` }));
    const targets = Array.from(context.window.VocabUtils.createMissionTargetSet(vocabulary, {
        targetSize: 12,
        newWordLimit: 3,
        isKnown: () => false,
        random: () => 0.5
    }));
    assert.equal(targets.length, 3);
});

test('learning-path filter segments preserve colons in class-6 unit names', () => {
    const context = evaluateScripts(['js/vocab_utils.js']);
    const unit = 'Unit 1: Holiday stories';
    const encoded = context.window.VocabUtils.encodeFilterSegment(unit);
    assert.equal(encoded, 'Unit%201%3A%20Holiday%20stories');
    assert.equal(context.window.VocabUtils.decodeFilterSegment(encoded), unit);
});

test('legacy English leaderboard categories normalize to English 5', () => {
    const context = evaluateScripts(['js/leaderboard.js'], {
        document: {
            addEventListener() {},
            getElementById() { return null; }
        }
    });
    assert.equal(context.normalizeCategory('Englisch: Unit 1'), 'Englisch 5: Unit 1');
    assert.equal(context.getCourseFromCategory('Englisch: Unit 1'), 'Englisch 5');
    assert.equal(context.getCourseFromCategory('Englisch 6: Unit 1'), 'Englisch 6');
});

test('leaderboard learning paths are compact and sorted by class before path', () => {
    const context = evaluateScripts(['js/leaderboard.js'], {
        document: {
            addEventListener() {},
            getElementById() { return null; }
        }
    });
    assert.equal(context.getGradeFromCategory('Englisch: Unit 3'), '5');
    assert.equal(context.getGradeFromCategory('Englisch 6: Unit 1'), '6');
    assert.equal(
        context.formatLearningPathLabel('Englisch 6: Unit 1, Unit 2, Unit 3 - Mix, Welcome back to Brighton'),
        'U1 · U2 · U3 (Mix) · Welcome back'
    );
    const categories = [
        'Englisch 6: Unit 1',
        'Englisch 5: Unit 4',
        'Englisch 5: Unit 2'
    ];
    assert.deepEqual(
        Array.from(categories.sort(context.compareLeaderboardCategories)),
        ['Englisch 5: Unit 2', 'Englisch 5: Unit 4', 'Englisch 6: Unit 1']
    );
});

test('photo manifest maps exactly 39 photos to pages 285 through 318', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/vocab_import/class6_pages.json'), 'utf8'));
    assert.deepEqual(manifest.pages.map(item => item.page), Array.from({ length: 34 }, (_, i) => 285 + i));
    const photoCount = manifest.pages.reduce((count, item) => count + 1 + (item.alternatives || []).length, 0);
    assert.equal(photoCount, 39);
});
