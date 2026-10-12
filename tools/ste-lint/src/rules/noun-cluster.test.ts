import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { parseDictionary } from "../dictionary.js";
import { buildLexicon } from "../lexicon.js";
import { Linter } from "../lint.js";

const lint = (text : string, file : SteConfigFile = {}) =>
    new Linter(resolveConfig(file, { root : "/" })).lintText(text, "doc.md").filter((finding) => finding.ruleId === "noun-cluster");
const found = (text : string, file : SteConfigFile = {}) : string[] => lint(text, file).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("noun-cluster", () => {
    it("reports more than 3 known nouns in sequence", () => {
        expect(found("Read the browser memory usage threshold value now.")).toEqual(["browser memory usage threshold value"]);
        const findings = lint("Read the browser memory usage threshold now.");
        expect(findings[0]!.severity).toBe("warning");
        expect(findings[0]!.message).toContain("4 nouns");
    });

    it("accepts 3 nouns, and a preposition or an article stops the group", () => {
        expect(found("Read the memory usage threshold. Read the threshold of the memory usage value.")).toEqual([]);
    });

    it("counts glossary nouns, abbreviations and code, and a multi-word technical noun as one noun", () => {
        expect(found("The heartbeat `seq` API timer value is late.", { technicalNouns : ["heartbeat"] })).toEqual(["heartbeat `seq` API timer value"]);
        expect(found("The memory usage threshold value is low.")).toEqual(["memory usage threshold value"]);
        expect(found("The memory usage threshold value is low.", { technicalNouns : ["memory usage"] })).toEqual([]);
        expect(found("The memory usage threshold value unit is low.", { technicalNouns : ["memory usage"] })).toEqual(["memory usage threshold value unit"]);
    });

    it("stops a group after a plural noun", () => {
        expect(found("The browser timers memory usage threshold.")).toEqual([]);
        expect(found("The browser memory usage thresholds are low.")).toEqual(["browser memory usage thresholds"]);
    });

    it("does not count words that are frequently verbs", () => {
        expect(found("The page queue update process value is fine.")).toEqual([]);
    });

    it("uses the nouns of the dictionary", () => {
        const config = resolveConfig({}, { root : "/" });
        const dictionary = parseDictionary({ entries : [{ word : "valve", pos : "noun" }, { word : "pump", pos : "noun" }] }, "d.json");
        const linter = new Linter(config, buildLexicon(config, dictionary));
        expect(linter.lintText("The pump valve memory usage is low.", "doc.md").filter((finding) => finding.ruleId === "noun-cluster")).toHaveLength(1);
    });

    it("uses the limit of the configuration", () => {
        expect(found("The memory usage threshold.", { limits : { nounClusterNouns : 2 } })).toEqual(["memory usage threshold"]);
    });
});
