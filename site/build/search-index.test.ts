import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSearchIndex, headingsOf, plainText } from "./search-index";

const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

describe("the search index", () => {
    it("gives the h2 and h3 headings with the IDs of rehype-slug, without code blocks", () => {
        const source = "---\ntitle: T\n---\n\n## The `run()` method\n\n```ts\n## not a heading\n```\n\n### Run [it](/x)\n\n## The `run()` method\n";
        expect(headingsOf(source)).toEqual([
            { text : "The run() method", id : "the-run-method" },
            { text : "Run it", id : "run-it" },
            { text : "The run() method", id : "the-run-method-1" },
        ]);
    });

    it("gives the text without frontmatter, imports, JSX and Markdown marks", () => {
        const text = plainText("---\ntitle: T\n---\nimport X from \"y\";\n\n## Head\n\nSome **bold** [link](/a) and `code`.\n\n<Callout type=\"note\">Inside</Callout>\n\n| a | b |\n| --- | --- |\n");
        expect(text).toBe("Head Some bold link and code . Inside a b");
    });

    it("has an entry for each page of the site, with its section and title", async () => {
        const entries = await buildSearchIndex(contentDir);
        const debuggerPage = entries.find(entry => entry.path === "explore/debugger");
        expect(debuggerPage).toMatchObject({ section : "Explore", title : "Context debugger" });
        expect(debuggerPage?.headings.map(heading => heading.id)).toContain("how-to-use-the-debugger");
        expect(entries.find(entry => entry.path === "docs")).toMatchObject({ section : "Docs" });
    });
});
