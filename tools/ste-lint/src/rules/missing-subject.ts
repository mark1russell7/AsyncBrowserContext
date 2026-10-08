import type { Lexicon } from "../lexicon.js";
import { isParticiple, nextCounted, startsObject } from "../text/grammar.js";
import { isCapitalized, isCounted, isWord, type Token } from "../text/tokens.js";
import { BE_FORMS, CONJUNCTIONS, DETERMINERS, HAVE_FORMS, MODALS, PREPOSITIONS, SUBJECT_PRONOUNS } from "../text/words.js";
import { tokenRange, type Rule } from "./rule.js";

/** Auxiliary verbs that start a sentence without a subject: "Is true when ...", "Can be null.". */
const AUXILIARY_STARTS = new Set(["is", "are", "was", "were", "has", "have", "had", "does", "can", "cannot", "must", "will", "should", "may", "might", "would", "could"]);

/** Words that end in -s but are not verbs. */
const NOT_VERBS = new Set([
    "this", "its", "always", "perhaps", "sometimes", "whereas", "unless", "plus", "thus", "yes", "less", "across",
    "towards", "afterwards", "besides", "nevertheless", "regardless", "various", "numerous", "previous", "analysis",
    "basis", "bias", "canvas", "status", "series", "species", "atlas", "alias", "chaos", "corpus", "focus", "bonus",
]);

/** Words after a participle that show a missing subject: "Called when ...", "Used by ...". */
const AFTER_PARTICIPLE = new Set([...PREPOSITIONS, "when", "if", "once", "only", "while", "as", "whenever", "unless"]);

function stems(word : string) : string[] {
    const forms = [word.slice(0, -1)];
    if (word.endsWith("es")) forms.push(word.slice(0, -2));
    if (word.endsWith("ies")) forms.push(word.slice(0, -3) + "y");
    return forms;
}

/** True when a comma comes later and a subject comes after it: "Based on X, the monitor ...". */
function hasLaterSubject(tokens : readonly Token[], from : number) : boolean {
    for (let i = from; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (token.kind !== "punct" || token.text !== ",") continue;
        const next = tokens[nextCounted(tokens, i + 1)];
        if (next === undefined) return false;
        return next.kind === "code" || isCapitalized(next) || (isWord(next) && (DETERMINERS.has(next.lower) || SUBJECT_PRONOUNS.has(next.lower)));
    }
    return false;
}

const PLURAL_AUXILIARIES = new Set(["are", "were", "have", "do", "don't", "aren't", "weren't", "can", "cannot", "must", "will"]);

/**
 * True when a verb for a plural subject comes later, after a noun:
 * "Samples at or above this value wait ...", "Values below zero are ...".
 * Then the first word is a plural noun, not a verb.
 */
function hasPluralVerbLater(tokens : readonly Token[], from : number, lexicon : Lexicon) : boolean {
    for (let i = from; i < tokens.length; i++) {
        const token = tokens[i]!;
        const previous = tokens[i - 1];
        if (!isWord(token) || !isWord(previous)) continue;
        if (DETERMINERS.has(previous.lower) || PREPOSITIONS.has(previous.lower) || MODALS.has(previous.lower) || previous.lower === "not") continue;
        if (PLURAL_AUXILIARIES.has(token.lower)) return true;
        if (lexicon.verbs.has(token.lower) && !token.lower.endsWith("s")) return true;
    }
    return false;
}

/** Relative pronouns. A word before one of them is a noun: "Tags whose content ...". */
const RELATIVE_PRONOUNS = new Set(["whose", "which", "who", "whom"]);

/**
 * True when the words after the first word show that the first word is a
 * plural noun, not a verb. These words show a noun:
 *
 * - An auxiliary verb, a conjunction or "of": "Values are ...", "Values of ..."
 * - "per" or a relative pronoun: "Samples per round", "Tags whose ..."
 * - A base form of a verb: "Monitors ask ..."
 * - A participle and a preposition: "Handles returned by ...".
 */
function isNounSubject(tokens : readonly Token[], index : number, lexicon : Lexicon) : boolean {
    const next = tokens[index + 1];
    if (!isWord(next)) return false;
    const lower = next.lower;
    if (BE_FORMS.has(lower) || MODALS.has(lower) || HAVE_FORMS.has(lower) || CONJUNCTIONS.has(lower) || lower === "of") return true;
    if (lower === "per" || RELATIVE_PRONOUNS.has(lower)) return true;
    const after = tokens[index + 2];
    const objectAfter = after === undefined || after.kind === "punct" || startsObject(after) || (isWord(after) && PREPOSITIONS.has(after.lower));
    if (lexicon.verbs.has(lower) && !lower.endsWith("s") && !DETERMINERS.has(lower) && objectAfter) return true;
    return isParticiple(lower) && isWord(after) && PREPOSITIONS.has(after.lower);
}

/** The message when the sentence at `tokens` starts without a subject, or null. */
export function missingSubject(tokens : readonly Token[], lexicon : Lexicon) : { index : number; message : string } | null {
    const k = nextCounted(tokens, 0);
    const first = tokens[k];
    if (!isWord(first) || !isCapitalized(first)) return null;
    const lower = first.lower;
    const next = tokens[k + 1];
    const last = [...tokens].reverse().find((token) => token.kind === "punct");
    if (AUXILIARY_STARTS.has(lower)) {
        if (last?.text === "?") return null;
        return { index : k, message : `This sentence has no subject. Write the subject before "${first.text}", for example "This value ${lower} ...".` };
    }
    if (/^[a-z]{3,}s$/.test(lower) && !/(ss|us|is|ous|ics|ness)$/.test(lower) && !NOT_VERBS.has(lower)) {
        const knownVerb = stems(lower).some((stem) => lexicon.verbs.has(stem));
        if (next?.text === "," || isNounSubject(tokens, k, lexicon)) return null;
        if (!knownVerb && !startsObject(next)) return null;
        if (isWord(next) && PREPOSITIONS.has(next.lower) && hasPluralVerbLater(tokens, k + 2, lexicon)) return null;
        const example = lower === "returns" ? "This function gives ..." : `This function ${lower} ...`;
        return { index : k, message : `"${first.text}" has no subject. Do not omit the subject. Write a full sentence, for example "${example}".` };
    }
    if (isParticiple(lower) && isWord(next) && AFTER_PARTICIPLE.has(next.lower) && !hasLaterSubject(tokens, k + 1)) {
        return { index : k, message : `"${first.text}" starts a sentence that has no subject. Write a full sentence with a subject in the active voice, for example "The monitor uses this value when ...".` };
    }
    return null;
}

/**
 * The rule examines the summary and the `@remarks` text of doc comments.
 * For example, "Returns the value." and "Called when the page is hidden."
 * omit the subject. Text after `@param` and `@returns`, and list items, can
 * be fragments, so the rule does not examine them.
 */
export const missingSubjectRule : Rule = {
    id : "missing-subject",
    description : "Find doc comment sentences that have no subject, for example \"Returns the value.\".",
    ste : "4.2",
    defaultSeverity : "error",
    scope : "sentence",
    check(unit, context) {
        if (unit.origin.source !== "tsdoc" || unit.origin.tsdocSection === "tag" || unit.list !== null) return;
        for (const sentence of unit.sentences) {
            if (!sentence.tokens.some(isCounted)) continue;
            const found = missingSubject(sentence.tokens, context.lexicon);
            if (found === null) continue;
            context.report({ ...tokenRange(sentence.tokens, found.index, found.index + 1), message : found.message });
        }
    },
};
