import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readPageTrees } from "./mdx-pipeline";
import { collectToc } from "./rehype-export-toc";
import { buildSearchIndex, pageText, searchText } from "./search-index";

const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

/** The headings and the text of one MDX source, as the search index gives them. */
async function indexOf(source : string) : Promise<{ headings : Array<{ text : string; id : string }>; prose : string; code : string }> {
    const [result] = await readPageTrees([{ source, path : "test.mdx" }], tree => ({
        headings : collectToc(tree).map(({ text, id }) => ({ text, id })),
        ...pageText(tree),
    }));
    if (result === undefined) throw new Error("No result");
    return result;
}

const folders : string[] = [];

afterEach(async () => {
    await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive : true, force : true })));
});

describe("the search index", () => {
    it("gives the h2 and h3 headings with the IDs and the text of the table of contents", async () => {
        const source = [
            "---", "title: T", "---", "",
            "## The `run()` method", "",
            "```ts", "## not a heading", "```", "",
            "### Run [it](/x)", "",
            "## The `run()` method", "",
            "## C# &amp; F# with `snake_case`", "",
            "## A <Badge>new</Badge> part {\"text\"}", "",
            "Setext heading", "--------------", "",
            "````md", "```", "## inside a nested fence", "```", "````", "",
            // MDX has no indented code, so an indented line can be a heading.
            "    ## Indented heading", "",
        ].join("\n");
        expect((await indexOf(source)).headings).toEqual([
            { text : "The run() method", id : "the-run-method" },
            { text : "Run it", id : "run-it" },
            { text : "The run() method", id : "the-run-method-1" },
            { text : "C# & F# with snake_case", id : "c--f-with-snake_case" },
            { text : "A new part text", id : "a-new-part-" },
            { text : "Setext heading", id : "setext-heading" },
            { text : "Indented heading", id : "indented-heading" },
        ]);
    });

    it("gives the text without frontmatter, imports, JSX attributes and Markdown marks, and the code after it", async () => {
        const source = [
            "---", "title: T", "---",
            "import X from \"y\";", "",
            "## Head", "",
            "Some **bold** [link](/a) and `code`.", "",
            "<Callout type=\"note\" title=\"Cost\" data-x=\"a > b leaked\">Inside</Callout>", "",
            "| a | b |", "| --- | --- |", "",
            "```js", "import { bindGenerator } from \"async-browser-context/runtime\";", "export default webpack;", "```", "",
            "{/* A comment */}", "",
            "```mermaid title=\"Flow\"", "graph LR", "    A --> B", "```",
        ].join("\n");
        const { prose, code } = await indexOf(source);
        expect(prose).toBe("Head Some bold link and code. Cost Inside a b Flow");
        expect(code).toBe("import { bindGenerator } from \"async-browser-context/runtime\"; export default webpack; graph LR A --> B");
    });

    it("limits the prose and the code separately, with the code after the prose", () => {
        const text = searchText({ prose : "p".repeat(30_000), code : "c".repeat(10_000) });
        expect(text).toMatch(/^p+ c+$/);
        expect(text.indexOf("c")).toBe(20_001);
        expect(text.length).toBe(20_001 + 8000);
        expect(searchText({ prose : "text", code : "" })).toBe("text");
    });

    it("has an entry for each page of the site, with its section and title, and finds words in code and late in a long page", async () => {
        const entries = await buildSearchIndex(contentDir);
        const debuggerPage = entries.find(entry => entry.path === "explore/debugger");
        expect(debuggerPage).toMatchObject({ section : "Explore", title : "Context debugger" });
        expect(debuggerPage?.headings.map(heading => heading.id)).toContain("how-to-use-the-debugger");
        expect(entries.find(entry => entry.path === "docs")).toMatchObject({ section : "Docs" });
        const api = entries.find(entry => entry.path === "docs/api");
        for (const word of ["bindGenerator", "exports"]) expect(api?.text).toContain(word);
        const buildTools = entries.find(entry => entry.path === "docs/guides/build-tools");
        for (const word of ["webpack", "rspack"]) expect(buildTools?.text.toLowerCase()).toContain(word);
    });

    it("leaves out drafts and pages with a frontmatter problem, as the content registry marks them", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "abc-search-"));
        folders.push(dir);
        await mkdir(path.join(dir, "docs"), { recursive : true });
        await writeFile(path.join(dir, "docs", "final.mdx"), "---\ntitle: Final\ndescription: D.\norder: 1\n---\nText");
        await writeFile(path.join(dir, "docs", "draft.mdx"), "---\ntitle: Draft\ndescription: D.\norder: 2\nstatus: draft\n---\nText");
        await writeFile(path.join(dir, "docs", "no-order.mdx"), "---\ntitle: No order\ndescription: D.\n---\nText");
        await writeFile(path.join(dir, "not-in-a-section.mdx"), "---\ntitle: Root\ndescription: D.\norder: 1\n---\nText");
        expect((await buildSearchIndex(dir)).map(entry => entry.path)).toEqual(["docs/final"]);
    });
});
