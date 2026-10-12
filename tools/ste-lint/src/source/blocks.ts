/**
 * A block parser for the part of Markdown, GFM and MDX that has prose in it.
 *
 * The parser keeps paragraphs, headings, list items, block quotes and table
 * cells. It removes fenced and indented code, HTML blocks, JSX tags, MDX
 * import and export lines, MDX expressions, link reference definitions and
 * thematic breaks. The TSDoc extractor uses the same parser for the text in
 * a doc comment.
 *
 * The parser does not build a full CommonMark tree. It knows only the
 * structure that the lint rules use. That is where a block starts and
 * stops, and if the block is a heading, a table cell or text in a list item.
 */

import { expressionEnd, tagEnd } from "./expression.js";
import { indentWidth, isBlank, sliceLine, stripIndent, type Line } from "./lines.js";

export type ListContext = {
    readonly ordered : boolean;
};

/** A block of prose that the lint rules examine. */
export type ProseBlock = {
    readonly kind : "paragraph" | "heading" | "table-cell";
    /** The text lines of the block, without Markdown block syntax. */
    readonly lines : readonly Line[];
    /** The innermost list that contains the block, or null. */
    readonly list : ListContext | null;
    readonly quote : boolean;
    /** 1 to 6 for a heading, 0 for other blocks. */
    readonly headingDepth : number;
    /** True for the cells of a table header row. */
    readonly tableHeader : boolean;
    /**
     * The file range that an `ste-disable-next` before the block stops. For a
     * table cell, it is the whole table. Without it, the range of the block.
     */
    readonly suppressionRange? : { readonly start : number; readonly end : number };
};

export type DirectiveCommand = "disable" | "enable" | "disable-next";

/** A `ste-disable`, `ste-enable` or `ste-disable-next` comment. */
export type Directive = {
    readonly kind : "directive";
    readonly command : DirectiveCommand;
    /** The rule IDs. An empty list means all rules. */
    readonly rules : readonly string[];
    readonly offset : number;
};

export type Block = ProseBlock | Directive;

export type BlockOptions = {
    /** Parse JSX tags, ESM lines and `{...}` expressions as MDX does. */
    readonly mdx : boolean;
};

type Context = {
    readonly list : ListContext | null;
    readonly quote : boolean;
};

/** HTML tags that start an HTML block (CommonMark type 6). */
const BLOCK_TAGS = new Set([
    "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col",
    "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure",
    "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr",
    "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol",
    "optgroup", "option", "p", "param", "search", "section", "summary", "table", "tbody", "td",
    "tfoot", "th", "thead", "title", "tr", "track", "ul",
]);

/** HTML tags whose block stops at the closing tag, not at a blank line (CommonMark type 1). */
const RAW_TAGS = new Set(["script", "pre", "style", "textarea"]);

const DIRECTIVE = /^ste-(disable-next|disable|enable)\b(.*)$/s;

/** This function parses `lines` into prose blocks and directive comments. */
export function parseBlocks(lines : readonly Line[], options : BlockOptions) : Block[] {
    const out : Block[] = [];
    parseInto(lines, options, { list : null, quote : false }, out);
    return out;
}

/** The directive in the text of a comment, or null. */
export function parseDirective(commentText : string, offset : number) : Directive | null {
    const match = DIRECTIVE.exec(commentText.trim());
    if (!match) return null;
    const rest = match[2]!.split(" -- ")[0]!;
    const rules = rest.split(/[\s,]+/).filter((rule) => rule.length > 0);
    return { kind : "directive", command : match[1] as DirectiveCommand, rules, offset };
}

function proseBlock(kind : ProseBlock["kind"], lines : readonly Line[], context : Context, headingDepth : number = 0, tableHeader : boolean = false) : ProseBlock {
    return { kind, lines, list : context.list, quote : context.quote, headingDepth, tableHeader };
}

function parseInto(lines : readonly Line[], options : BlockOptions, context : Context, out : Block[]) : void {
    let paragraph : Line[] = [];
    const flush = () : void => {
        if (paragraph.length > 0) out.push(proseBlock("paragraph", paragraph, context));
        paragraph = [];
    };

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;
        if (isBlank(line.text)) {
            flush();
            i++;
            continue;
        }
        const indent = indentWidth(line.text);
        const inParagraph = paragraph.length > 0;
        if (!inParagraph && indent >= 4) {
            i = skipIndentedCode(lines, i);
            continue;
        }
        const body = stripIndent(line, 3);
        const text = body.text;

        const fence = fenceOpening(text);
        if (fence !== null) {
            flush();
            i = skipFence(lines, i, fence);
            continue;
        }

        const atx = /^(#{1,6})(?:[ \t]+|$)/.exec(text);
        if (atx) {
            flush();
            out.push(proseBlock("heading", [headingContent(body, atx[0].length)], context, atx[1]!.length));
            i++;
            continue;
        }

        if (inParagraph && /^(?:=+|-+)[ \t]*$/.test(text)) {
            out.push(proseBlock("heading", paragraph, context, text.startsWith("=") ? 1 : 2));
            paragraph = [];
            i++;
            continue;
        }

        if (isThematicBreak(text)) {
            flush();
            i++;
            continue;
        }

        if (text.startsWith(">")) {
            flush();
            i = parseQuote(lines, i, options, context, out);
            continue;
        }

        const marker = listMarker(text);
        if (marker !== null && (!inParagraph || canInterruptParagraph(marker))) {
            flush();
            i = parseListItem(lines, i, options, context, out);
            continue;
        }

        if (text.startsWith("<!--")) {
            flush();
            i = parseHtmlComment(lines, i, out);
            continue;
        }

        if (text.startsWith("<")) {
            const next = parseTagLine(lines, i, body, inParagraph, options);
            if (next !== null) {
                flush();
                if (next.rest !== null) paragraph.push(next.rest);
                i = next.index;
                continue;
            }
        }

        if (options.mdx && !inParagraph && /^(?:import|export)\b/.test(text)) {
            i = skipUntilBlank(lines, i);
            continue;
        }

        if (options.mdx && text.startsWith("{")) {
            flush();
            i = parseExpressionBlock(lines, i, body, out);
            continue;
        }

        if (text.startsWith(":::")) {
            flush();
            i++;
            continue;
        }

        if (!inParagraph && /^\[[^\]]+\]:/.test(text)) {
            i++;
            continue;
        }

        if (text.includes("|") && i + 1 < lines.length && isDelimiterRow(lines[i + 1]!.text)) {
            flush();
            i = parseTable(lines, i, context, out);
            continue;
        }

        paragraph.push(sliceLine(body, body.text.length - body.text.trimStart().length));
        i++;
    }
    flush();
}

type Fence = { readonly char : string; readonly length : number };

function fenceOpening(text : string) : Fence | null {
    const match = /^(`{3,}|~{3,})(.*)$/.exec(text);
    if (!match) return null;
    const run = match[1]!;
    // A backtick fence cannot have a backtick in its info string.
    if (run[0] === "`" && match[2]!.includes("`")) return null;
    return { char : run[0]!, length : run.length };
}

function skipFence(lines : readonly Line[], start : number, fence : Fence) : number {
    for (let i = start + 1; i < lines.length; i++) {
        const text = stripIndent(lines[i]!, 3).text;
        const match = /^(`+|~+)[ \t]*$/.exec(text);
        if (match && match[1]![0] === fence.char && match[1]!.length >= fence.length) return i + 1;
    }
    return lines.length;
}

function skipIndentedCode(lines : readonly Line[], start : number) : number {
    let i = start;
    while (i < lines.length && (isBlank(lines[i]!.text) || indentWidth(lines[i]!.text) >= 4)) i++;
    return i;
}

function skipUntilBlank(lines : readonly Line[], start : number) : number {
    let i = start;
    while (i < lines.length && !isBlank(lines[i]!.text)) i++;
    return i;
}

function headingContent(body : Line, markerLength : number) : Line {
    const content = sliceLine(body, markerLength);
    const closing = /(?:^|[ \t]+)#+[ \t]*$/.exec(content.text);
    const text = closing ? content.text.slice(0, closing.index) : content.text;
    return { text : text.trimEnd(), offset : content.offset };
}

function isThematicBreak(text : string) : boolean {
    return /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(text);
}

type Marker = {
    readonly ordered : boolean;
    readonly start : number;
    /** The length of the marker, for example 1 for `-` and 2 for `1.`. */
    readonly length : number;
    /** The number of spaces after the marker. */
    readonly spaces : number;
    readonly empty : boolean;
};

function listMarker(text : string) : Marker | null {
    const match = /^(?:([-*+])|(\d{1,9})[.)])([ \t]+|$)/.exec(text);
    if (!match) return null;
    const ordered = match[2] !== undefined;
    const length = ordered ? match[2]!.length + 1 : 1;
    const empty = text.slice(length).trim().length === 0;
    return { ordered, start : ordered ? Number(match[2]) : 0, length, spaces : match[3]!.length, empty };
}

/** A list can interrupt a paragraph only when it is not empty and an ordered list starts at 1 (CommonMark). */
function canInterruptParagraph(marker : Marker) : boolean {
    return !marker.empty && (!marker.ordered || marker.start === 1);
}

/** True when `text` starts a block that stops a lazy continuation line. */
function startsBlock(text : string) : boolean {
    return fenceOpening(text) !== null
        || /^#{1,6}(?:[ \t]|$)/.test(text)
        || text.startsWith(">")
        || isThematicBreak(text)
        || listMarker(text) !== null
        || /^<(?:!--|\/?[A-Za-z])/.test(text);
}

function parseQuote(lines : readonly Line[], start : number, options : BlockOptions, context : Context, out : Block[]) : number {
    const quoted : Line[] = [];
    let i = start;
    while (i < lines.length) {
        const line = lines[i]!;
        const body = stripIndent(line, 3);
        if (body.text.startsWith(">")) {
            let inner = sliceLine(body, 1);
            if (inner.text.startsWith(" ")) inner = sliceLine(inner, 1);
            quoted.push(inner);
            i++;
            continue;
        }
        const previous = quoted[quoted.length - 1];
        if (!isBlank(line.text) && previous !== undefined && !isBlank(previous.text) && !startsBlock(body.text)) {
            quoted.push(body);
            i++;
            continue;
        }
        break;
    }
    // A GitHub alert marker, for example `[!NOTE]`, is not prose.
    const first = quoted[0];
    if (first !== undefined && /^\[![A-Za-z]+\]\s*$/.test(first.text)) quoted.shift();
    parseInto(quoted, options, { list : context.list, quote : true }, out);
    return i;
}

function parseListItem(lines : readonly Line[], start : number, options : BlockOptions, context : Context, out : Block[]) : number {
    const first = lines[start]!;
    const markerIndent = indentWidth(first.text);
    const atMarker = stripIndent(first, markerIndent);
    const marker = listMarker(atMarker.text)!;
    const spaces = marker.empty || marker.spaces > 4 ? 1 : marker.spaces;
    const contentColumn = markerIndent + marker.length + spaces;
    const itemLines : Line[] = [sliceLine(atMarker, marker.length + Math.min(marker.spaces, spaces))];

    let i = start + 1;
    let previousBlank = marker.empty;
    while (i < lines.length) {
        const line = lines[i]!;
        if (isBlank(line.text)) {
            itemLines.push(line);
            previousBlank = true;
            i++;
            continue;
        }
        const indent = indentWidth(line.text);
        if (indent >= contentColumn) {
            itemLines.push(stripIndent(line, contentColumn));
            previousBlank = false;
            i++;
            continue;
        }
        if (!previousBlank && !startsBlock(stripIndent(line, 3).text) && !(i + 1 < lines.length && isDelimiterRow(lines[i + 1]!.text))) {
            itemLines.push(stripIndent(line, indent));
            i++;
            continue;
        }
        break;
    }
    parseInto(itemLines, options, { list : { ordered : marker.ordered }, quote : context.quote }, out);
    return i;
}

function parseHtmlComment(lines : readonly Line[], start : number, out : Block[]) : number {
    const first = stripIndent(lines[start]!, 3);
    let text = first.text.slice(4);
    let i = start;
    while (!text.includes("-->") && i + 1 < lines.length) {
        i++;
        text += "\n" + lines[i]!.text;
    }
    const directive = parseDirective(text.split("-->")[0]!, first.offset);
    if (directive !== null) out.push(directive);
    return i + 1;
}

type TagLineResult = {
    /** The index of the next line to parse. */
    readonly index : number;
    /** Text after a JSX tag on the same line, which is prose. */
    readonly rest : Line | null;
};

/**
 * This function handles a line that starts with `<`. The result is null when
 * the line is prose with inline HTML.
 */
function parseTagLine(lines : readonly Line[], start : number, body : Line, inParagraph : boolean, options : BlockOptions) : TagLineResult | null {
    const text = body.text;
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9.:_-]*)(?=[\s/>]|$)/.exec(text);
    const fragment = /^<\/?>/.test(text);
    if (tag === null && !fragment) return null;

    if (options.mdx) {
        const end = findTagEnd(lines, start, body.offset - lines[start]!.offset);
        // A tag that does not close hides only its own line.
        if (end === null) return { index : start + 1, rest : null };
        const endLine = lines[end.line]!;
        const rest = sliceLine(endLine, end.column);
        // A line with only a tag is a JSX block, also after paragraph text. A tag with text after it in a paragraph is inline JSX.
        if (isBlank(rest.text) || rest.text.trimStart().startsWith("<")) return { index : end.line + 1, rest : null };
        if (inParagraph) return null;
        return { index : end.line + 1, rest : sliceLine(rest, rest.text.length - rest.text.trimStart().length) };
    }

    const name = tag === null ? "" : tag[2]!.toLowerCase();
    if (tag !== null && tag[1] === "" && RAW_TAGS.has(name)) {
        let i = start;
        while (i < lines.length && !lines[i]!.text.toLowerCase().includes(`</${name}>`)) i++;
        return { index : Math.min(i + 1, lines.length), rest : null };
    }
    if (BLOCK_TAGS.has(name)) return { index : skipUntilBlank(lines, start), rest : null };
    // CommonMark type 7: a line with only a complete tag, which cannot interrupt a paragraph.
    if (!inParagraph && /^<\/?[A-Za-z][^<>]*>\s*$/.test(text)) return { index : skipUntilBlank(lines, start), rest : null };
    return null;
}

type Position = { readonly line : number; readonly column : number };

/** The lines of a block parser level as one text, with the index of the start of each line in the text. */
type JoinedLines = { readonly text : string; readonly starts : readonly number[] };

const joinedCache = new WeakMap<readonly Line[], JoinedLines>();

function joinLines(lines : readonly Line[]) : JoinedLines {
    let joined = joinedCache.get(lines);
    if (joined === undefined) {
        const starts : number[] = [];
        let length = 0;
        for (const line of lines) {
            starts.push(length);
            length += line.text.length + 1;
        }
        joined = { text : lines.map((line) => line.text).join("\n"), starts };
        joinedCache.set(lines, joined);
    }
    return joined;
}

/** The line and the column of an index in the joined text. */
function positionOf(joined : JoinedLines, index : number) : Position {
    let low = 0;
    let high = joined.starts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (joined.starts[middle]! <= index) low = middle;
        else high = middle - 1;
    }
    return { line : low, column : index - joined.starts[low]! };
}

/**
 * This function finds the `>` that closes a JSX tag. JSX can continue on the
 * lines after the tag start. The result is the position after the `>`, or
 * null when the tag does not close.
 */
function findTagEnd(lines : readonly Line[], startLine : number, startColumn : number) : Position | null {
    const joined = joinLines(lines);
    const end = tagEnd(joined.text, joined.starts[startLine]! + startColumn);
    return end === -1 ? null : positionOf(joined, end);
}

/**
 * This function skips an MDX `{...}` expression, and keeps a directive
 * comment in it. When the expression does not close, the function skips
 * only the first line.
 */
function parseExpressionBlock(lines : readonly Line[], start : number, body : Line, out : Block[]) : number {
    const joined = joinLines(lines);
    const open = joined.starts[start]! + (body.offset - lines[start]!.offset);
    const close = expressionEnd(joined.text, open);
    if (close === -1) return start + 1;
    const comment = /^\{\s*\/\*([\s\S]*)\*\/\s*\}$/.exec(joined.text.slice(open, close + 1));
    if (comment) {
        const directive = parseDirective(comment[1]!, body.offset);
        if (directive !== null) out.push(directive);
    }
    return positionOf(joined, close).line + 1;
}

/** True for a GFM table delimiter row, for example `| --- | :-: |`. */
export function isDelimiterRow(text : string) : boolean {
    return text.includes("|") && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(text);
}

/** This function divides a table row into cells. A `|` in a code span or after `\` does not divide cells. */
export function splitCells(row : Line) : Line[] {
    const text = row.text;
    const cells : Line[] = [];
    let cellStart = 0;
    let i = 0;
    const pushCell = (end : number) : void => {
        const raw = text.slice(cellStart, end);
        const lead = raw.length - raw.trimStart().length;
        cells.push({ text : raw.trim(), offset : row.offset + cellStart + lead });
    };
    while (i < text.length) {
        const char = text[i]!;
        if (char === "\\") {
            i += 2;
            continue;
        }
        if (char === "`") {
            let run = 1;
            while (text[i + run] === "`") run++;
            const close = findBacktickRun(text, i + run, run);
            i = close === -1 ? i + run : close + run;
            continue;
        }
        if (char === "|") {
            pushCell(i);
            cellStart = i + 1;
        }
        i++;
    }
    pushCell(text.length);
    // A leading or trailing pipe makes an empty cell at the edge. That cell is not part of the table.
    if (text.trimStart().startsWith("|")) cells.shift();
    if (text.trimEnd().endsWith("|") && !text.trimEnd().endsWith("\\|")) cells.pop();
    return cells;
}

/** The index of the next run of exactly `length` backticks at or after `from` and before `to`, or -1. */
export function findBacktickRun(text : string, from : number, length : number, to : number = text.length) : number {
    let i = from;
    while (i < to) {
        if (text[i] === "`") {
            let run = 1;
            while (text[i + run] === "`") run++;
            if (run === length) return i;
            i += run;
        } else {
            i++;
        }
    }
    return -1;
}

/**
 * This function gives each cell of a table as a block. An `ste-disable-next`
 * before the table stops the findings in all of its cells, because a comment
 * cannot come between the rows of a table.
 */
function parseTable(lines : readonly Line[], start : number, context : Context, out : Block[]) : number {
    let end = start + 2;
    while (end < lines.length) {
        const line = lines[end]!;
        if (isBlank(line.text) || !line.text.includes("|") || startsBlock(stripIndent(line, 3).text)) break;
        end++;
    }
    const first = stripIndent(lines[start]!, 3);
    const last = lines[end - 1]!;
    const suppressionRange = { start : first.offset, end : last.offset + last.text.length };
    for (let i = start; i < end; i++) {
        if (i === start + 1) continue;
        for (const cell of splitCells(stripIndent(lines[i]!, 3))) {
            if (cell.text.length > 0) out.push({ ...proseBlock("table-cell", [cell], context, 0, i === start), suppressionRange });
        }
    }
    return end;
}
