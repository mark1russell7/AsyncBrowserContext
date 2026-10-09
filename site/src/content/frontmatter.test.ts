import { describe, expect, it } from "vitest";
import { parsePageMeta } from "./frontmatter";

describe("parsePageMeta", () => {
    it("accepts valid frontmatter", () => {
        const result = parsePageMeta({ title : "Overview", description : "About.", order : 2, status : "final" }, "Fallback");
        expect(result.errors).toEqual([]);
        expect(result.meta).toEqual({ title : "Overview", description : "About.", order : 2, status : "final" });
    });

    it("keeps the status optional", () => {
        const result = parsePageMeta({ title : "A", description : "", order : 0 }, "Fallback");
        expect(result.errors).toEqual([]);
        expect(result.meta.status).toBeUndefined();
    });

    it("uses safe values and marks the page as a draft for invalid fields", () => {
        const result = parsePageMeta({ title : " ", order : "first", status : "done" }, "Event loop");
        expect(result.meta).toEqual({ title : "Event loop", description : "", order : Number.MAX_SAFE_INTEGER, status : "draft" });
        expect(result.errors).toHaveLength(4);
    });

    it("accepts the wide layout and rejects other layouts", () => {
        expect(parsePageMeta({ title : "A", description : "", order : 0, layout : "wide" }, "F").meta.layout).toBe("wide");
        const invalid = parsePageMeta({ title : "A", description : "", order : 0, layout : "narrow" }, "F");
        expect(invalid.errors).toEqual(["Set `layout` to \"wide\", or remove it."]);
        expect(invalid.meta.layout).toBeUndefined();
    });

    it("reports a missing frontmatter", () => {
        const result = parsePageMeta(undefined, "Page");
        expect(result.errors[0]).toBe("The page has no frontmatter.");
        expect(result.meta.title).toBe("Page");
    });
});
