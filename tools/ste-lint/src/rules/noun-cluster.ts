import type { Lexicon } from "../lexicon.js";
import { isAbbreviation, isWord, type Token } from "../text/tokens.js";
import { surface, tokenRange, type Rule } from "./rule.js";

type NounUnit = {
    /** The number of tokens in the noun. A multi-word technical noun is one noun. */
    readonly length : number;
    readonly plural : boolean;
};

function singular(word : string) : string[] {
    const forms : string[] = [];
    if (word.endsWith("ies")) forms.push(word.slice(0, -3) + "y");
    if (word.endsWith("es")) forms.push(word.slice(0, -2));
    if (word.endsWith("s")) forms.push(word.slice(0, -1));
    return forms;
}

/** The noun at `tokens[index]`, or null when the token is not a known noun. */
function nounAt(tokens : readonly Token[], index : number, lexicon : Lexicon) : NounUnit | null {
    const token = tokens[index];
    if (token === undefined) return null;
    if (token.kind === "code") {
        const kind = token.placeholder?.kind;
        return kind === "code" || kind === "link" ? { length : 1, plural : false } : null;
    }
    if (!isWord(token)) return null;
    const phrase = lexicon.technicalNounPhrases.longestMatch(tokens, index);
    if (phrase > 1) return { length : phrase, plural : tokens[index + phrase - 1]!.lower.endsWith("s") };
    if (isAbbreviation(token)) return { length : 1, plural : /[a-z]s$/.test(token.text) };
    if (lexicon.nouns.has(token.lower)) return { length : 1, plural : false };
    if (singular(token.lower).some((form) => lexicon.nouns.has(form))) return { length : 1, plural : true };
    return null;
}

/**
 * The rule counts a group of nouns in sequence, with no article,
 * preposition or punctuation between them. Only these known nouns count:
 *
 * - Technical nouns and proper nouns from the glossary
 * - Nouns from the dictionary
 * - A built-in list of common software nouns
 * - Abbreviations and code.
 *
 * Only the last noun of a group can be plural. Without a part-of-speech
 * tagger, the rule cannot know if other words are nouns, so it does not
 * count them. Thus it misses some clusters, but it seldom reports a false
 * one.
 */
export const nounCluster : Rule = {
    id : "noun-cluster",
    description : "Find groups of more than 3 nouns in sequence (noun clusters).",
    ste : "2.1",
    defaultSeverity : "warning",
    scope : "word",
    check(unit, context) {
        const max = context.config.limits.nounClusterNouns;
        for (const sentence of unit.sentences) {
            const tokens = sentence.tokens;
            let i = 0;
            while (i < tokens.length) {
                let count = 0;
                let j = i;
                let plural = false;
                while (!plural) {
                    const noun = nounAt(tokens, j, context.lexicon);
                    if (noun === null) break;
                    count++;
                    j += noun.length;
                    plural = noun.plural;
                }
                if (count > max) {
                    context.report({
                        ...tokenRange(tokens, i, j),
                        message : `"${surface(tokens, i, j)}" has ${count} nouns in sequence. Use no more than ${max}. Use a preposition to divide the group, for example "the interval of the heartbeat" instead of "heartbeat interval".`,
                    });
                }
                i = count > 0 ? j : i + 1;
            }
        }
    },
};
