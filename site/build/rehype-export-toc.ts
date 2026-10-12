import type { ElementContent, Root, RootContent } from "hast";

/** One heading in the table of contents of a page. */
export type TocEntry = {
    /** The `id` that `rehype-slug` gives the heading. */
    id : string;
    depth : 2 | 3;
    text : string;
};

type Node = Root | RootContent | ElementContent;

/** An MDX expression in the tree, for example `{"text"}`. Its estree is the parsed JavaScript of the expression. */
type ExpressionNode = {
    type : "mdxTextExpression" | "mdxFlowExpression";
    data? : { estree? : { body? : Array<{ type : string; expression? : { type : string; value? : unknown; expressions? : unknown[]; quasis? : Array<{ value : { cooked? : string | null } }> } }> } | null };
};

const DEPTHS : Readonly<Record<string, 2 | 3>> = { h2 : 2, h3 : 3 };

/**
 * The text of an MDX expression. The build cannot know the value of most
 * expressions, so only a string literal or a template literal without
 * expressions gives text. Each other expression gives "".
 */
export function expressionText(node : { type : string; data? : unknown }) : string {
    if (node.type !== "mdxTextExpression" && node.type !== "mdxFlowExpression") return "";
    const body = (node as ExpressionNode).data?.estree?.body ?? [];
    const expression = body.length === 1 && body[0]?.type === "ExpressionStatement" ? body[0].expression : undefined;
    if (expression?.type === "Literal" && typeof expression.value === "string") return expression.value;
    if (expression?.type === "TemplateLiteral" && expression.expressions?.length === 0) return expression.quasis?.map(quasi => quasi.value.cooked ?? "").join("") ?? "";
    return "";
}

/** The text of a node, as the table of contents shows it. JSX elements give the text of their children. */
export function textOf(node : Node) : string {
    if (node.type === "text") return node.value;
    if ("children" in node) return (node.children as Node[]).map(textOf).join("");
    return expressionText(node);
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
