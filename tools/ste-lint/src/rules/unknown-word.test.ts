import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { parseDictionary } from "../dictionary.js";
import { buildLexicon } from "../lexicon.js";
import { Linter } from "../lint.js";

const dictionary = parseDictionary({
    entries : [
        ...["the", "a", "is", "it", "you", "and", "to", "of", "in", "on", "this", "with", "for", "can", "not", "do", "when", "file", "that"].map((word) => ({ word })),
        { word : "make", pos : "verb", forms : ["makes", "made"] },
        { word : "valve", pos : "noun" },
        { word : "open", pos : "verb", forms : ["opens", "opened"] },
        { word : "use", pos : "verb", forms : ["uses", "used"] },
        { word : "utilize", pos : "verb", approved : false, alternatives : ["use"] },
        { word : "frob", approved : false },
    ],
}, "test.json");

const lint = (text : string, file : SteConfigFile = {}, path : string = "doc.md") => {
    const config = resolveConfig(file, { root : "/" });
    return new Linter(config, buildLexicon(config, dictionary)).lintText(text, path).filter((finding) => finding.ruleId === "unknown-word");
};
const found = (text : string, file : SteConfigFile = {}) : string[] => lint(text, file).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("unknown-word", () => {
    it("is off without a dictionary", () => {
        const linter = new Linter(resolveConfig({}, { root : "/" }));
        expect(linter.lintText("Zorblat the frimble.", "doc.md").filter((finding) => finding.ruleId === "unknown-word")).toEqual([]);
    });

    it("reports words that are not in the dictionary or the glossary", () => {
        expect(found("The valve opens the zorblat.")).toEqual(["zorblat"]);
        const findings = lint("The valve opens the zorblat.");
        expect(findings[0]!.severity).toBe("warning");
        expect(findings[0]!.message).toContain("technicalNouns");
    });

    it("accepts approved forms, noun plurals and possessives, but not other verb forms", () => {
        expect(found("The valves open. It made the valve's file. It opened.")).toEqual([]);
        expect(found("It makings the file.")).toEqual(["makings"]);
    });

    it("gives the alternatives of a word that is not approved", () => {
        expect(lint("You frob it.")[0]!.message).toContain("Use an approved word, or a different construction.");
        expect(lint("Utilize it.", { rules : { "word-list" : "off" } })[0]!.message).toBe("\"utilize\" is not an approved word. Use \"use\".");
    });

    it("does not report glossary words, proper nouns, numbers, abbreviations, code or identifiers", () => {
        const file : SteConfigFile = { technicalNouns : ["heartbeat", "worker thread"], technicalVerbs : ["flush"], properNouns : ["Grafana"], allowedWords : ["okay"] };
        expect(found("The heartbeats flush in the worker thread. Grafana is okay. 42 API `zorblat` camelCase v1.2 x86.", file)).toEqual([]);
    });

    it("does not report a capitalized word after the start of a sentence, and checks each part of a hyphenated word", () => {
        expect(found("The Zorblat opens it.")).toEqual([]);
        expect(found("Zorblat opens it.")).toEqual(["Zorblat"]);
        expect(found("The valve-zorblat opens.")).toEqual(["valve-zorblat"]);
    });

    it("does not add a finding to a word that another rule reports", () => {
        expect(found("Utilize it.")).toEqual([]);
    });
});
