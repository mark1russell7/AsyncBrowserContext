import type { ElementContent, Root, RootContent } from "hast";

/** One heading in the table of contents of a page. */
export type TocEntry = {
    /** The `id` that `rehype-slug` gives the heading. */
    id : string;
    depth : 2 | 3;
    text : string;
};

type Node = Root | RootContent | ElementContent;

const DEPTHS : Readonly<Record<string, 2 | 3>> = { h2 : 2, h3 : 3 };

function textOf(node : Node) : string {
    if (node.type === "text") return node.value;
    if ("children" in node) return (node.children as Node[]).map(textOf).join("");
    return "";
}

/** This function collects the `h2` and `h3` headings that have an `id`, in document order. */
export function collectToc(tree : Root) : TocEntry[] {
    const entries : TocEntry[] = [];
    const visit = (node : Node) : void => {
        if (node.type === "element") {
            const depth = DEPTHS[node.tagName];
            if (depth !== undefined) {
                const id = node.properties["id"];
                if (typeof id === "string" && id !== "") {
                    entries.push({ id, depth, text : textOf(node).replace(/\s+/g, " ").trim() });
                }
                return;
            }
        }
        if ("children" in node) {
            for (const child of node.children as Node[]) visit(child);
        }
    };
    visit(tree);
    return entries;
}

type Literal = { type : "Literal"; value : string | number };

function objectExpression(entry : TocEntry) : unknown {
    return {
        type : "ObjectExpression",
        properties : Object.entries(entry).map(([key, value] : [string, string | number]) => ({
            type : "Property",
            kind : "init",
            method : false,
            shorthand : false,
            computed : false,
            key : { type : "Identifier", name : key },
            value : { type : "Literal", value } satisfies Literal,
        })),
    };
}

/** This function makes an MDX ESM node for `export const <name> = [...]`. */
export function createExportNode(name : string, entries : readonly TocEntry[]) : unknown {
    return {
        type : "mdxjsEsm",
        value : "",
        data : {
            estree : {
                type : "Program",
                sourceType : "module",
                comments : [],
                body : [{
                    type : "ExportNamedDeclaration",
                    specifiers : [],
                    source : null,
                    attributes : [],
                    declaration : {
                        type : "VariableDeclaration",
                        kind : "const",
                        declarations : [{
                            type : "VariableDeclarator",
                            id : { type : "Identifier", name },
                            init : { type : "ArrayExpression", elements : entries.map(objectExpression) },
                        }],
                    },
                }],
            },
        },
    };
}

/**
 * A rehype plugin for MDX that exports the page headings as `toc`. Put it
 * after `rehype-slug` (it reads the `id`s) and before
 * `rehype-autolink-headings` (that plugin adds links to the headings).
 */
export function rehypeExportToc() {
    return (tree : Root) : void => {
        tree.children.unshift(createExportNode("toc", collectToc(tree)) as RootContent);
    };
}
