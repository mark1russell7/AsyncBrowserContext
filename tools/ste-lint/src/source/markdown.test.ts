import { describe, expect, it } from "vitest";
import { isDelimiterRow, parseBlocks, parseDirective, splitCells, type Block, type ProseBlock } from "./blocks.js";
import { splitLines } from "./lines.js";
import { extractMarkdown, stripFrontMatter } from "./markdown.js";

const prose = (blocks : readonly Block[]) : ProseBlock[] => blocks.filter((block) : block is ProseBlock => block.kind !== "directive");

/** The text of each prose block, with its kind. */
function outline(markdown : string, mdx : boolean = false) : string[] {
    return prose(extractMarkdown(markdown, { mdx }).blocks.map((entry) => entry.block)).map((block) => {
        const text = block.lines.map((line) => line.text).join(" / ");
        const list = block.list === null ? "" : block.list.ordered ? " (ol)" : " (ul)";
        const extra = block.kind === "heading" ? ` h${block.headingDepth}` : block.tableHeader ? " th" : "";
        return `${block.kind}${extra}${list}${block.quote ? " (quote)" : ""}: ${text}`;
    });
}

describe("Markdown block extraction", () => {
    it("keeps paragraphs and headings, and joins the lines of a paragraph", () => {
        expect(outline("# Title\n\nFirst line\nsecond line.\n\n## Part ##\n\nText.")).toEqual([
            "heading h1: Title",
            "paragraph: First line / second line.",
            "heading h2: Part",
            "paragraph: Text.",
        ]);
    });

    it("finds setext headings", () => {
        expect(outline("Title\n=====\n\nSub\n---\n")).toEqual(["heading h1: Title", "heading h2: Sub"]);
    });

    it("removes fenced code, indented code and thematic breaks", () => {
        const markdown = "Before.\n\n```ts\nconst a = 1; // should\n```\n\n~~~\nmay\n~~~\n\n    indented code;\n\n***\n\nAfter.";
        expect(outline(markdown)).toEqual(["paragraph: Before.", "paragraph: After."]);
    });

    it("does not treat an indented line in a paragraph as code", () => {
        expect(outline("A paragraph\n    that continues.")).toEqual(["paragraph: A paragraph / that continues."]);
    });

    it("does not treat a backtick run with a backtick in its info string as a fence", () => {
        expect(outline("``` `x` ```\n\nNext.")).toEqual(["paragraph: ``` `x` ```", "paragraph: Next."]);
    });

    it("keeps an unclosed fence as code to the end of the file", () => {
        expect(outline("Text.\n\n```\ncode\nmore")).toEqual(["paragraph: Text."]);
    });

    it("gives each list item as a block, with the list type", () => {
        const markdown = "- one\n- two\n  continues\n\n1. step one\n2. step two\n   - nested\n";
        expect(outline(markdown)).toEqual([
            "paragraph (ul): one",
            "paragraph (ul): two / continues",
            "paragraph (ol): step one",
            "paragraph (ol): step two",
            "paragraph (ul): nested",
        ]);
    });

    it("accepts lazy continuation lines in a list item", () => {
        expect(outline("- item one\ncontinues here\n- item two")).toEqual([
            "paragraph (ul): item one / continues here",
            "paragraph (ul): item two",
        ]);
    });

    it("keeps a paragraph after a list item that has a blank line before it", () => {
        expect(outline("- item\n\n  second paragraph\n\nOutside.")).toEqual([
            "paragraph (ul): item",
            "paragraph (ul): second paragraph",
            "paragraph: Outside.",
        ]);
    });

    it("lets a bullet list interrupt a paragraph, but not an ordered list that starts after 1", () => {
        expect(outline("Lead-in:\n- item")).toEqual(["paragraph: Lead-in:", "paragraph (ul): item"]);
        expect(outline("The year\n2024. was good")).toEqual(["paragraph: The year / 2024. was good"]);
    });

    it("handles empty list items and wide markers", () => {
        expect(outline("-\n  text\n\n-      code\n")).toEqual(["paragraph (ul): text"]);
    });

    it("parses block quotes and removes a GitHub alert marker", () => {
        expect(outline("> [!NOTE]\n> The note text.\nlazy line.\n\n> # Quoted heading")).toEqual([
            "paragraph (quote): The note text. / lazy line.",
            "heading h1 (quote): Quoted heading",
        ]);
    });

    it("gives table cells as separate blocks, and marks the header cells", () => {
        const markdown = "| Name | Use |\n| --- | :-: |\n| `a\\|b` | Shows the value. |\n| x | |\n\nAfter.";
        expect(outline(markdown)).toEqual([
            "table-cell th: Name",
            "table-cell th: Use",
            "table-cell: `a\\|b`",
            "table-cell: Shows the value.",
            "table-cell: x",
            "paragraph: After.",
        ]);
    });

    it("finds a table directly after a paragraph", () => {
        expect(outline("Intro\n| a | b |\n|---|---|\n| c | d |")).toEqual([
            "paragraph: Intro",
            "table-cell th: a",
            "table-cell th: b",
            "table-cell: c",
            "table-cell: d",
        ]);
    });

    it("removes HTML blocks, raw HTML elements and complete tag lines", () => {
        const markdown = "<div align=\"center\">\nhidden text\n</div>\n\n<script>\nlet a;\n\nb();\n</script>\n\n<img src=\"x.png\">\n\nShown <b>bold</b> text.";
        expect(outline(markdown)).toEqual(["paragraph: Shown <b>bold</b> text."]);
    });

    it("removes link reference definitions and Docusaurus admonition markers", () => {
        expect(outline("[ref]: https://example.com\n\n:::note\nThe note.\n:::")).toEqual(["paragraph: The note."]);
    });

    it("removes YAML and TOML front matter", () => {
        expect(outline("---\ntitle: Should not count\n---\nBody.")).toEqual(["paragraph: Body."]);
        expect(outline("+++\ntitle = \"x\"\n+++\nBody.")).toEqual(["paragraph: Body."]);
        const lines = splitLines("---\nno end");
        expect(stripFrontMatter(lines)).toBe(lines);
    });
});

describe("MDX", () => {
    it("removes import and export lines, JSX tags and expressions, but keeps the prose in a component", () => {
        const mdx = [
            "import { Chart } from \"./chart\";",
            "export const meta = { title : \"x\" };",
            "",
            "<Note>",
            "The prose in the note.",
            "</Note>",
            "",
            "<Chart",
            "  data={[1, 2]}",
            "  title=\"a > b\"",
            "/>",
            "",
            "<Callout>Inline prose.</Callout>",
            "",
            "{props.value > 2 ? \"a\" : \"b\"}",
            "",
            "Text.",
        ].join("\n");
        expect(outline(mdx, true)).toEqual([
            "paragraph: The prose in the note.",
            "paragraph: Inline prose.</Callout>",
            "paragraph: Text.",
        ]);
    });

    it("keeps an expression block that does not close as code to the end", () => {
        expect(outline("Text.\n\n{open(", true)).toEqual(["paragraph: Text."]);
    });

    it("finds a tag end at the end of the file when the tag does not close", () => {
        expect(outline("<Open\n  attr", true)).toEqual([]);
    });
});

describe("directives", () => {
    it("reads the command, the rules and an optional reason", () => {
        expect(parseDirective(" ste-disable-next modal-verb, semicolon -- quoted text ", 7)).toEqual({
            kind : "directive",
            command : "disable-next",
            rules : ["modal-verb", "semicolon"],
            offset : 7,
        });
        expect(parseDirective("ste-enable", 0)?.rules).toEqual([]);
        expect(parseDirective("a normal comment", 0)).toBeNull();
    });

    it("comes from HTML comments and MDX comments", () => {
        const blocks = parseBlocks(splitLines("<!-- ste-disable\nmodal-verb -->\n\n{/* ste-enable */}\n"), { mdx : true });
        expect(blocks.map((block) => block.kind === "directive" ? block.command : block.kind)).toEqual(["disable", "enable"]);
    });

    it("makes suppressions for ranges and for the next block", () => {
        const markdown = "<!-- ste-disable-next semicolon -->\nA; B.\n\nC; D.\n\n<!-- ste-disable -->\nE.\n<!-- ste-enable -->\nF.";
        const extraction = extractMarkdown(markdown, { mdx : false });
        expect(extraction.suppressions).toHaveLength(2);
        const [next, range] = extraction.suppressions;
        expect(markdown.slice(next!.start, next!.end)).toBe("A; B.");
        expect([...next!.rules!]).toEqual(["semicolon"]);
        expect(markdown.slice(range!.start, range!.end)).toContain("E.");
        expect(range!.rules).toBeNull();
    });
});

describe("table helpers", () => {
    it("finds delimiter rows", () => {
        expect(isDelimiterRow("| --- | :---: |")).toBe(true);
        expect(isDelimiterRow("--- | ---")).toBe(true);
        expect(isDelimiterRow("---")).toBe(false);
        expect(isDelimiterRow("| a | b |")).toBe(false);
    });

    it("divides rows into cells, but not at an escaped pipe or a pipe in code", () => {
        const cells = splitCells({ text : "| a | `x | y` | c \\| d |", offset : 0 });
        expect(cells.map((cell) => cell.text)).toEqual(["a", "`x | y`", "c \\| d"]);
        expect(cells[0]!.offset).toBe(2);
        expect(splitCells({ text : "a | `open", offset : 0 }).map((cell) => cell.text)).toEqual(["a", "`open"]);
    });
});
