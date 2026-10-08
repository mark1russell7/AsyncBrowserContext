/**
 * A remark plugin: it changes each fenced code block with the language
 * `mermaid` into the `<Mermaid>` component. Thus a page can write a diagram
 * as a code fence:
 *
 * ```mermaid title="Hang detection" caption="The worker reports a hang."
 * sequenceDiagram
 *     W->>M: heartbeat
 * ```
 *
 * The `title` and `caption` attributes of the fence are optional.
 */

type MdastNode = {
    type : string;
    lang? : string | null;
    meta? : string | null;
    value? : string;
    children? : MdastNode[];
};

type JsxAttribute = { type : "mdxJsxAttribute"; name : string; value : string };

/** The `key="value"` pairs of the meta string of a fence. */
export function parseFenceMeta(meta : string | null | undefined) : Record<string, string> {
    const attributes : Record<string, string> = {};
    for (const match of (meta ?? "").matchAll(/(\w+)="([^"]*)"/g)) {
        attributes[match[1]!] = match[2]!;
    }
    return attributes;
}

function toMermaidElement(node : MdastNode) : MdastNode & { name : string; attributes : JsxAttribute[] } {
    const meta = parseFenceMeta(node.meta);
    const attributes : JsxAttribute[] = [{ type : "mdxJsxAttribute", name : "chart", value : node.value ?? "" }];
    for (const name of ["title", "caption"]) {
        const value = meta[name];
        if (value !== undefined) attributes.push({ type : "mdxJsxAttribute", name, value });
    }
    return { type : "mdxJsxFlowElement", name : "Mermaid", attributes, children : [] };
}

/** This function changes the mermaid fences of the tree. It changes the tree in place. */
export function replaceMermaidFences(tree : MdastNode) : void {
    const children = tree.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        if (child.type === "code" && child.lang === "mermaid") {
            children[i] = toMermaidElement(child);
        } else {
            replaceMermaidFences(child);
        }
    }
}

export function remarkMermaid() : (tree : MdastNode) => void {
    return replaceMermaidFences;
}
