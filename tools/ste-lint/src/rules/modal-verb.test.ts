import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Linter } from "../lint.js";

const linter = new Linter(resolveConfig({}, { root : "/" }));
const lint = (text : string, path : string = "doc.md") => linter.lintText(text, path).filter((finding) => finding.ruleId === "modal-verb");
const found = (text : string) : string[] => lint(text).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("modal-verb", () => {
    it("reports the modal verbs that are not approved, without case", () => {
        expect(found("You should stop. It may fail. It might fail. It would fail. You shall stop.")).toEqual(["should", "may", "might", "would", "shall"]);
        expect(found("SHOULD and Should are the same.")).toEqual(["SHOULD", "Should"]);
        expect(found("It shouldn't fail and wouldn't stop.")).toEqual(["shouldn't", "wouldn't"]);
    });

    it("reports the modal phrases with \"to\"", () => {
        expect(found("You have to stop. It has to stop. You need to stop. It needs to stop. You ought to stop.")).toEqual([
            "have to", "has to", "need to", "needs to", "ought to",
        ]);
    });

    it("gives the approved alternative in the message", () => {
        expect(lint("You should stop.")[0]!.message).toContain("\"must\"");
        expect(lint("It may fail.")[0]!.message).toContain("\"can\"");
        expect(lint("You need to stop.")[0]!.message).toContain("imperative");
    });

    it("uses word boundaries", () => {
        expect(found("The shoulder, mayor, nightmare and wouldbe words are fine.")).toEqual([]);
    });

    it("does not report the approved modal verbs, the month May or a noun", () => {
        expect(found("You can stop. You must stop. It will stop. It could stop.")).toEqual([]);
        expect(found("The release is in May 2026. It came on 3 May. Since May, it works.")).toEqual([]);
        expect(found("The need to stop is clear. I have two tools. It has tools.")).toEqual([]);
    });

    it("does not report modal verbs in code spans or in quoted text", () => {
        expect(found("The `should` assertion and the word \"may\" are quoted.")).toEqual([]);
    });

    it("examines headings and table cells", () => {
        expect(lint("# You should read this\n\n| a |\n| --- |\n| It may stop. |")).toHaveLength(2);
    });
});
