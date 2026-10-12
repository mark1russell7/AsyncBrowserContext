import { describe, expect, it } from "vitest";
import { indentWidth, isBlank, LineIndex, sliceLine, splitLines, stripIndent } from "./lines.js";

describe("splitLines", () => {
    it("gives each line with the offset of its first character", () => {
        expect(splitLines("ab\ncd\n")).toEqual([
            { text : "ab", offset : 0 },
            { text : "cd", offset : 3 },
            { text : "", offset : 6 },
        ]);
    });

    it("removes the \\r of a CRLF line end and adds the base offset", () => {
        expect(splitLines("a\r\nb", 10)).toEqual([
            { text : "a", offset : 10 },
            { text : "b", offset : 13 },
        ]);
    });
});

describe("LineIndex", () => {
    it("changes offsets into 1-based lines and columns", () => {
        const index = new LineIndex("ab\ncd\n\nx");
        expect(index.position(0)).toEqual({ line : 1, column : 1 });
        expect(index.position(1)).toEqual({ line : 1, column : 2 });
        expect(index.position(3)).toEqual({ line : 2, column : 1 });
        expect(index.position(6)).toEqual({ line : 3, column : 1 });
        expect(index.position(7)).toEqual({ line : 4, column : 1 });
    });
});

describe("indentation helpers", () => {
    it("counts spaces and tabs as columns", () => {
        expect(indentWidth("   x")).toBe(3);
        expect(indentWidth("\tx")).toBe(4);
        expect(indentWidth("  \tx")).toBe(4);
        expect(indentWidth("x")).toBe(0);
    });

    it("removes indentation and moves the offset", () => {
        expect(stripIndent({ text : "    code", offset : 5 }, 2)).toEqual({ text : "  code", offset : 7 });
        expect(stripIndent({ text : " x", offset : 0 }, 4)).toEqual({ text : "x", offset : 1 });
        expect(stripIndent({ text : "\tx", offset : 0 }, 4)).toEqual({ text : "x", offset : 1 });
        expect(sliceLine({ text : "abc", offset : 1 }, 10)).toEqual({ text : "", offset : 4 });
    });

    it("finds blank lines", () => {
        expect(isBlank(" \t ")).toBe(true);
        expect(isBlank(" a ")).toBe(false);
    });
});
