import { isClauseStart, isVerbUse } from "../text/grammar.js";
import { PhraseMatcher, splitPhrase } from "../text/phrases.js";
import { isWord, type Token } from "../text/tokens.js";
import type { WordListEntry } from "../word-list.js";

export type WordListMatch = {
    readonly entry : WordListEntry;
    readonly from : number;
    readonly to : number;
};

/** Words before "see" that show the meaning "refer to": "(see X)", "For details, see X", "See also X". */
const REFERENCE_BEFORE = new Set(["also", "please", "and", "or", "then"]);
const REFERENCE_PUNCTUATION = new Set(["(", ",", ":", ";", "—", "–", "-"]);

/** True when "see" at `index` tells the reader to look at other text, not to see with the eyes. */
export function isReferenceSee(tokens : readonly Token[], index : number) : boolean {
    const previous = tokens[index - 1];
    if (previous === undefined || isClauseStart(tokens, index)) return true;
    if (previous.kind === "punct") return REFERENCE_PUNCTUATION.has(previous.text);
    return isWord(previous) && REFERENCE_BEFORE.has(previous.lower);
}

/** This class finds the entries of the word list in a sentence. */
export class WordListMatcher {
    private readonly phrases = new PhraseMatcher<WordListEntry>();
    /** The single words of the list. Other rules skip these words, so that a word gets one finding. */
    readonly words : ReadonlySet<string>;

    constructor(entries : readonly WordListEntry[]) {
        const words = new Set<string>();
        for (const entry of entries) {
            for (const match of entry.match) {
                this.phrases.add(match, entry);
                const parts = splitPhrase(match);
                if (parts.length === 1) words.add(parts[0]!);
            }
        }
        this.words = words;
    }

    /**
     * The matches in `tokens`. The longest phrase wins. `skipWord` tells the
     * matcher to ignore a single word, for example a glossary term.
     */
    find(tokens : readonly Token[], options : { readonly verbs : ReadonlySet<string>; readonly skipWord : (word : string) => boolean }) : WordListMatch[] {
        const matches : WordListMatch[] = [];
        let i = 0;
        while (i < tokens.length) {
            const match = this.phrases.match(tokens, i);
            if (match === null) {
                i++;
                continue;
            }
            const entry = match.value;
            const skip = (match.length === 1 && options.skipWord(tokens[i]!.lower))
                || (entry.verbOnly && !isVerbUse(tokens, i, { verbs : options.verbs }))
                || (entry.context === "reference" && !isReferenceSee(tokens, i));
            if (skip) {
                i++;
                continue;
            }
            matches.push({ entry, from : i, to : i + match.length });
            i += match.length;
        }
        return matches;
    }
}
