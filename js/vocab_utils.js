window.VocabUtils = Object.freeze({
    encodeFilterSegment(value) {
        return encodeURIComponent(String(value));
    },

    decodeFilterSegment(value) {
        return decodeURIComponent(String(value));
    },

    getOptionDensity(options) {
        const labels = Array.from(options || [], option => String(option || '').trim());
        const totalCharacters = labels.reduce((sum, label) => sum + label.length, 0);
        const longestLabel = labels.reduce((maximum, label) => Math.max(maximum, label.length), 0);

        if (
            totalCharacters >= 135
            || (labels.length >= 7 && (totalCharacters >= 90 || longestLabel >= 24))
        ) {
            return 'very-dense';
        }
        if (labels.length >= 6 || totalCharacters >= 70 || longestLabel >= 28) {
            return 'dense';
        }
        return 'normal';
    },

    getWordBubbleDensity(text) {
        const textLength = Array.from(String(text || '').trim()).length;
        if (textLength > 100) return 'very-long';
        if (textLength > 70) return 'long';
        return 'normal';
    },

    getVocabularyDistrict(vocab, courseId = '') {
        const unit = String(vocab?.unit || 'Ohne Unit').trim() || 'Ohne Unit';
        const part = String(vocab?.part || 'Basis').trim() || 'Basis';
        const shortUnit = unit.match(/Unit\s*\d+/i)?.[0] || unit.replace(/^Welcome back to\s+/i, 'Welcome ');
        const scope = String(courseId || 'course');
        return {
            id: [scope, unit, part].map(value => encodeURIComponent(value)).join(':'),
            unit,
            part,
            label: shortUnit,
            subtitle: part
        };
    },

    createVocabularyDistricts(vocabulary, courseId = '') {
        const districts = new Map();
        for (const vocab of Array.from(vocabulary || [])) {
            const district = this.getVocabularyDistrict(vocab, courseId);
            if (!districts.has(district.id)) {
                districts.set(district.id, { ...district, vocabCount: 0 });
            }
            districts.get(district.id).vocabCount++;
        }
        return [...districts.values()];
    },

    pickMissionDistrict(targetWords, courseId = '') {
        const counts = new Map();
        const firstSeen = new Map();
        Array.from(targetWords || []).forEach((vocab, index) => {
            const district = this.getVocabularyDistrict(vocab, courseId);
            counts.set(district.id, (counts.get(district.id) || 0) + 1);
            if (!firstSeen.has(district.id)) firstSeen.set(district.id, { district, index });
        });
        return [...firstSeen.values()]
            .sort((left, right) => {
                const countDifference = (counts.get(right.district.id) || 0) - (counts.get(left.district.id) || 0);
                return countDifference || left.index - right.index;
            })[0]?.district || null;
    },

    pickNextMissionDistrict(districts, preferredDistrict, clearedDistrictIds = []) {
        const availableDistricts = Array.from(districts || []);
        const cleared = new Set(Array.from(clearedDistrictIds || [], String));
        const nextUnclearedDistrict = availableDistricts.find(district => !cleared.has(district.id));
        if (nextUnclearedDistrict) return nextUnclearedDistrict;
        if (preferredDistrict && availableDistricts.some(district => district.id === preferredDistrict.id)) {
            return preferredDistrict;
        }
        return availableDistricts[0] || null;
    },

    createMissionTargetSet(vocabulary, options = {}) {
        const requestedTargetSize = Number(options.targetSize);
        const requestedNewWordLimit = Number(options.newWordLimit);
        const targetSize = Number.isFinite(requestedTargetSize) && requestedTargetSize > 0
            ? Math.floor(requestedTargetSize)
            : 12;
        const newWordLimit = Number.isFinite(requestedNewWordLimit) && requestedNewWordLimit >= 0
            ? Math.floor(requestedNewWordLimit)
            : 3;
        const isKnown = typeof options.isKnown === 'function' ? options.isKnown : () => false;
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const uniqueVocabulary = [];
        const seenIds = new Set();

        for (const vocab of Array.from(vocabulary || [])) {
            const id = String(vocab?.id || '');
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);
            uniqueVocabulary.push(vocab);
        }

        function shuffled(values) {
            const result = [...values];
            for (let index = result.length - 1; index > 0; index--) {
                const swapIndex = Math.floor(random() * (index + 1));
                [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
            }
            return result;
        }

        const knownWords = shuffled(uniqueVocabulary.filter(isKnown));
        const newWords = shuffled(uniqueVocabulary.filter(vocab => !isKnown(vocab)));
        const selectedNewWords = newWords.slice(0, Math.min(newWordLimit, newWords.length));
        const selectedKnownWords = knownWords.slice(0, Math.max(0, targetSize - selectedNewWords.length));

        return shuffled([...selectedKnownWords, ...selectedNewWords]).slice(0, targetSize);
    },

    pickMissionVocabulary(targetWords, securedIds, lastVocabId, random = Math.random, excludedIds = []) {
        const excluded = excludedIds instanceof Set ? excludedIds : new Set(excludedIds || []);
        const targets = Array.from(targetWords || []).filter(vocab => !excluded.has(vocab.id));
        if (targets.length === 0) return null;
        const secured = securedIds instanceof Set ? securedIds : new Set(securedIds || []);
        const unsecured = targets.filter(vocab => !secured.has(vocab.id));
        let candidates = unsecured.filter(vocab => vocab.id !== lastVocabId);

        // When only the just-seen target remains, insert a previously secured
        // spacer word so a vocabulary item is never asked twice in a row.
        if (candidates.length === 0 && unsecured.length > 0) {
            candidates = targets.filter(vocab => vocab.id !== lastVocabId);
        }
        if (candidates.length === 0) candidates = unsecured.length > 0 ? unsecured : targets;

        return candidates[Math.floor(random() * candidates.length)] || null;
    },

    createCorrectionSchedule(currentEncounter, random = Math.random) {
        const encounter = Number.isFinite(Number(currentEncounter))
            ? Math.max(0, Math.floor(Number(currentEncounter)))
            : 0;
        const randomValue = Math.min(0.999999, Math.max(0, Number(random()) || 0));
        const spacerCount = 2 + Math.floor(randomValue * 3);
        return {
            spacerCount,
            dueEncounter: encounter + spacerCount + 1
        };
    },

    pickDueCorrection(corrections, nextEncounter, force = false) {
        const pending = Array.from(corrections || [])
            .filter(entry => entry && !entry.resolved)
            .sort((left, right) => {
                const dueDifference = Number(left.dueEncounter || 0) - Number(right.dueEncounter || 0);
                if (dueDifference !== 0) return dueDifference;
                return Number(left.createdOrder || 0) - Number(right.createdOrder || 0);
            });
        if (pending.length === 0) return null;
        if (force) return pending[0];
        return pending.find(entry => Number(entry.dueEncounter || 0) <= Number(nextEncounter || 0)) || null;
    },

    calculateMissionReward(result = {}) {
        const answerXp = Math.max(0, Math.floor(Number(result.answerXp) || 0));
        const securedCount = Math.max(0, Math.floor(Number(result.securedCount) || 0));
        const targetCount = Math.max(0, Math.floor(Number(result.targetCount) || 0));
        const recoveredCorrections = Math.max(0, Math.floor(Number(result.recoveredCorrections) || 0));
        const hearts = Math.max(0, Math.floor(Number(result.hearts) || 0));
        const totalAttempts = Math.max(0, Math.floor(Number(result.totalAttempts) || 0));
        const correctAttempts = Math.max(0, Math.floor(Number(result.correctAttempts) || 0));
        const currentMissionStreak = Math.max(0, Math.floor(Number(result.currentMissionStreak) || 0));
        const districtAlreadyCleared = Boolean(result.districtAlreadyCleared);
        const completed = targetCount > 0 && securedCount >= targetCount;
        const completionBonusXp = completed ? 120 : 0;
        const recoveryBonusXp = recoveredCorrections * 25;
        const survivalBonusXp = completed ? (hearts >= 3 ? 75 : hearts === 2 ? 40 : 20) : 0;
        const liberationBonusXp = completed ? (districtAlreadyCleared ? 25 : 100) : 0;
        const streakBonusXp = completed ? Math.min(100, (currentMissionStreak + 1) * 20) : 0;
        const perfect = completed
            && hearts >= 3
            && totalAttempts === correctAttempts
            && recoveredCorrections === 0;

        return {
            answerXp,
            completionBonusXp,
            recoveryBonusXp,
            survivalBonusXp,
            liberationBonusXp,
            streakBonusXp,
            totalXp: answerXp + completionBonusXp + recoveryBonusXp + survivalBonusXp + liberationBonusXp + streakBonusXp,
            securedCount,
            recoveredCorrections,
            completed,
            perfect,
            medal: hearts >= 3 ? 'gold' : hearts === 2 ? 'silver' : 'bronze'
        };
    },

    normalizeRescueCareer(value = {}) {
        const medals = value && typeof value.medals === 'object' ? value.medals : {};
        return {
            missionsCompleted: Math.max(0, Math.floor(Number(value.missionsCompleted) || 0)),
            medals: {
                gold: Math.max(0, Math.floor(Number(medals.gold) || 0)),
                silver: Math.max(0, Math.floor(Number(medals.silver) || 0)),
                bronze: Math.max(0, Math.floor(Number(medals.bronze) || 0))
            },
            rescuedWords: Math.max(0, Math.floor(Number(value.rescuedWords) || 0)),
            perfectMissions: Math.max(0, Math.floor(Number(value.perfectMissions) || 0)),
            correctionsRecovered: Math.max(0, Math.floor(Number(value.correctionsRecovered) || 0)),
            currentStreak: Math.max(0, Math.floor(Number(value.currentStreak) || 0)),
            bestStreak: Math.max(0, Math.floor(Number(value.bestStreak) || 0)),
            clearedDistricts: Array.isArray(value.clearedDistricts)
                ? [...new Set(value.clearedDistricts.map(String).filter(Boolean))]
                : []
        };
    },

    addMissionToRescueCareer(currentCareer, missionReward) {
        const career = this.normalizeRescueCareer(currentCareer);
        const reward = missionReward || {};
        career.rescuedWords += Math.max(0, Math.floor(Number(reward.securedCount) || 0));
        career.correctionsRecovered += Math.max(0, Math.floor(Number(reward.recoveredCorrections) || 0));

        if (reward.completed) {
            career.missionsCompleted++;
            career.currentStreak++;
            career.bestStreak = Math.max(career.bestStreak, career.currentStreak);
            const medal = ['gold', 'silver', 'bronze'].includes(reward.medal) ? reward.medal : 'bronze';
            career.medals[medal]++;
            if (reward.perfect) career.perfectMissions++;
            const districtId = String(reward.districtId || '');
            if (districtId && !career.clearedDistricts.includes(districtId)) {
                career.clearedDistricts.push(districtId);
            }
        } else {
            career.currentStreak = 0;
        }
        return career;
    },

    tokenizeAnswer(answer) {
        answer = String(answer || '').normalize('NFC');
        const tokens = [];
        let index = 0;

        while (index < answer.length) {
            let matchedFiller = false;
            const fillers = ['sb.', 'sth.', 'sb', 'sth', '...'];
            for (const filler of fillers) {
                if (!answer.startsWith(filler, index)) continue;
                const nextCharacter = answer[index + filler.length];
                if (!nextCharacter || !/\p{L}/u.test(nextCharacter)) {
                    tokens.push({ type: 'fixed', text: filler });
                    index += filler.length;
                    matchedFiller = true;
                    break;
                }
            }
            if (matchedFiller) continue;

            if (answer[index] === '(') {
                const end = answer.indexOf(')', index);
                if (end !== -1) {
                    tokens.push({ type: 'fixed', text: answer.substring(index, end + 1) });
                    index = end + 1;
                    continue;
                }
            }

            const character = String.fromCodePoint(answer.codePointAt(index));
            tokens.push({
                type: /\p{L}/u.test(character) ? 'letter' : 'fixed',
                text: character
            });
            index += character.length;
        }
        return tokens;
    }
});
