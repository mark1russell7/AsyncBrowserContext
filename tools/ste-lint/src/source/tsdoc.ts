/**
 * Prose extraction from the doc comments (`/** ... *\/`) of TypeScript and
 * JavaScript files.
 *
 * The TypeScript compiler parses the file. The extractor then examines only
 * the trivia between tokens. Thus, text in strings, template literals,
 * regular expressions and JSX does not become a comment.
 */

import ts from "typescript";
import type { BlockOrigin, ExtractedBlock, TsdocSection } from "../units.js";
import { parseBlocks, parseDirective } from "./blocks.js";
import { sliceLine, splitLines, type Line } from "./lines.js";
import type { Extraction } from "./markdown.js";
import { SuppressionCollector } from "./suppressions.js";

export type CommentKind = "line" | "block" | "doc";

export type CommentRange = {
    readonly kind : CommentKind;
    /** The file offset of the first `/`. */
    readonly pos : number;
    /** The file offset after the comment. */
    readonly end : number;
};

/** Tags whose content is not prose: code, values, names and other data. */
const SKIPPED_TAGS = new Set([
    "example", "default", "defaultvalue", "since", "version", "author", "license", "module", "category",
    "group", "file", "fileoverview", "overview", "typedef", "type", "callback", "enum", "class", "constructor",
    "extends", "augments", "implements", "satisfies", "overload", "import", "link", "linkcode", "linkplain",
    "jsx", "jsxfrag", "jsximportsource", "jsxruntime", "ts-check", "ts-nocheck", "ts-ignore", "ts-expect-error",
    "vitest-environment", "jest-environment", "eslint-disable", "copyright", "summary-only",
]);

/** Tags whose content is the same type of text as the summary. */
const REMARKS_TAGS = new Set(["remarks", "privateremarks", "description", "summary", "classdesc"]);

/** Tags that have a name before their text: `@param name - text`. */
const NAMED_TAGS = new Set(["param", "typeparam", "template", "property", "prop", "arg", "argument"]);

/** Tags that can have a type before their text: `@throws {Error} text`. */
const TYPED_TAGS = new Set(["returns", "return", "throws", "exception", "yields", "yield"]);

const TAG_LINE = /^[ \t]*@([A-Za-z][\w-]*)(?=[\s{]|$)/;

function scriptKind(fileName : string) : ts.ScriptKind {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
    if (/\.[mc]?js$/.test(lower)) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}

/** The kinds of JSX nodes. A token in one of them is part of the JSX markup, not code. */
const JSX_KINDS : ReadonlySet<ts.SyntaxKind> = new Set([
    ts.SyntaxKind.JsxElement, ts.SyntaxKind.JsxSelfClosingElement, ts.SyntaxKind.JsxOpeningElement,
    ts.SyntaxKind.JsxClosingElement, ts.SyntaxKind.JsxFragment, ts.SyntaxKind.JsxOpeningFragment,
    ts.SyntaxKind.JsxClosingFragment, ts.SyntaxKind.JsxAttribute, ts.SyntaxKind.JsxAttributes,
    ts.SyntaxKind.JsxSpreadAttribute, ts.SyntaxKind.JsxExpression, ts.SyntaxKind.JsxText,
    ts.SyntaxKind.JsxTextAllWhiteSpaces, ts.SyntaxKind.JsxNamespacedName,
]);

/** The comments of a file, and the file offsets of its code tokens. */
export type SourceScan = {
    /** The comments, in file order. */
    readonly comments : readonly CommentRange[];
    /**
     * The start of each token that is code, in file order. The tokens of the
     * JSX markup (tags, attributes, JSX text and the braces of `{...}`) are
     * not code. The tokens in a `{...}` expression are code.
     */
    readonly codeTokens : readonly number[];
};

/** This function finds the comments and the code tokens of a file. */
export function scanSource(text : string, fileName : string) : SourceScan {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
    const comments : CommentRange[] = [];
    const codeTokens : number[] = [];
    const scanTrivia = (from : number, to : number) : void => {
        let i = from;
        if (i === 0 && text.startsWith("#!")) {
            const lineEnd = text.indexOf("\n");
            i = lineEnd === -1 ? to : lineEnd;
        }
        while (i < to) {
            if (text[i] === "/" && text[i + 1] === "/") {
                const lineEnd = text.indexOf("\n", i);
                const end = lineEnd === -1 || lineEnd > to ? to : lineEnd;
                comments.push({ kind : "line", pos : i, end });
                i = end;
            } else if (text[i] === "/" && text[i + 1] === "*") {
                const close = text.indexOf("*/", i + 2);
                const end = close === -1 ? to : Math.min(close + 2, to);
                const isDoc = text.startsWith("/**", i) && !text.startsWith("/**/", i);
                comments.push({ kind : isDoc ? "doc" : "block", pos : i, end });
                i = end;
            } else {
                i++;
            }
        }
    };
    const isJsDoc = (node : ts.Node) : boolean => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
    const visit = (node : ts.Node, markup : boolean) : void => {
        // A token can have a JSDoc child, for example the end-of-file token after a final doc comment. It is still a token.
        const children = node.getChildren(sourceFile).filter((child) => !isJsDoc(child));
        if (children.length === 0) {
            const start = node.getStart(sourceFile);
            scanTrivia(node.getFullStart(), start);
            // An empty list, for example the statements of a file with only comments, is not a token.
            if (!markup && node.getEnd() > start && node.kind !== ts.SyntaxKind.SyntaxList) codeTokens.push(start);
            return;
        }
        for (const child of children) {
            // The expression in `{...}` is code, also in JSX.
            const expression = ts.isJsxExpression(node) || ts.isJsxSpreadAttribute(node) ? node.expression : undefined;
            visit(child, child === expression ? false : markup || JSX_KINDS.has(node.kind));
        }
    };
    visit(sourceFile, false);
    return { comments, codeTokens };
}

/** This function finds all comments in a file. The comments come in file order. */
export function collectComments(text : string, fileName : string) : CommentRange[] {
    return [...scanSource(text, fileName).comments];
}

/**
 * This function removes the comment syntax from the lines of a doc comment:
 *
 * - `/**` on the first line
 * - `*\/` on the last line
 * - The `*` and one space at the start of the other lines.
 */
export function docCommentLines(text : string, comment : CommentRange) : Line[] {
    const inner = text.slice(comment.pos + 3, Math.max(comment.pos + 3, comment.end - 2));
    return splitLines(inner, comment.pos + 3).map((line, index) => {
        if (index === 0) return line;
        const prefix = /^[ \t]*\*(?!\/)[ \t]?/.exec(line.text);
        if (prefix) return sliceLine(line, prefix[0].length);
        return sliceLine(line, line.text.length - line.text.trimStart().length);
    });
}

type Section = {
    readonly section : TsdocSection;
    readonly tag : string | null;
    readonly lines : Line[];
};

/** This function removes the tag, and the type and the name after the tag, from the first line of a block tag. */
function tagContent(line : Line, tag : string, tagEnd : number) : Line {
    const rest = sliceLine(line, tagEnd);
    const lower = tag.toLowerCase();
    let prefix : RegExp;
    if (NAMED_TAGS.has(lower)) prefix = /^\s*(?:\{[^}]*\}\s*)?(?:\[[^\]]*\]|[\w$.]+)?\s*(?:-\s+|-$)?/;
    else if (TYPED_TAGS.has(lower)) prefix = /^\s*(?:\{[^}]*\}\s*)?(?:-\s+)?/;
    else prefix = /^\s*(?:-\s+)?/;
    return sliceLine(rest, prefix.exec(rest.text)![0].length);
}

/** This function divides the lines of a doc comment into the summary and the block tag sections. */
export function splitSections(lines : readonly Line[]) : Section[] {
    const sections : Section[] = [];
    let current : Section | null = { section : "summary", tag : null, lines : [] };
    let fence : string | null = null;
    for (const line of lines) {
        const fenceMatch = /^[ \t]*(`{3,}|~{3,})/.exec(line.text);
        if (fence !== null) {
            if (fenceMatch && fenceMatch[1]![0] === fence[0] && fenceMatch[1]!.length >= fence.length) fence = null;
            current?.lines.push(line);
            continue;
        }
        if (fenceMatch) fence = fenceMatch[1]!;
        const tag = fence === null ? TAG_LINE.exec(line.text) : null;
        if (tag === null) {
            current?.lines.push(line);
            continue;
        }
        if (current !== null) sections.push(current);
        const name = tag[1]!;
        const lower = name.toLowerCase();
        if (SKIPPED_TAGS.has(lower)) {
            current = null;
            continue;
        }
        current = {
            section : REMARKS_TAGS.has(lower) ? "remarks" : "tag",
            tag : name,
            lines : [tagContent(line, name, tag[0].length)],
        };
    }
    if (current !== null) sections.push(current);
    return sections.filter((section) => section.lines.length > 0);
}

/**
 * This function extracts the prose blocks of the doc comments of a file,
 * and the suppressions. `textBlocks` are other blocks of the file, for
 * example the JSX text. A pending `ste-disable-next` applies to the next doc
 * comment or block. A code token before it cancels the directive.
 */
export function extractTsdoc(text : string, fileName : string, textBlocks : readonly ExtractedBlock[] = []) : Extraction {
    const collector = new SuppressionCollector();
    const blocks : ExtractedBlock[] = [];
    const scan = scanSource(text, fileName);

    const comment = (range : CommentRange) : void => {
        if (range.kind !== "doc") {
            const body = range.kind === "line" ? text.slice(range.pos + 2, range.end) : text.slice(range.pos + 2, range.end - 2);
            const directive = parseDirective(body, range.pos);
            if (directive !== null) collector.directive(directive);
            return;
        }
        collector.block(range.pos, range.end);
        for (const section of splitSections(docCommentLines(text, range))) {
            const origin : BlockOrigin = { source : "tsdoc", tsdocSection : section.section, tsdocTag : section.tag };
            for (const block of parseBlocks(section.lines, { mdx : false })) {
                if (block.kind === "directive") {
                    collector.directive(block);
                    continue;
                }
                const blockRange = block.suppressionRange ?? rangeOf(block.lines);
                collector.block(blockRange.start, blockRange.end);
                blocks.push({ block, origin });
            }
        }
    };

    // The events in file order. At the same offset, a block comes before a code token.
    type FileEvent = { readonly offset : number; readonly order : number; readonly handle : () => void };
    const events : FileEvent[] = [
        ...scan.comments.map((range) => ({ offset : range.pos, order : 0, handle : () => comment(range) })),
        ...textBlocks.map((entry) => {
            const blockRange = entry.block.suppressionRange ?? rangeOf(entry.block.lines);
            return { offset : blockRange.start, order : 1, handle : () => collector.block(blockRange.start, blockRange.end) };
        }),
        ...scan.codeTokens.map((offset) => ({ offset, order : 2, handle : () => collector.cancelPending() })),
    ];
    events.sort((a, b) => a.offset - b.offset || a.order - b.order);
    for (const event of events) event.handle();
    return { blocks : [...blocks, ...textBlocks], suppressions : collector.finish(text.length), problems : collector.problems };
}

function rangeOf(lines : readonly Line[]) : { start : number; end : number } {
    const first = lines[0]!;
    const last = lines[lines.length - 1]!;
    return { start : first.offset, end : last.offset + last.text.length };
}
