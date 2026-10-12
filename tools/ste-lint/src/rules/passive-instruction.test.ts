import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Linter } from "../lint.js";

const linter = new Linter(resolveConfig({}, { root : "/" }));
const lint = (text : string, path : string = "doc.md") => linter.lintText(text, path).filter((finding) => finding.ruleId === "passive-instruction");
const found = (text : string) : string[] => lint(text).map((finding) => text.split("\n")[finding.line - 1]!.slice(finding.column - 1, finding.endColumn - 1));

describe("passive-instruction", () => {
    it("reports an obligation in the passive voice in any sentence", () => {
        expect(found("The token must be set before the start. The value has to be written first. The file should be removed.")).toEqual([
            "must be set", "has to be written", "should be removed",
        ]);
        const findings = lint("The token must be set first.");
        expect(findings[0]!.severity).toBe("warning");
        expect(findings[0]!.message).toContain("imperative");
    });

    it("reports the passive voice in an imperative sentence", () => {
        expect(found("Run the build, which is triggered by CI.")).toEqual(["is triggered"]);
    });

    it("reports the passive voice in a step of an ordered list", () => {
        expect(found("1. The cache is cleared by the script.\n2. The tests are started.")).toEqual(["is cleared", "are started"]);
    });

    it("does not report a participle in a condition, which shows a state", () => {
        expect(found("Make sure that the server is started. Wait until the build is finished. If the file is deleted, start again.")).toEqual([]);
    });

    it("does not report the passive voice in a description", () => {
        expect(found("The file is created by the build. Samples are discarded when the page is hidden. It can be used.")).toEqual([]);
    });

    it("does not report \"be\" with an adjective", () => {
        expect(found("Be careful. Make sure that the value is positive.")).toEqual([]);
    });
});
