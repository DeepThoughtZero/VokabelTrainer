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
