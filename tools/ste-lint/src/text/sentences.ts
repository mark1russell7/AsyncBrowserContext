/**
 * Sentence division and STE word counting (STE Rules 8.4 to 8.7).
 */

import type { PhraseMatcher } from "./phrases.js";
import { isCapitalized, isCounted, isNumber, isWord, type Token } from "./tokens.js";
import { NO_BREAK_ABBREVIATIONS, NUMBER_ABBREVIATIONS, UNITS } from "./words.js";

/** A range of tokens: `from` is the first token, `to` is the token after the last one. */
export type TokenRange = {
    readonly from : number;
    readonly to : number;
};

const TERMINALS = new Set([".", "!", "?", "...", "…"]);
const CLOSERS = new Set([")", "]", "}", "\"", "”", "’", "'"]);
const OPENERS = new Set(["(", "[", "\"", "“", "‘", "'"]);

function startsSentence(token : Token) : boolean {
    if (token.kind === "code") return true;
    if (token.kind === "punct") return OPENERS.has(token.text);
    return /^[\p{Lu}\p{N}]/u.test(token.text);
}

/** True when the period at `index` comes after an abbreviation, so it does not end the sentence. */
function isAbbreviationPeriod(tokens : readonly Token[], index : number) : boolean {
    const previous = tokens[index - 1];
    const token = tokens[index]!;
    if (token.text !== "." || !isWord(previous) || token.spaceBefore) return false;
    if (NO_BREAK_ABBREVIATIONS.has(previous.lower)) return true;
    // "Ms." is a title. In technical text, "ms" is the unit millisecond, and it can end a sentence.
    if (previous.text === "Ms") return true;
    if (NUMBER_ABBREVIATIONS.has(previous.lower) && isNumber(tokens[index + 1])) return true;
    // An initial, for example "J. Smith".
    return /^\p{Lu}$/u.test(previous.text) && isCapitalized(tokens[index + 1]);
}

/**
 * This function divides tokens into sentences. A sentence stops at `.`,
 * `!`, `?` or an ellipsis, when white space comes next. After the white
 * space, there must be a capital letter, a digit, a placeholder, or an
 * opening bracket or quote. Closing brackets and quotes after the stop stay
 * in the sentence. A period after an abbreviation, for example `e.g.`, does
 * not stop a sentence.
 */
export function splitSentences(tokens : readonly Token[]) : TokenRange[] {
    const ranges : TokenRange[] = [];
    let start = 0;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (token.kind !== "punct" || !TERMINALS.has(token.text)) continue;
        if (isAbbreviationPeriod(tokens, i)) continue;
        let end = i + 1;
        while (end < tokens.length) {
            const next = tokens[end]!;
            if (next.kind === "punct" && !next.spaceBefore && (CLOSERS.has(next.text) || TERMINALS.has(next.text))) end++;
            else break;
        }
        const next = tokens[end];
        if (next === undefined || (next.spaceBefore && startsSentence(next))) {
            ranges.push({ from : start, to : end });
            start = end;
            i = end - 1;
        }
    }
    if (start < tokens.length) ranges.push({ from : start, to : tokens.length });
    return ranges.filter((range) => tokens.slice(range.from, range.to).some(isCounted));
}

/** The pairs of matching parentheses that no other pair contains. A parenthesis without a partner is ignored. */
export function topLevelParentheses(tokens : readonly Token[]) : TokenRange[] {
    const stack : number[] = [];
    const pairs : TokenRange[] = [];
    tokens.forEach((token, index) => {
        if (token.kind !== "punct") return;
        if (token.text === "(") {
            stack.push(index);
        } else if (token.text === ")" && stack.length > 0) {
            const open = stack.pop()!;
            if (stack.length === 0) pairs.push({ from : open, to : index + 1 });
        }
    });
    return pairs;
}

export type WordCount = {
    /** The STE word count of the sentence. */
    readonly words : number;
    /** The tokens in each top-level parenthesis that has words. Each one is a separate sentence (STE Rule 8.5). */
    readonly parentheticals : readonly (readonly Token[])[];
};

export type CountOptions = {
    /** Multi-word proper nouns and technical nouns that count as one word. */
    readonly properNouns : PhraseMatcher;
};

/**
 * This function counts the words of a sentence as STE Rules 8.5 to 8.7
 * tell:
 *
 * - A placeholder (code span, link tag, URL, quoted text) is one word.
 * - A hyphenated word is one word.
 * - A number and its unit, for example `20 ms`, are one word.
 * - A multi-word proper noun from the glossary is one word.
 * - Two or more words with capital letters after the start of the
 *   sentence are a name or a title. They count as one word.
 * - Text in parentheses is one word. Its words make a separate sentence.
 */
export function countWords(tokens : readonly Token[], options : CountOptions) : WordCount {
    const parentheses = topLevelParentheses(tokens);
    const parentheticals : Token[][] = [];
    let words = 0;
    let first = true;
    let i = 0;
    while (i < tokens.length) {
        const group = parentheses.find((pair) => pair.from === i);
        if (group !== undefined) {
            const inner = tokens.slice(group.from + 1, group.to - 1);
            if (inner.some(isCounted)) {
                words++;
                parentheticals.push(inner);
                first = false;
            }
            i = group.to;
            continue;
        }
        const token = tokens[i]!;
        if (!isCounted(token)) {
            i++;
            continue;
        }
        words++;
        const phrase = options.properNouns.longestMatch(tokens, i);
        if (phrase > 1) {
            i += phrase;
        } else if (isNumber(token) && isWord(tokens[i + 1]) && UNITS.has(tokens[i + 1]!.lower)) {
            i += 2;
        } else if (!first && isCapitalized(token)) {
            i++;
            while (isCapitalized(tokens[i])) i++;
        } else {
            i++;
        }
        first = false;
    }
    return { words, parentheticals };
}
