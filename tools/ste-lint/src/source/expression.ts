/**
 * A scanner for the JavaScript expressions of MDX (`{...}`) and for JSX
 * tags. It finds the `}` that closes an expression, or the `>` that closes a
 * tag.
 *
 * Strings, template literals, comments and JSX in an expression can contain
 * braces and quotes. The scanner knows these parts. Thus a quote in a comment
 * or in JSX text does not start a string. A string stops at the end of its
 * line, as in JavaScript, so a quote without a partner does not hide the
 * lines after it.
 */

type Frame = "expression" | "template" | "tag" | "closing-tag" | "children";

/** The characters after which a `<` starts JSX, not a comparison. */
const JSX_BEFORE = "(,=:?&|{[!;>";

/** True when the `<` at `index` starts a JSX element or fragment in an expression. */
function startsJsx(text : string, index : number, from : number) : boolean {
    const next = text[index + 1];
    if (next === undefined || !/[A-Za-z>]/.test(next)) return false;
    let k = index - 1;
    while (k > from && /\s/.test(text[k]!)) k--;
    if (JSX_BEFORE.includes(text[k]!)) return true;
    return /(?:^|[^\w$])return$/.test(text.slice(Math.max(from, k - 6), k + 1));
}

/** The index after the string literal that starts at `index`. The string stops at the end of the line. */
function stringEnd(text : string, index : number, to : number) : number {
    const quote = text[index];
    let k = index + 1;
    while (k < to) {
        const char = text[k];
        if (char === "\\") {
            k += 2;
        } else if (char === quote) {
            return k + 1;
        } else if (char === "\n") {
            return k;
        } else {
            k++;
        }
    }
    return to;
}

/** The index after the JSX attribute string that starts at `index`, or -1. JSX strings have no escapes. */
function attributeStringEnd(text : string, index : number, to : number) : number {
    const close = text.indexOf(text[index]!, index + 1);
    return close === -1 || close >= to ? -1 : close + 1;
}

/**
 * This function scans from `index` with the frames in `stack`, until the
 * stack is empty. The result is the index of the last character of the
 * outermost frame, or -1 when it does not close before `to`.
 */
function scan(text : string, index : number, to : number, stack : Frame[]) : number {
    const from = index;
    let i = index + 1;
    while (i < to) {
        const char = text[i]!;
        const frame = stack[stack.length - 1]!;
        if (frame === "expression") {
            if (char === "\"" || char === "'") {
                i = stringEnd(text, i, to);
            } else if (char === "`") {
                stack.push("template");
                i++;
            } else if (char === "/" && text[i + 1] === "*") {
                const close = text.indexOf("*/", i + 2);
                if (close === -1 || close + 2 > to) return -1;
                i = close + 2;
            } else if (char === "/" && text[i + 1] === "/") {
                const lineEnd = text.indexOf("\n", i);
                if (lineEnd === -1 || lineEnd >= to) return -1;
                i = lineEnd + 1;
            } else if (char === "{") {
                stack.push("expression");
                i++;
            } else if (char === "}") {
                stack.pop();
                if (stack.length === 0) return i;
                i++;
            } else if (char === "<" && startsJsx(text, i, from)) {
                stack.push("tag");
                i++;
            } else {
                i++;
            }
        } else if (frame === "template") {
            if (char === "\\") {
                i += 2;
            } else if (char === "`") {
                stack.pop();
                i++;
            } else if (char === "$" && text[i + 1] === "{") {
                stack.push("expression");
                i += 2;
            } else {
                i++;
            }
        } else if (frame === "tag" || frame === "closing-tag") {
            if (char === "\"" || char === "'") {
                i = attributeStringEnd(text, i, to);
                if (i === -1) return -1;
            } else if (char === "{") {
                stack.push("expression");
                i++;
            } else if (char === "/" && text[i + 1] === ">" && frame === "tag") {
                // A self-closing element has no children.
                stack.pop();
                if (stack.length === 0) return i + 1;
                i += 2;
            } else if (char === ">") {
                stack.pop();
                if (stack.length === 0) return i;
                if (frame === "tag") {
                    stack.push("children");
                } else if (stack[stack.length - 1] === "children") {
                    // The closing tag also closes the children of its element.
                    stack.pop();
                }
                i++;
            } else {
                i++;
            }
        } else {
            // JSX text: quotes are text, not strings.
            if (char === "{") {
                stack.push("expression");
            } else if (char === "<" && text[i + 1] === "/") {
                stack.push("closing-tag");
            } else if (char === "<" && /[A-Za-z>]/.test(text[i + 1] ?? "")) {
                stack.push("tag");
            }
            i++;
        }
    }
    return -1;
}

/** The index of the `}` that closes the `{` at `open`, or -1 when the expression does not close before `to`. */
export function expressionEnd(text : string, open : number, to : number = text.length) : number {
    return scan(text, open, to, ["expression"]);
}

/**
 * The index after the `>` that closes the JSX tag that starts with the `<`
 * at `open`, or -1 when the tag does not close before `to`. Attribute strings
 * and `{...}` expressions can contain `>`.
 */
export function tagEnd(text : string, open : number, to : number = text.length) : number {
    const end = scan(text, open, to, [text[open + 1] === "/" ? "closing-tag" : "tag"]);
    if (end === -1) return -1;
    // A tag stops at its ">". For "/>", the scan gives the index of the ">" too.
    return end + 1;
}
