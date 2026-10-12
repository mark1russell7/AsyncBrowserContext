import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { Linter } from "../lint.js";
import { COMMON_VERBS } from "../text/words.js";
import { baseForm } from "./ing-verb.js";

const lint = (text : string, file : SteConfigFile = {}) =>
    new Linter(resolveConfig(file, { root : "/" })).lintText(text, "doc.md").filter((finding) => finding.ruleId === "ing-verb");
const found = (text : string, file : SteConfigFile = {}) : string[] => lint(text, file).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("ing-verb", () => {
    it("reports -ing forms used as verbs", () => {
        expect(found("The browser is throttling timers.")).toEqual(["throttling"]);
        expect(found("Stop it by closing the tab.")).toEqual(["closing"]);
        expect(found("Using the worker, the monitor measures lag.")).toEqual(["Using"]);
        expect(found("A timer firing every second is fine.")).toEqual(["firing"]);
        expect(found("The monitor is still waiting.")).toEqual(["waiting"]);
        const findings = lint("Stop it by closing the tab.");
        expect(findings[0]!.severity).toBe("warning");
        expect(findings[0]!.message).toContain("when you close");
    });

    it("does not report nouns, adjectives or words that are not verbs", () => {
        expect(found("The timing is good. The existing code works. Add something during the morning. The string is missing. The mark is outstanding.")).toEqual([]);
        expect(found("Logging is fast.")).toEqual([]);
    });

    it("does not examine headings", () => {
        expect(found("# Troubleshooting by restarting the worker")).toEqual([]);
    });

    it("does not report technical nouns and allowed words", () => {
        expect(found("The page is blocking the thread.", { technicalNouns : ["blocking"] })).toEqual([]);
        expect(found("The page is buffering the data.", { allowedWords : ["buffering"] })).toEqual([]);
        expect(found("Read the logging pipeline docs about closing the logging pipeline.", { technicalNouns : ["logging pipeline"] })).toEqual(["closing"]);
    });

    it("does not report a word that the word list reports", () => {
        expect(found("The worker is running.")).toEqual([]);
    });

    it("gives the base form of a known verb for the message", () => {
        expect(baseForm("running", COMMON_VERBS)).toBe("run");
        expect(baseForm("using", COMMON_VERBS)).toBe("use");
        expect(baseForm("frobnicating", COMMON_VERBS)).toBeNull();
        expect(lint("It is frobnicating the data.")[0]!.message).not.toContain("for example");
    });
});
