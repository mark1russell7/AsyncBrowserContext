import { describe, expect, it } from "vitest";
import { normalizeText, queryWords, search, type SearchEntry } from "./match";

const ENTRIES : SearchEntry[] = [
    { path : "docs/guides/react", section : "Docs", title : "React event handlers", description : "Keep the context in handlers.", headings : [{ text : "Use run() in a handler", id : "use-run-in-a-handler" }], text : "A click handler of React gets the context of the run." },
    { path : "docs/concepts/rules", section : "Docs", title : "Context rules", description : "The rules C1 to C13.", headings : [{ text : "Generators", id : "generators" }], text : "A generator keeps the context of its creation. React is not here." },
];

describe("search", () => {
    it("gives the words of a query in lower case, without punctuation", () => {
        expect(queryWords("  React, run()! ")).toEqual(["react", "run"]);
    });

    it("gives the pages that contain all the words, with the page that has a word in the title first", () => {
        const results = search(ENTRIES, "react");
        expect(results.map(result => result.entry.path)).toEqual(["docs/guides/react", "docs/concepts/rules"]);
        expect(search(ENTRIES, "react handler").map(result => result.entry.path)).toEqual(["docs/guides/react"]);
        expect(search(ENTRIES, "zone")).toEqual([]);
        expect(search(ENTRIES, "   ")).toEqual([]);
    });

    it("gives the heading that matches, and the text around the first match", () => {
        const [result] = search(ENTRIES, "generator");
        expect(result?.heading).toEqual({ text : "Generators", id : "generators" });
        expect(result?.snippet).toEqual({ before : "A ", match : "generator", after : " keeps the context of its creation. React is not here.…" });
    });

    it("marks the match in the original text when the normalization changes the length of the text", () => {
        // Each ligature gives two characters, so the normalized text is longer than the original text.
        const entry : SearchEntry = { path : "x", section : "Docs", title : "T", description : "", headings : [], text : "Der ﬁle und ﬂy run() and Café here" };
        const [result] = search([entry], "run");
        expect(result?.snippet).toEqual({ before : "Der ﬁle und ﬂy ", match : "run", after : "() and Café here…" });
        expect(search([entry], "file")[0]?.snippet?.match).toBe("ﬁle");
        expect(search([entry], "café")[0]?.snippet).toMatchObject({ match : "Café", after : " here…" });
    });

    it("gives the position in the original text of each normalized character", () => {
        const normalized = normalizeText("AﬁÉ\u{1F600}éb");
        expect(normalized.value).toBe("afie\u{1F600}eb");
        expect(normalized.start).toEqual([0, 1, 1, 2, 3, 3, 5, 7]);
        expect(normalized.end).toEqual([1, 2, 2, 3, 5, 5, 7, 8]);
    });
});
