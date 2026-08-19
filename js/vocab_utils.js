window.VocabUtils = Object.freeze({
    encodeFilterSegment(value) {
        return encodeURIComponent(String(value));
    },

    decodeFilterSegment(value) {
        return decodeURIComponent(String(value));
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
