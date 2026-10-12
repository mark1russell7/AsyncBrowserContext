import type { Element, ElementContent, Root } from "hast";
import { describe, expect, it } from "vitest";
import { collectToc, createExportNode, expressionText, rehypeExportToc, textOf } from "./rehype-export-toc";

function heading(tagName : string, id : string | undefined, children : ElementContent[]) : Element {
    return { type : "element", tagName, properties : id === undefined ? {} : { id }, children };
}

const text = (value : string) : ElementContent => ({ type : "text", value });

function tree() : Root {
    return {
        type : "root",
        children : [
            heading("h1", "title", [text("Title")]),
            heading("h2", "first", [text("First "), { type : "element", tagName : "code", properties : {}, children : [text("part")] }]),
            heading("h3", "detail", [text("  A   detail ")]),
            heading("h4", "deep", [text("Too deep")]),
            heading("h2", undefined, [text("No id")]),
            {
                type : "element",
                tagName : "section",
                properties : {},
                children : [heading("h2", "nested", [text("Nested")])],
            },
        ],
    };
}

describe("collectToc", () => {
    it("collects the h2 and h3 headings that have an id, in order", () => {
        expect(collectToc(tree())).toEqual([
            { id : "first", depth : 2, text : "First part" },
            { id : "detail", depth : 3, text : "A detail" },
            { id : "nested", depth : 2, text : "Nested" },
        ]);
    });
});

describe("the text of a heading", () => {
    /** An MDX expression node, as the MDX compiler gives it: the estree of `{<code>}`. */
    const expression = (body : unknown[]) : ElementContent => ({ type : "mdxTextExpression", value : "", data : { estree : { type : "Program", body } } }) as unknown as ElementContent;
    const statement = (node : unknown) : unknown => ({ type : "ExpressionStatement", expression : node });

    it("takes the text of a JSX element and of a string literal expression", () => {
        const jsx = { type : "mdxJsxTextElement", name : "Badge", attributes : [], children : [text("new")] } as unknown as ElementContent;
        const node = heading("h2", "x", [
            text("A "),
            jsx,
            text(" "),
            expression([statement({ type : "Literal", value : "string" })]),
            text(" "),
            expression([statement({ type : "TemplateLiteral", expressions : [], quasis : [{ value : { cooked : "template" } }] })]),
        ]);
        expect(collectToc({ type : "root", children : [node] })).toEqual([{ id : "x", depth : 2, text : "A new string template" }]);
    });

    it("gives no text for an expression that only JavaScript can compute", () => {
        expect(textOf(expression([statement({ type : "Identifier", name : "version" })]))).toBe("");
        expect(textOf(expression([statement({ type : "TemplateLiteral", expressions : [{}], quasis : [] })]))).toBe("");
        expect(textOf(expression([]))).toBe("");
        expect(expressionText({ type : "text" })).toBe("");
    });
});

describe("createExportNode", () => {
    it("makes an ESM export of the entries", () => {
        const node = createExportNode("toc", [{ id : "a", depth : 2, text : "A" }]) as {
            type : string;
            data : { estree : { body : Array<{ type : string; declaration : { declarations : Array<{ id : { name : string }; init : { elements : unknown[] } }> } }> } };
        };
        expect(node.type).toBe("mdxjsEsm");
        const statement = node.data.estree.body[0]!;
        expect(statement.type).toBe("ExportNamedDeclaration");
        const declarator = statement.declaration.declarations[0]!;
        expect(declarator.id.name).toBe("toc");
        expect(declarator.init.elements).toHaveLength(1);
    });
});

describe("rehypeExportToc", () => {
    it("puts the export at the start of the tree", () => {
        const root = tree();
        rehypeExportToc()(root);
        expect(root.children[0]?.type).toBe("mdxjsEsm");
    });
});
