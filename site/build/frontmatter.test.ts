import { describe, expect, it } from "vitest";
import { extractFrontmatter, isFrontmatterRequest, stripQuery } from "./frontmatter";

describe("isFrontmatterRequest", () => {
    it("accepts an .mdx ID with the frontmatter query", () => {
        expect(isFrontmatterRequest("/site/content/docs/index.mdx?frontmatter")).toBe(true);
        expect(isFrontmatterRequest("C:/site/content/a.mdx?frontmatter&t=123")).toBe(true);
    });

    it("rejects other IDs", () => {
        expect(isFrontmatterRequest("/site/content/docs/index.mdx")).toBe(false);
        expect(isFrontmatterRequest("/site/content/docs/index.mdx?raw")).toBe(false);
        expect(isFrontmatterRequest("/site/src/main.ts?frontmatter")).toBe(false);
    });
});

describe("stripQuery", () => {
    it("removes the query", () => {
        expect(stripQuery("/a/b.mdx?frontmatter")).toBe("/a/b.mdx");
        expect(stripQuery("/a/b.mdx")).toBe("/a/b.mdx");
    });
});

describe("extractFrontmatter", () => {
    it("reads the YAML block at the start of the file", () => {
        const source = "---\ntitle: Overview\norder: 3\nstatus: draft\n---\n\nText.\n";
        expect(extractFrontmatter(source)).toEqual({ title : "Overview", order : 3, status : "draft" });
    });

    it("reads CRLF line endings and a byte order mark", () => {
        const source = "\uFEFF---\r\ntitle: Windows\r\norder: 1\r\n---\r\nText.";
        expect(extractFrontmatter(source)).toEqual({ title : "Windows", order : 1 });
    });

    it("returns an empty object without frontmatter", () => {
        expect(extractFrontmatter("# Title\n\n---\ntitle: no\n---\n")).toEqual({});
        expect(extractFrontmatter("")).toEqual({});
    });

    it("returns an empty object if the YAML is not a mapping", () => {
        expect(extractFrontmatter("---\n- a\n- b\n---\n")).toEqual({});
    });
});
