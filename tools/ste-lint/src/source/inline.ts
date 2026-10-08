/**
 * Inline normalization. This step changes the text of a block into "clean"
 * text that the tokenizer can read:
 *
 * - Each code span, `{@link ...}` tag, URL, MDX expression and quoted text
 *   becomes one placeholder character. STE Rule 8.6 counts quoted text and
 *   text in a different font as one word. The word rules do not examine the
 *   text in a placeholder.
 * - Link text stays. Link destinations, images, footnote references, HTML
 *   tags, JSX tags and emphasis markers go away.
 * - HTML entities become the characters that they show.
 *
 * Each character of the clean text keeps the file offset of its source
 * character, so findings point to the correct line and column.
 */

import { findBacktickRun } from "./blocks.js";
import type { Line } from "./lines.js";

/** The character that holds the place of a code span, link tag, URL or quoted text. */
export const PLACEHOLDER = "";

export type PlaceholderKind = "code" | "link" | "url" | "quote" | "expr";

export type Placeholder = {
    readonly kind : PlaceholderKind;
    /** The text in the placeholder, without its delimiters. */
    readonly text : string;
    /** The file offset of the first character. */
    readonly start : number;
    /** The file offset after the last character. */
    readonly end : number;
};

export type InlineText = {
    readonly clean : string;
    /** The file offset of each character of `clean`. */
    readonly offsets : readonly number[];
    /** The placeholders, by their index in `clean`. */
    readonly placeholders : ReadonlyMap<number, Placeholder>;
};

export type InlineOptions = {
    readonly mdx : boolean;
    readonly tsdoc : boolean;
};

// A map, not an object literal, so that "&constructor;" does not find an Object property.
const ENTITIES : ReadonlyMap<string, string> = new Map([
    ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"], ["nbsp", " "], ["mdash", "—"],
    ["ndash", "–"], ["hellip", "…"], ["copy", "©"], ["reg", "®"], ["trade", "™"],
    ["times", "×"], ["rarr", "→"], ["larr", "←"], ["harr", "↔"], ["rsquo", "’"],
    ["lsquo", "‘"], ["rdquo", "”"], ["ldquo", "“"], ["middot", "·"], ["bull", "•"],
    ["deg", "°"], ["micro", "µ"], ["plusmn", "±"], ["le", "≤"], ["ge", "≥"],
]);

/** HTML elements whose content is code, so the content becomes one placeholder. */
const CODE_ELEMENTS = new Set(["code", "kbd", "samp", "var", "tt"]);

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

class Builder {
    clean = "";
    readonly offsets : number[] = [];
    readonly placeholders = new Map<number, Placeholder>();

    constructor(private readonly raw : string, private readonly rawOffsets : readonly number[]) {}

    char(rawIndex : number) : void {
        this.emit(this.raw[rawIndex]!, rawIndex);
    }

    emit(text : string, rawIndex : number) : void {
        for (const char of text) {
            this.clean += char;
            this.offsets.push(this.rawOffsets[rawIndex]!);
        }
    }

    placeholder(kind : PlaceholderKind, text : string, rawStart : number, rawEnd : number) : void {
        this.placeholders.set(this.clean.length, {
            kind,
            text,
            start : this.rawOffsets[rawStart]!,
            end : this.rawOffsets[Math.max(rawStart, rawEnd - 1)]! + 1,
        });
        this.emit(PLACEHOLDER, rawStart);
    }
}

/** This function normalizes the inline content of a block. Refer to the module comment. */
export function normalizeInline(lines : readonly Line[], options : InlineOptions) : InlineText {
    let raw = "";
    const rawOffsets : number[] = [];
    lines.forEach((line, n) => {
        if (n > 0) {
            const previous = lines[n - 1]!;
            raw += "\n";
            rawOffsets.push(previous.offset + previous.text.length);
        }
        raw += line.text;
        for (let k = 0; k < line.text.length; k++) rawOffsets.push(line.offset + k);
    });
    const last = lines[lines.length - 1];
    rawOffsets.push(last === undefined ? 0 : last.offset + last.text.length);

    const builder = new Builder(raw, rawOffsets);
    scan(raw, 0, raw.length, builder, options);
    return { clean : builder.clean, offsets : builder.offsets, placeholders : builder.placeholders };
}

function isAlphanumeric(char : string | undefined) : boolean {
    return char !== undefined && ALPHANUMERIC.test(char);
}

function scan(raw : string, from : number, to : number, out : Builder, options : InlineOptions) : void {
    let i = from;
    while (i < to) {
        const char = raw[i]!;
        const next = raw[i + 1];

        if (char === "\\" && next !== undefined && i + 1 < to && ASCII_PUNCTUATION.test(next)) {
            out.char(i + 1);
            i += 2;
            continue;
        }

        if (char === "`") {
            let run = 1;
            while (raw[i + run] === "`") run++;
            const close = findBacktickRun(raw, i + run, run);
            if (close !== -1 && close + run <= to) {
                out.placeholder("code", raw.slice(i + run, close).trim(), i, close + run);
                i = close + run;
            } else {
                for (let k = 0; k < run; k++) out.char(i + k);
                i += run;
            }
            continue;
        }

        if (char === "<") {
            const end = scanAngle(raw, i, to, out);
            if (end !== -1) {
                i = end;
                continue;
            }
        }

        if (char === "{") {
            const end = scanBrace(raw, i, to, out, options);
            if (end !== -1) {
                i = end;
                continue;
            }
        }

        if (char === "!" && next === "[") {
            const end = linkEnd(raw, i + 1, to);
            if (end !== null) {
                i = end.end;
                continue;
            }
        }

        if (char === "[") {
            if (/^\[\^[^\]\s]+\]/.test(raw.slice(i, to))) {
                i = raw.indexOf("]", i) + 1;
                continue;
            }
            const end = linkEnd(raw, i, to);
            if (end !== null) {
                scan(raw, i + 1, end.textEnd, out, options);
                i = end.end;
                continue;
            }
        }

        if ((char === "h" || char === "w") && !isAlphanumeric(raw[i - 1])) {
            const url = /^(?:https?:\/\/|www\.)[^\s<>"`]*[^\s<>"`.,;:!?')\]]/.exec(raw.slice(i, to));
            if (url) {
                let text = url[0];
                // A ")" after the URL is part of it only when the URL has a "(" without a partner.
                const count = (pattern : RegExp) : number => (text.match(pattern) ?? []).length;
                while (raw[i + text.length] === ")" && i + text.length < to && count(/\(/g) > count(/\)/g)) text += ")";
                out.placeholder("url", text, i, i + text.length);
                i += text.length;
                continue;
            }
        }

        if (char === "*") {
            const before = raw[i - 1];
            const after = raw[i + 1];
            const spaced = (before === undefined || /\s/.test(before)) && (after === undefined || /\s/.test(after));
            if (spaced) out.char(i);
            i++;
            continue;
        }

        if (char === "_") {
            if (isAlphanumeric(raw[i - 1]) && isAlphanumeric(raw[i + 1])) out.char(i);
            i++;
            continue;
        }

        if (char === "~" && next === "~") {
            i += 2;
            continue;
        }

        if (char === "&") {
            const entity = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(raw.slice(i, to));
            const decoded = entity ? decodeEntity(entity[1]!) : null;
            if (entity && decoded !== null) {
                out.emit(decoded, i);
                i += entity[0].length;
                continue;
            }
        }

        if (char === "\"" || char === "“" || char === "'" || char === "‘") {
            const end = scanQuote(raw, i, to, out);
            if (end !== -1) {
                i = end;
                continue;
            }
        }

        out.char(i);
        i++;
    }
}

function decodeEntity(name : string) : string | null {
    if (name.startsWith("#x") || name.startsWith("#X")) return safeCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return safeCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES.get(name.toLowerCase()) ?? null;
}

function safeCodePoint(value : number) : string | null {
    return Number.isInteger(value) && value > 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : null;
}

/** This function handles `<...>`: autolinks, comments, HTML tags and JSX tags. The result is the index after it, or -1. */
function scanAngle(raw : string, i : number, to : number, out : Builder) : number {
    const rest = raw.slice(i, to);
    const autolink = /^<((?:https?|mailto|ftp):[^\s<>]*|[^\s<>@]+@[^\s<>]+\.[^\s<>]+)>/.exec(rest);
    if (autolink) {
        out.placeholder("url", autolink[1]!, i, i + autolink[0].length);
        return i + autolink[0].length;
    }
    if (rest.startsWith("<!--")) {
        const close = raw.indexOf("-->", i + 4);
        return close === -1 || close + 3 > to ? to : close + 3;
    }
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9.:_-]*)?/.exec(rest);
    if (!tag || (tag[2] === undefined && !/^<\/?>/.test(rest))) return -1;
    const tagEnd = findAngleClose(raw, i + 1, to);
    if (tagEnd === -1) return -1;
    const name = (tag[2] ?? "").toLowerCase();
    if (tag[1] === "" && CODE_ELEMENTS.has(name)) {
        const closeTag = raw.toLowerCase().indexOf(`</${name}>`, tagEnd);
        if (closeTag !== -1 && closeTag + name.length + 3 <= to) {
            out.placeholder("code", raw.slice(tagEnd, closeTag).trim(), i, closeTag + name.length + 3);
            return closeTag + name.length + 3;
        }
    }
    if (name === "br") out.emit(" ", i);
    return tagEnd;
}

/** The index after the `>` that closes a tag. Quotes and `{...}` can contain `>`. */
function findAngleClose(raw : string, from : number, to : number) : number {
    let quote : string | null = null;
    let depth = 0;
    for (let i = from; i < to; i++) {
        const char = raw[i]!;
        if (quote !== null) {
            if (char === quote) quote = null;
        } else if (char === "\"" || char === "'") {
            quote = char;
        } else if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth = Math.max(0, depth - 1);
        } else if (char === "<" && depth === 0) {
            return -1;
        } else if (char === ">" && depth === 0) {
            return i + 1;
        }
    }
    return -1;
}

/** This function handles `{@link ...}` in TSDoc and `{...}` in MDX. The result is the index after it, or -1. */
function scanBrace(raw : string, i : number, to : number, out : Builder, options : InlineOptions) : number {
    const isTag = options.tsdoc && raw[i + 1] === "@";
    if (!isTag && !options.mdx) return -1;
    let depth = 0;
    let quote : string | null = null;
    for (let k = i; k < to; k++) {
        const char = raw[k]!;
        if (quote !== null) {
            if (char === quote) quote = null;
            continue;
        }
        if (!isTag && (char === "\"" || char === "'" || char === "`")) {
            quote = char;
        } else if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
            if (depth === 0) {
                const inner = raw.slice(i + 1, k).trim();
                if (!isTag && inner.startsWith("/*") && inner.endsWith("*/")) return k + 1;
                out.placeholder(isTag ? "link" : "expr", inner, i, k + 1);
                return k + 1;
            }
        }
    }
    return -1;
}

type LinkEnd = {
    /** The index of the `]` after the link text. */
    readonly textEnd : number;
    /** The index after the link destination or reference. */
    readonly end : number;
};

/** The end of an inline link `[text](url)` or a reference link `[text][ref]` that starts at `start`, or null. */
function linkEnd(raw : string, start : number, to : number) : LinkEnd | null {
    let depth = 0;
    let i = start;
    let textEnd = -1;
    while (i < to) {
        const char = raw[i]!;
        if (char === "\\") {
            i += 2;
            continue;
        }
        if (char === "`") {
            let run = 1;
            while (raw[i + run] === "`") run++;
            const close = findBacktickRun(raw, i + run, run);
            i = close === -1 ? i + run : close + run;
            continue;
        }
        if (char === "[") depth++;
        if (char === "]") {
            depth--;
            if (depth === 0) {
                textEnd = i;
                break;
            }
        }
        i++;
    }
    if (textEnd === -1) return null;
    const after = raw[textEnd + 1];
    if (after === "(") {
        let parens = 0;
        let quote : string | null = null;
        for (let k = textEnd + 1; k < to; k++) {
            const char = raw[k]!;
            if (quote !== null) {
                if (char === quote) quote = null;
            } else if (char === "\"" && parens > 0) {
                quote = char;
            } else if (char === "(") {
                parens++;
            } else if (char === ")") {
                parens--;
                if (parens === 0) return { textEnd, end : k + 1 };
            }
        }
        return null;
    }
    if (after === "[") {
        const close = raw.indexOf("]", textEnd + 2);
        if (close !== -1 && close < to) return { textEnd, end : close + 1 };
    }
    return null;
}

/**
 * This function handles quoted text. Double quotes always pair. A single
 * quote pairs only when it cannot be an apostrophe. Then white space or an
 * opening bracket comes before it, and white space or punctuation comes
 * after its partner. The result is the index after the quote, or -1.
 */
function scanQuote(raw : string, i : number, to : number, out : Builder) : number {
    const open = raw[i]!;
    const close = open === "“" ? "”" : open === "‘" ? "’" : open;
    const before = raw[i - 1];
    if (isAlphanumeric(before)) return -1;
    const single = open === "'" || open === "‘";
    if (single && before !== undefined && !/[\s([{]/.test(before)) return -1;
    if (raw[i + 1] === undefined || /\s/.test(raw[i + 1]!)) return -1;
    const limit = Math.min(to, i + (single ? 60 : 300));
    for (let k = i + 1; k < limit; k++) {
        if (raw[k] !== close) continue;
        const after = raw[k + 1];
        if (single && after !== undefined && !/[\s.,;:!?)\]}]/.test(after)) continue;
        if (!single && isAlphanumeric(after)) continue;
        if (/\s/.test(raw[k - 1]!)) continue;
        const text = raw.slice(i + 1, k);
        out.placeholder("quote", text, i, k + 1);
        const final = text[text.length - 1];
        // A quoted sentence can end the sentence around it.
        if (final === "." || final === "!" || final === "?") out.emit(final, k - 1);
        return k + 1;
    }
    return -1;
}
