import { isGlossaryWord } from "../lexicon.js";
import { surface, tokenRange, type Rule } from "./rule.js";

export const wordList : Rule = {
    id : "word-list",
    description : "Find the words and phrases of the project word list, and give the plain-language words to use instead.",
    ste : "1.1, 9.1",
    defaultSeverity : "error",
    scope : "word",
    check(unit, context) {
        for (const sentence of unit.sentences) {
            const matches = context.wordList.find(sentence.tokens, {
                verbs : context.lexicon.verbs,
                skipWord : (word) => isGlossaryWord(word, context.lexicon),
            });
            for (const match of matches) {
                const found = surface(sentence.tokens, match.from, match.to);
                const { entry } = match;
                let message = entry.suggest === null ? `Remove "${found}".` : `Write ${entry.suggest}, not "${found}".`;
                if (entry.note !== null) message += ` ${entry.note}`;
                context.report({ ...tokenRange(sentence.tokens, match.from, match.to), message, severity : entry.severity });
            }
        }
    },
};
