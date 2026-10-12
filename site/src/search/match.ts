import type { SearchEntry, SearchHeading } from "virtual:search-index";

export type { SearchEntry, SearchHeading };

/** One result: the page, the heading that matches best, and a part of the text around the first match. */
export type SearchResult = {
    entry : SearchEntry;
    score : number;
    heading : SearchHeading | undefined;
    snippet : { before : string; match : string; after : string } | undefined;
};

/**
 * A text in the form that the search compares: lower case, without marks.
 * `start[i]` and `end[i]` are the positions in the original text of the
 * character that gave the character `i` of `value`.
 */
export type NormalizedText = {
    value : string;
    start : number[];
    end : number[];
};

/** Lower case, compatibility forms ("ﬁ" gives "fi"), and no combining marks ("é" gives "e"). */
function normalizeCharacter(character : string) : string {
    return character.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * This function normalizes a text one character at a time. Thus, it knows the
 * position in the original text of each normalized character, also when the
 * normalization changes the length of the text.
 */
export function normalizeText(text : string) : NormalizedText {
    let value = "";
    const start : number[] = [];
    const end : number[] = [];
    let position = 0;
    for (const character of text) {
        const next = position + character.length;
        const code = character.charCodeAt(0);
        const normalized = code < 0x80 ? character.toLowerCase() : normalizeCharacter(character);
        value += normalized;
        for (let index = 0; index < normalized.length; index++) {
            start.push(position);
            end.push(next);
        }
        // A combining mark gives no character. It stays with the character before it, so a match does not cut it off.
        if (normalized === "" && end.length > 0) {
            const base = start[start.length - 1];
            for (let index = end.length - 1; index >= 0 && start[index] === base; index--) end[index] = next;
        }
        position = next;
    }
    return { value, start, end };
}

function normalize(text : string) : string {
    return normalizeText(text).value;
}

/** The search keeps the normalized text of each entry, because the entries do not change. */
const normalizedTexts = new WeakMap<SearchEntry, NormalizedText>();

function normalizedTextOf(entry : SearchEntry) : NormalizedText {
    let normalized = normalizedTexts.get(entry);
    if (normalized === undefined) {
        normalized = normalizeText(entry.text);
        normalizedTexts.set(entry, normalized);
    }
    return normalized;
}

function count(text : string, word : string, limit : number) : number {
    let total = 0;
    for (let index = text.indexOf(word); index >= 0 && total < limit; index = text.indexOf(word, index + word.length)) total++;
    return total;
}

/** This function gives the words of a query: lower case, without marks and punctuation. */
export function queryWords(query : string) : string[] {
    return normalize(query).split(/[^\p{L}\p{N}.$]+/u).filter(word => word.length > 0);
}

/**
 * The part of the original text around a match in the normalized text. The
 * match starts at `index` and has `length` normalized characters.
 */
export function snippetOf(text : string, normalized : NormalizedText, index : number, length : number) : NonNullable<SearchResult["snippet"]> {
    const from = normalized.start[index] ?? text.length;
    const to = normalized.end[index + length - 1] ?? from;
    return {
        before : `${from > 60 ? "…" : ""}${text.slice(Math.max(0, from - 60), from)}`,
        match : text.slice(from, to),
        after : `${text.slice(to, to + 100)}…`,
    };
}

/**
 * This function finds the pages that contain all the words of `query`. A
 * word at the start of a word of the title counts most. Then come a word in
 * the title, in a heading, in the description and in the text.
 */
export function search(entries : readonly SearchEntry[], query : string, limit = 8) : SearchResult[] {
    const words = queryWords(query);
    if (words.length === 0) return [];
    const results : SearchResult[] = [];
    for (const entry of entries) {
        const title = normalize(entry.title);
        const description = normalize(entry.description);
        const normalizedText = normalizedTextOf(entry);
        const text = normalizedText.value;
        const headings = entry.headings.map(heading => normalize(heading.text));
        let score = 0;
        let found = true;
        for (const word of words) {
            const inTitle = title.includes(word) ? (title.startsWith(word) || title.includes(` ${word}`) ? 12 : 8) : 0;
            const inHeading = headings.some(heading => heading.includes(word)) ? 5 : 0;
            const inDescription = description.includes(word) ? 3 : 0;
            const inText = count(text, word, 5);
            const wordScore = inTitle + inHeading + inDescription + inText;
            if (wordScore === 0) {
                found = false;
                break;
            }
            score += wordScore;
        }
        if (!found) continue;
        // The heading that contains the most words of the query.
        let heading : SearchHeading | undefined;
        let best = 0;
        entry.headings.forEach((candidate, index) => {
            const matches = words.filter(word => headings[index]?.includes(word)).length;
            if (matches > best) {
                best = matches;
                heading = candidate;
            }
        });
        const first = words.map(word => ({ word, index : text.indexOf(word) })).find(item => item.index >= 0);
        const snippet = first === undefined ? undefined : snippetOf(entry.text, normalizedText, first.index, first.word.length);
        results.push({ entry, score, heading, snippet });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
