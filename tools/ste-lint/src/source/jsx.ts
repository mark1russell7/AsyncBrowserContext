/**
 * Prose extraction from the JSX of TSX and JSX files: the text that a user
 * interface shows.
 *
 * An element with text children is one block. Inline elements (`strong`,
 * `a`, `code` and the other elements in `INLINE_ELEMENTS`) and `{...}`
 * expressions stay in the text of their parent. A code element and an
 * expression become one placeholder, which counts as one word. An element
 * with other children gives one block for each run of its text between
 * those children. The JSX inside an expression gives its own blocks.
 *
 * The values of the attributes in `TEXT_ATTRIBUTES` (for example `title`
 * and `aria-label`) are blocks too, when they are string literals.
 */

import ts from "typescript";
import type { ExtractedBlock, BlockOrigin } from "../units.js";
import type { ProseBlock } from "./blocks.js";
import { splitLines, type Line } from "./lines.js";
import type { Extraction } from "./markdown.js";

/** Elements whose text stays in the text of the parent element. */
const INLINE_ELEMENTS = new Set([
    "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s",
    "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "Link", "NavLink",
]);

/** Inline elements whose content is code: each one is one placeholder. */
const CODE_ELEMENTS = new Set(["code", "kbd", "samp", "var"]);

/** Elements whose text is a heading. */
const HEADING_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Elements whose text is a label or a short fragment, not a sentence. The word rules apply, the sentence rules do not. */
const FRAGMENT_ELEMENTS = new Set(["button", "label", "legend", "option", "th", "td", "dt", "summary", "caption", "title"]);

/** Attributes whose string value is text that a reader sees or hears. */
const TEXT_ATTRIBUTES = new Set(["title", "aria-label", "aria-description", "alt", "placeholder", "label", "caption", "description", "summary"]);

const ORIGIN : BlockOrigin = { source : "jsx", tsdocSection : null, tsdocTag : null };

function tagName(node : ts.JsxElement | ts.JsxSelfClosingElement) : string {
    const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
    return name.getText();
}

function isInline(child : ts.JsxChild) : boolean {
    if (ts.isJsxText(child) || ts.isJsxExpression(child)) return true;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return INLINE_ELEMENTS.has(tagName(child));
    return false;
}

function kindOf(name : string) : { kind : ProseBlock["kind"]; depth : number } {
    if (HEADING_ELEMENTS.has(name)) return { kind : "heading", depth : Number(name.slice(1)) };
    if (FRAGMENT_ELEMENTS.has(name)) return { kind : "table-cell", depth : 0 };
    return { kind : "paragraph", depth : 0 };
}

/** This function extracts the text blocks of the JSX of a file. */
export function extractJsxText(text : string, fileName : string) : Extraction {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const blocks : ExtractedBlock[] = [];

    const push = (kind : ProseBlock["kind"], lines : readonly Line[], depth : number) : void => {
        blocks.push({ block : { kind, lines, list : null, quote : false, headingDepth : depth, tableHeader : false }, origin : ORIGIN });
    };

    /** The lines of one inline child. The JSX inside an expression goes to `visit`. */
    const linesOf = (child : ts.JsxChild) : { lines : Line[]; words : boolean } => {
        if (ts.isJsxText(child)) {
            const start = child.getFullStart();
            const raw = text.slice(start, child.getEnd());
            return { lines : splitLines(raw, start), words : /\p{L}/u.test(raw) };
        }
        if (ts.isJsxExpression(child)) {
            if (!child.expression) return { lines : [], words : false };
            ts.forEachChild(child.expression, visit);
            return { lines : [{ text : "{x}", offset : child.getStart() }], words : false };
        }
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
            const name = tagName(child);
            if (ts.isJsxSelfClosingElement(child) || CODE_ELEMENTS.has(name)) {
                if (ts.isJsxSelfClosingElement(child) || name === "br") return { lines : [], words : false };
                return { lines : [{ text : "`x`", offset : child.getStart() }], words : false };
            }
            visitAttributes(child.openingElement.attributes);
            const parts = child.children.map(linesOf);
            return { lines : parts.flatMap(part => part.lines), words : parts.some(part => part.words) };
        }
        return { lines : [], words : false };
    };

    const addRun = (children : readonly ts.JsxChild[], kind : ProseBlock["kind"], depth : number) : void => {
        const parts = children.map(linesOf);
        if (parts.some(part => part.words)) push(kind, parts.flatMap(part => part.lines), depth);
    };

    const visitChildren = (children : ts.NodeArray<ts.JsxChild>, name : string) : void => {
        const { kind, depth } = kindOf(name);
        let run : ts.JsxChild[] = [];
        for (const child of children) {
            if (isInline(child)) {
                run.push(child);
                continue;
            }
            addRun(run, kind, depth);
            run = [];
            visit(child);
        }
        addRun(run, kind, depth);
    };

    function visitAttributes(attributes : ts.JsxAttributes) : void {
        for (const property of attributes.properties) {
            if (!ts.isJsxAttribute(property) || !property.initializer) continue;
            const value = property.initializer;
            if (ts.isJsxExpression(value)) {
                if (value.expression) ts.forEachChild(value.expression, visit);
                continue;
            }
            if (!TEXT_ATTRIBUTES.has(property.name.getText())) continue;
            if (ts.isStringLiteral(value) && /\p{L}/u.test(value.text)) {
                push("table-cell", [{ text : value.text, offset : value.getStart() + 1 }], 0);
            }
        }
    }

    function visit(node : ts.Node) : void {
        if (ts.isJsxElement(node)) {
            visitAttributes(node.openingElement.attributes);
            visitChildren(node.children, tagName(node));
            return;
        }
        if (ts.isJsxSelfClosingElement(node)) {
            visitAttributes(node.attributes);
            return;
        }
        if (ts.isJsxFragment(node)) {
            visitChildren(node.children, "fragment");
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return { blocks, suppressions : [] };
}
