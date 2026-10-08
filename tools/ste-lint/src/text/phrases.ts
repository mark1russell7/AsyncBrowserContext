import { isWord, normalizeWord, type Token } from "./tokens.js";

export type PhraseMatcherOptions = {
    /** Match the case of each letter. For example, the name "Event Timing" must not match "event timing". */
    readonly caseSensitive? : boolean;
};

/**
 * A set of words and multi-word phrases. A phrase matches consecutive word
 * tokens, without case by default. Punctuation and placeholders between the
 * words stop a match.
 */
export class PhraseMatcher<T = true> {
    private readonly byFirstWord = new Map<string, Array<{ readonly words : readonly string[]; readonly value : T }>>();
    private readonly caseSensitive : boolean;

    constructor(options : PhraseMatcherOptions = {}) {
        this.caseSensitive = options.caseSensitive ?? false;
    }

    private key(text : string) : string {
        return this.caseSensitive ? text.replace(/[’‘]/g, "'") : normalizeWord(text);
    }

    /** This method adds a phrase. A later phrase with the same words replaces the earlier one. */
    add(phrase : string, value : T) : void {
        const words = phrase.split(/\s+/).filter((word) => word.length > 0).map((word) => this.key(word));
        if (words.length === 0) return;
        const first = words[0]!;
        const list = this.byFirstWord.get(first) ?? [];
        const existing = list.findIndex((entry) => entry.words.join(" ") === words.join(" "));
        if (existing >= 0) list.splice(existing, 1);
        list.push({ words, value });
        list.sort((a, b) => b.words.length - a.words.length);
        this.byFirstWord.set(first, list);
    }

    /** The longest phrase that starts at `tokens[index]`, or null. */
    match(tokens : readonly Token[], index : number) : { readonly length : number; readonly value : T } | null {
        const first = tokens[index];
        if (!isWord(first)) return null;
        const candidates = this.byFirstWord.get(this.key(first.text));
        if (candidates === undefined) return null;
        for (const candidate of candidates) {
            let matched = true;
            for (let k = 1; k < candidate.words.length; k++) {
                const token = tokens[index + k];
                if (!isWord(token) || this.key(token.text) !== candidate.words[k]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return { length : candidate.words.length, value : candidate.value };
        }
        return null;
    }

    /** The number of tokens in the longest phrase that starts at `tokens[index]`, or 0. */
    longestMatch(tokens : readonly Token[], index : number) : number {
        return this.match(tokens, index)?.length ?? 0;
    }

    /** True when the matcher has no phrases. */
    get empty() : boolean {
        return this.byFirstWord.size === 0;
    }
}

/** The lower-case words of a phrase. */
export function splitPhrase(phrase : string) : string[] {
    return normalizeWord(phrase).split(/\s+/).filter((word) => word.length > 0);
}
