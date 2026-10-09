import { describe, expect, it } from "vitest";
import { queryWords, search, type SearchEntry } from "./match";

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
});
