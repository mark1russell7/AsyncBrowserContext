/**
 * Grammar heuristics. The linter has no part-of-speech tagger. These
 * functions look at the words near a word to guess its function. Each
 * heuristic prefers to miss a problem than to report a false one.
 */

import { isCounted, isNumber, isWord, type Token } from "./tokens.js";
import {
    BE_FORMS,
    CLAUSE_STARTERS,
    CONDITION_MARKERS,
    CONJUNCTIONS,
    DETERMINERS,
    DO_FORMS,
    HAVE_FORMS,
    IRREGULAR_PARTICIPLES,
    LEADING_ADVERBS,
    MIDDLE_ADVERBS,
    MODALS,
    NOT_PARTICIPLE_ED,
    OBJECT_PRONOUNS,
    PARTICLES,
    PASSIVE_AUXILIARIES,
    PREPOSITIONS,
    SUBJECT_PRONOUNS,
} from "./words.js";

/**
 * The possible base forms of a word: the word itself, and the word without
 * the endings -s, -es, -ies, -ed, -d, -ied and -ing. The list can contain
 * forms that are not words. The callers look up each form in a word list.
 */
export function lemmas(word : string) : string[] {
    const forms = new Set<string>([word]);
    const add = (form : string) : void => {
        if (form.length >= 2) forms.add(form);
    };
    if (word.endsWith("'s")) add(word.slice(0, -2));
    if (word.endsWith("ies")) add(word.slice(0, -3) + "y");
    if (word.endsWith("es")) add(word.slice(0, -2));
    if (word.endsWith("s") && !word.endsWith("ss")) add(word.slice(0, -1));
    if (word.endsWith("ied")) add(word.slice(0, -3) + "y");
    if (word.endsWith("ed")) {
        const stem = word.slice(0, -2);
        add(stem);
        add(stem + "e");
        if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
    }
    if (word.endsWith("ing")) {
        const stem = word.slice(0, -3);
        add(stem);
        add(stem + "e");
        if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
        if (stem.endsWith("y")) add(stem.slice(0, -1) + "ie");
    }
    return [...forms];
}

/** True when one of the base forms of `word` is in `words`. */
export function hasLemmaIn(word : string, words : ReadonlySet<string>) : boolean {
    return lemmas(word).some((form) => words.has(form));
}

/** True when `word` can be a past participle: an irregular participle, or a word that ends in -ed. */
export function isParticiple(word : string) : boolean {
    if (IRREGULAR_PARTICIPLES.has(word)) return true;
    return /^[a-z]{2,}ed$/.test(word) && !NOT_PARTICIPLE_ED.has(word);
}

/** True for a word that is an auxiliary verb: a form of "be", "have" or "do", or a modal verb. */
export function isAuxiliary(token : Token | undefined) : boolean {
    return isWord(token) && (BE_FORMS.has(token.lower) || HAVE_FORMS.has(token.lower) || DO_FORMS.has(token.lower) || MODALS.has(token.lower));
}

/** The index of the next token that is a word or a placeholder, or -1. */
export function nextCounted(tokens : readonly Token[], from : number) : number {
    for (let i = from; i < tokens.length; i++) if (isCounted(tokens[i])) return i;
    return -1;
}

/** The previous token, or undefined at the start. */
function before(tokens : readonly Token[], index : number) : Token | undefined {
    return tokens[index - 1];
}

/** True when the token can start the object of a verb: a determiner, a pronoun, a number, a placeholder or an adverb. */
export function startsObject(token : Token | undefined) : boolean {
    if (token === undefined) return false;
    if (token.kind === "code") return true;
    if (!isWord(token)) return false;
    return DETERMINERS.has(token.lower)
        || OBJECT_PRONOUNS.has(token.lower)
        || isNumber(token)
        || token.lower.endsWith("ly")
        || ["whether", "if", "how", "what", "when", "where", "which", "why", "who"].includes(token.lower);
}

export type ImperativeOptions = {
    /** Base forms of verbs, for example the common verbs and the technical verbs of the glossary. */
    readonly verbs : ReadonlySet<string>;
};

/**
 * True when the sentence is an instruction (imperative). The heuristic:
 *
 * 1. Skip the adverbs at the start, for example "then", "first" and "please".
 * 2. If the sentence starts with a condition or purpose clause ("If ...,",
 *    "To ...,", "When ...,"), continue after the first comma.
 * 3. "Do not", "Never", "Make sure" and "Be sure" start an instruction.
 * 4. Otherwise, the first word must be the base form of a known verb. The
 *    next words must not show that the first word is a noun subject. Thus,
 *    the next word is not an auxiliary verb or "of". Also, the next two
 *    words are not a plural noun and a verb ("Test runs take 5 s").
 */
export function isInstruction(tokens : readonly Token[], options : ImperativeOptions) : boolean {
    let k = nextCounted(tokens, 0);
    if (k === -1) return false;
    const skipAdverbs = () : void => {
        while (k !== -1 && isWord(tokens[k]) && LEADING_ADVERBS.has(tokens[k]!.lower)) k = nextCounted(tokens, k + 1);
    };
    skipAdverbs();
    if (k === -1) return false;
    if (isWord(tokens[k]) && CLAUSE_STARTERS.has(tokens[k]!.lower)) {
        const comma = tokens.findIndex((token, index) => index > k && token.kind === "punct" && token.text === ",");
        if (comma === -1) return false;
        k = nextCounted(tokens, comma + 1);
        skipAdverbs();
        if (k === -1) return false;
    }
    const word = tokens[k];
    if (!isWord(word)) return false;
    const n1 = tokens[k + 1];
    const n2 = tokens[k + 2];
    if (word.lower === "never" || word.lower === "don't") return true;
    if (word.lower === "do" && isWord(n1) && n1.lower === "not") return true;
    if (word.lower === "make" && isWord(n1) && n1.lower === "sure") return true;
    if (word.lower === "be" && isWord(n1) && ["sure", "careful", "aware"].includes(n1.lower)) return true;
    if (!options.verbs.has(word.lower)) return false;
    if (isWord(n1)) {
        if (isAuxiliary(n1) || n1.lower === "of") return false;
        if (/[^s]s$/.test(n1.lower) && isWord(n2) && (isAuxiliary(n2) || options.verbs.has(n2.lower))) return false;
    }
    return true;
}

export type VerbUseOptions = {
    readonly verbs : ReadonlySet<string>;
};

/**
 * True when the word at `index` is likely a verb, not a noun or an
 * adjective. The heuristic is conservative. It is true only when the words
 * near the word show a verb. It looks at these words:
 *
 * - The word before. These words show a verb: "to", a modal verb, a form
 *   of "do", a subject pronoun, a form of "be" or "have" (for participles).
 * - The start of the sentence, for an imperative
 * - The word after, for an -s form: an object, for example "the", a
 *   pronoun, code or a number
 * - A determiner before the word, which shows a noun ("the call", "a run").
 */
export function isVerbUse(tokens : readonly Token[], index : number, options : VerbUseOptions) : boolean {
    const word = tokens[index];
    if (!isWord(word)) return false;
    const previous = before(tokens, index);
    const next = tokens[index + 1];
    const lower = word.lower;
    const previousLower = isWord(previous) ? previous.lower : null;

    if (previousLower !== null && (DETERMINERS.has(previousLower) || isNumber(previous))) return false;

    if (lower.endsWith("ing")) return isIngVerbUse(tokens, index);

    if ((lower.endsWith("ed") || isParticiple(lower)) && previousLower !== null && (PASSIVE_AUXILIARIES.has(previousLower) || HAVE_FORMS.has(previousLower))) return true;
    if (lower.endsWith("ed")) {
        const subject = (previousLower !== null && SUBJECT_PRONOUNS.has(previousLower)) || previous?.kind === "code";
        return subject && (startsObject(next) || (isWord(next) && PREPOSITIONS.has(next.lower)));
    }
    // An irregular participle such as "run" or "set" is also a base form, so the base form tests apply to it.

    if (previousLower !== null) {
        if (previousLower === "to" || MODALS.has(previousLower) || DO_FORMS.has(previousLower) || previousLower === "not") return true;
        if (["you", "we", "they", "i", "please", "and", "or", "then", "also", "always", "first"].includes(previousLower)) return true;
    }
    // A clause start, or an adverb at a clause start: "Run the tests", "Simply run the tests".
    const clauseStart = isClauseStart(tokens, index)
        || (previousLower !== null && LEADING_ADVERBS.has(previousLower) && isClauseStart(tokens, index - 1));
    if (clauseStart) {
        // "Run time" can be a noun, so a plain word after the verb is not sufficient.
        if (!options.verbs.has(lower)) return false;
        return startsObject(next) || (isWord(next) && (PREPOSITIONS.has(next.lower) || PARTICLES.has(next.lower)));
    }

    if (/[^s]s$/.test(lower)) {
        if (!lemmas(lower).some((form) => form !== lower && options.verbs.has(form))) return false;
        // After "it", "which" or "that", an -s form is a verb: "it runs", "which calls".
        if (previousLower !== null && SUBJECT_PRONOUNS.has(previousLower)) return true;
        const subjectBefore = previous !== undefined && (previous.kind === "code" || (isWord(previous) && !PREPOSITIONS.has(previous.lower) && !CONJUNCTIONS.has(previous.lower)));
        const objectAfter = startsObject(next) || (isWord(next) && (PREPOSITIONS.has(next.lower) || PARTICLES.has(next.lower)));
        return subjectBefore && objectAfter;
    }
    return false;
}

/**
 * True when the -ing word at `index` is a verb. The heuristic finds four
 * uses:
 *
 * - After a form of "be": "is running", "is still running"
 * - After a preposition, with an object: "by calling `stop()`", "after
 *   waiting for the worker"
 * - At the start of a clause, with an object: "Using the worker, ..."
 * - After a word that is not a determiner, with an object (a reduced
 *   clause): "a timer firing every 5 ms".
 *
 * A noun ("the timing") or an adjective before a noun ("existing code")
 * is not a verb use.
 */
export function isIngVerbUse(tokens : readonly Token[], index : number) : boolean {
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    const objectAfter = startsObject(next) || (isWord(next) && (PREPOSITIONS.has(next.lower) || PARTICLES.has(next.lower)));
    if (isWord(previous)) {
        if (BE_FORMS.has(previous.lower)) return true;
        const beforePrevious = tokens[index - 2];
        if (MIDDLE_ADVERBS.has(previous.lower) && isWord(beforePrevious) && BE_FORMS.has(beforePrevious.lower)) return true;
        if (PREPOSITIONS.has(previous.lower)) return objectAfter;
    }
    if (isClauseStart(tokens, index)) return startsObject(next);
    if (isWord(previous) && !DETERMINERS.has(previous.lower) && !CONJUNCTIONS.has(previous.lower)) return startsObject(next);
    return false;
}

/** True when the token is the first word of the sentence or the first word after a comma, colon or opening parenthesis. */
export function isClauseStart(tokens : readonly Token[], index : number) : boolean {
    for (let i = index - 1; i >= 0; i--) {
        const token = tokens[i]!;
        if (isCounted(token)) return false;
        if ([",", ":", "(", ";", "—", "–"].includes(token.text)) return true;
    }
    return true;
}

export type Passive = {
    /** The index of the first word of the construction: the modal verb, "has" in "has to be", or the form of "be". */
    readonly start : number;
    /** The index of the form of "be" or "get". */
    readonly auxiliary : number;
    /** The index of the past participle. */
    readonly participle : number;
    /** True when a modal verb or "has to", "needs to" or "is to" shows an obligation: "must be set". */
    readonly obligation : boolean;
    /** True when a modal verb or "to" comes before "be": "can be set", "to be set". */
    readonly modal : boolean;
    /** True when "by" comes after the participle. */
    readonly agent : boolean;
    /** True when a condition word ("if", "when", "make sure that") comes before, in the same clause. */
    readonly inCondition : boolean;
};

const OBLIGATION_MODALS = new Set(["must", "should", "shall", "mustn't", "shouldn't"]);

/** This function finds the passive constructions in a sentence: a form of "be" or "get" and a past participle. */
export function findPassives(tokens : readonly Token[]) : Passive[] {
    const passives : Passive[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (!isWord(token) || !PASSIVE_AUXILIARIES.has(token.lower)) continue;
        let j = i + 1;
        let skipped = 0;
        while (skipped < 2 && isWord(tokens[j]) && MIDDLE_ADVERBS.has(tokens[j]!.lower) && !isParticiple(tokens[j]!.lower)) {
            j++;
            skipped++;
        }
        const participle = tokens[j];
        if (!isWord(participle) || !isParticiple(participle.lower)) continue;
        const previous = isWord(tokens[i - 1]) ? tokens[i - 1]!.lower : null;
        const previous2 = isWord(tokens[i - 2]) ? tokens[i - 2]!.lower : null;
        const viaTo = previous === "to" && previous2 !== null && ["has", "have", "had", "need", "needs", "needed", "is", "are", "was", "were", "ought"].includes(previous2);
        const obligation = (previous !== null && OBLIGATION_MODALS.has(previous)) || viaTo;
        const modal = obligation || (previous !== null && (MODALS.has(previous) || previous === "to"));
        const after = tokens[j + 1];
        passives.push({
            start : viaTo ? i - 2 : modal ? i - 1 : i,
            auxiliary : i,
            participle : j,
            obligation,
            modal,
            agent : isWord(after) && after.lower === "by",
            inCondition : hasConditionBefore(tokens, i),
        });
        i = j;
    }
    return passives;
}

function hasConditionBefore(tokens : readonly Token[], index : number) : boolean {
    for (let i = index - 1; i >= 0; i--) {
        const token = tokens[i]!;
        if (token.kind === "punct" && [",", ";", ":"].includes(token.text)) return false;
        if (isWord(token) && CONDITION_MARKERS.has(token.lower)) return true;
    }
    return false;
}
