import { describe, expect, it } from "vitest";
import { collectComments, docCommentLines, extractTsdoc, splitSections } from "./tsdoc.js";

describe("collectComments", () => {
    it("finds line, block and doc comments, but not comment syntax in strings, templates or regular expressions", () => {
        const source = [
            "#!/usr/bin/env node",
            "// line",
            "/* block */",
            "/** doc */",
            "const a = \"/** not a comment */\";",
            "const b = `/** ${a} */`;",
            "const c = /\\/\\*\\* x \\*\\//;",
            "/**/ const d = 1;",
            "function f(/** inline doc */ x : number) { return x; }",
            "/** at the end */",
        ].join("\n");
        const comments = collectComments(source, "a.ts").map((comment) => [comment.kind, source.slice(comment.pos, comment.end)]);
        expect(comments).toEqual([
            ["line", "// line"],
            ["block", "/* block */"],
            ["doc", "/** doc */"],
            ["block", "/**/"],
            ["doc", "/** inline doc */"],
            ["doc", "/** at the end */"],
        ]);
    });

    it("parses TSX, and does not read JSX text as a comment", () => {
        const source = "/** Doc. */\nexport const A = () => <div>/** text */</div>;\n";
        expect(collectComments(source, "a.tsx").map((comment) => source.slice(comment.pos, comment.end))).toEqual(["/** Doc. */"]);
    });

    it("parses JavaScript files", () => {
        expect(collectComments("/** Doc. */\nexport const a = 1;", "a.mjs")).toHaveLength(1);
        expect(collectComments("/** Doc. */\nconst A = <b/>;", "a.jsx")).toHaveLength(1);
    });
});

describe("docCommentLines", () => {
    it("removes the comment syntax and keeps the file offsets", () => {
        const source = "/**\n * First line.\n *   indented\n no star\n */";
        const comment = collectComments(source, "a.ts")[0]!;
        const lines = docCommentLines(source, comment);
        expect(lines.map((line) => line.text)).toEqual(["", "First line.", "  indented", "no star", ""]);
        expect(source.slice(lines[1]!.offset, lines[1]!.offset + 5)).toBe("First");
    });

    it("handles a comment on one line", () => {
        const source = "/** Short. */";
        const lines = docCommentLines(source, collectComments(source, "a.ts")[0]!);
        expect(lines.map((line) => line.text)).toEqual([" Short. "]);
    });
});

describe("splitSections", () => {
    const sections = (body : string) => splitSections(body.split("\n").map((text, index) => ({ text, offset : index * 100 })))
        .map((section) => `${section.section}${section.tag === null ? "" : ` @${section.tag}`}: ${section.lines.map((line) => line.text).join(" / ")}`);

    it("divides the summary and the block tags, and removes tag names, types and parameter names", () => {
        expect(sections([
            "Summary text.",
            "@param name - The name.",
            "@param {string} [other=1] Other value",
            "  that continues.",
            "@typeParam T - The type.",
            "@returns {number} The count.",
            "@throws {Error} - When it fails.",
            "@remarks",
            "More text.",
            "@deprecated Use something else.",
        ].join("\n"))).toEqual([
            "summary: Summary text.",
            "tag @param: The name.",
            "tag @param: Other value /   that continues.",
            "tag @typeParam: The type.",
            "tag @returns: The count.",
            "tag @throws: When it fails.",
            "remarks @remarks:  / More text.",
            "tag @deprecated: Use something else.",
        ]);
    });

    it("skips @example and other sections that are not prose", () => {
        expect(sections("Summary.\n@example\nconst x = f(); // should\n@since 1.0\n@param a - Text.")).toEqual([
            "summary: Summary.",
            "tag @param: Text.",
        ]);
    });

    it("does not find tags in fenced code or in names such as @lag/core", () => {
        expect(sections("Text.\n```\n@param not a tag\n```\n@lag/core is a package.")).toEqual([
            "summary: Text. / ``` / @param not a tag / ``` / @lag/core is a package.",
        ]);
    });
});

describe("extractTsdoc", () => {
    it("gives the prose blocks of each doc comment with their origin", () => {
        const source = [
            "/**",
            " * Summary sentence.",
            " *",
            " * - item one;",
            " * @param value - The value.",
            " */",
            "export function f(value : number) : number { return value; }",
        ].join("\n");
        const { blocks } = extractTsdoc(source, "f.ts");
        expect(blocks.map((entry) => [entry.origin.tsdocSection, entry.origin.tsdocTag, entry.block.list !== null, entry.block.lines.map((line) => line.text).join(" ")])).toEqual([
            ["summary", null, false, "Summary sentence."],
            ["summary", null, true, "item one;"],
            ["tag", "param", false, "The value."],
        ]);
    });

    it("makes suppressions from line comments before a doc comment and from ranges", () => {
        const source = [
            "// ste-disable-next semicolon",
            "/** A; b. */",
            "/* ste-disable */",
            "/** C; d. */",
            "// ste-enable",
            "/** E; f. */",
        ].join("\n");
        const { suppressions } = extractTsdoc(source, "a.ts");
        expect(suppressions.map((range) => source.slice(range.start, range.end))).toEqual([
            "/** A; b. */",
            "/* ste-disable */\n/** C; d. */\n",
        ]);
    });

    it("reads a directive inside a doc comment", () => {
        const { suppressions } = extractTsdoc("/**\n * <!-- ste-disable -->\n * Text.\n */", "a.ts");
        expect(suppressions).toHaveLength(1);
    });
});
