import { describe, expect, it } from "vitest";
import { compile } from "@mdx-js/mdx";
import { parseFenceMeta, remarkMermaid, replaceMermaidFences } from "./remark-mermaid";

describe("remarkMermaid", () => {
    it("changes a mermaid fence into the Mermaid component, with its title and caption", () => {
        const tree = {
            type : "root",
            children : [
                { type : "paragraph", children : [{ type : "text", value : "Text" }] },
                { type : "code", lang : "mermaid", meta : 'title="Flow" caption="The flow."', value : "flowchart LR\n  A --> B" },
                { type : "code", lang : "ts", meta : null, value : "const a = 1;" },
            ],
        };
        replaceMermaidFences(tree);

        expect(tree.children[1]).toEqual({
            type : "mdxJsxFlowElement",
            name : "Mermaid",
            attributes : [
                { type : "mdxJsxAttribute", name : "chart", value : "flowchart LR\n  A --> B" },
                { type : "mdxJsxAttribute", name : "title", value : "Flow" },
                { type : "mdxJsxAttribute", name : "caption", value : "The flow." },
            ],
            children : [],
        });
        expect(tree.children[2]).toMatchObject({ type : "code", lang : "ts" });
    });

    it("changes fences inside other nodes, for example in a list", () => {
        const tree = { type : "root", children : [{ type : "list", children : [{ type : "code", lang : "mermaid", value : "graph TD" }] }] };
        replaceMermaidFences(tree);
        expect(tree.children[0]!.children[0]).toMatchObject({ type : "mdxJsxFlowElement", name : "Mermaid" });
    });

    it("reads the key-value pairs of the meta string", () => {
        expect(parseFenceMeta('title="A b" caption="C."')).toEqual({ title : "A b", caption : "C." });
        expect(parseFenceMeta(undefined)).toEqual({});
    });

    it("makes MDX code that gives the chart to the component", async () => {
        const source = "```mermaid title=\"T\"\nflowchart LR\n  A --> B\n```\n";
        const code = String(await compile(source, { remarkPlugins : [remarkMermaid] }));
        expect(code).toContain("_jsx(Mermaid, {");
        expect(code).toContain("flowchart LR");
    });
});
