import { isIngVerbUse, lemmas } from "../text/grammar.js";
import type { PhraseMatcher } from "../text/phrases.js";
import { isCounted, isWord, type Token } from "../text/tokens.js";
import { NON_VERB_ING } from "../text/words.js";
import { forEachToken, tokenRange, type Rule } from "./rule.js";

/** The token indices that a multi-word glossary phrase covers. */
export function coveredByPhrases(tokens : readonly Token[], phrases : PhraseMatcher) : Set<number> {
    const covered = new Set<number>();
    if (phrases.empty) return covered;
    for (let i = 0; i < tokens.length; i++) {
        const length = phrases.longestMatch(tokens, i);
        if (length > 1) for (let k = i; k < i + length; k++) covered.add(k);
    }
    return covered;
}

/** The base form of an -ing word when it is a known verb ("running" gives "run"), or null. */
export function baseForm(word : string, verbs : ReadonlySet<string>) : string | null {
    return lemmas(word).find((form) => form !== word && verbs.has(form)) ?? null;
}

export const ingVerb : Rule = {
    id : "ing-verb",
    description : "Find -ing forms used as verbs. Headings, technical nouns and allowed words are not examined.",
    ste : "3.2, 3.5",
    defaultSeverity : "warning",
    scope : "word",
    check(unit, context) {
        if (unit.kind === "heading") return;
        const { lexicon, wordList } = context;
        let covered : Set<number> = new Set();
        let current : readonly Token[] | null = null;
        forEachToken(unit, (tokens, i) => {
            if (tokens !== current) {
                current = tokens;
                covered = coveredByPhrases(tokens, lexicon.technicalNounPhrases);
            }
            const token = tokens[i]!;
            if (!isWord(token) || !isCounted(token)) return;
            const lower = token.lower;
            if (lower.length < 5 || !/^[a-z]+ing$/.test(lower)) return;
            if (NON_VERB_ING.has(lower) || lexicon.technicalNouns.has(lower) || lexicon.properNouns.has(lower) || lexicon.allowedWords.has(lower)) return;
            if (wordList.words.has(lower) || covered.has(i)) return;
            if (!isIngVerbUse(tokens, i)) return;
            const base = baseForm(lower, lexicon.verbs);
            const example = base === null ? "" : `, for example "when you ${base} ..." or "to ${base} ..."`;
            context.report({
                ...tokenRange(tokens, i, i + 1),
                message : `Do not use "${token.text}" as a verb. Use a simple tense, the infinitive or a noun${example}. If "${lower}" is a technical noun, add it to technicalNouns.`,
            });
        });
    },
};
