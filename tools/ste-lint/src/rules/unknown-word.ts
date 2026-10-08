import { isGlossaryWord } from "../lexicon.js";
import { nextCounted } from "../text/grammar.js";
import { isAbbreviation, isCapitalized, isIdentifierLike, isNumber, isWord } from "../text/tokens.js";
import { coveredByPhrases } from "./ing-verb.js";
import { tokenRange, type Rule } from "./rule.js";

/**
 * This rule is active only when a local dictionary is configured. It does
 * not examine numbers, abbreviations, words that look like code or glossary
 * terms. It also does not examine a word with a capital letter after the
 * start of a sentence, because that word is possibly a proper noun.
 */
export const unknownWord : Rule = {
    id : "unknown-word",
    description : "Find words that are not in the local dictionary and not in the project glossary.",
    ste : "1.1, 1.5, 1.12",
    defaultSeverity : "warning",
    scope : "word",
    check(unit, context) {
        const { lexicon } = context;
        const dictionary = lexicon.dictionary;
        if (dictionary === null) return;
        for (const sentence of unit.sentences) {
            const tokens = sentence.tokens;
            const covered = coveredByPhrases(tokens, lexicon.glossaryPhrases);
            const first = nextCounted(tokens, 0);
            tokens.forEach((token, i) => {
                if (!isWord(token) || covered.has(i)) return;
                if (isNumber(token) || isAbbreviation(token) || isIdentifierLike(token) || /\d/.test(token.text)) return;
                if (i !== first && isCapitalized(token)) return;
                for (const part of token.lower.split("-")) {
                    if (part.length === 0 || isGlossaryWord(part, lexicon)) continue;
                    const lookup = dictionary.lookup(part);
                    if (lookup.status === "approved") continue;
                    const message = lookup.status === "not-approved"
                        ? `"${part}" is not an approved word. ${lookup.alternatives.length > 0 ? `Use ${lookup.alternatives.map((word) => `"${word}"`).join(" or ")}.` : "Use an approved word, or a different construction."}`
                        : `"${part}" is not in the dictionary or the project glossary. Use an approved word. If "${part}" is a technical term, add it to technicalNouns or technicalVerbs.`;
                    context.report({ ...tokenRange(tokens, i, i + 1), message });
                }
            });
        }
    },
};
