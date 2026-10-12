import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Linter } from "../lint.js";
import type { RuleId } from "../types.js";

const linter = new Linter(resolveConfig({}, { root : "/" }));
const lint = (rule : RuleId, text : string) => linter.lintText(text, "doc.md").filter((finding) => finding.ruleId === rule);
const found = (rule : RuleId, text : string) : string[] => lint(rule, text).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("gendered-pronoun", () => {
    it("reports gendered pronouns as errors", () => {
        expect(found("gendered-pronoun", "He opens it. She saves his file. Give her the key, and him the code. It is hers. He did it himself, and she herself.")).toEqual([
            "He", "She", "his", "her", "him", "hers", "He", "himself", "she", "herself",
        ]);
        const findings = lint("gendered-pronoun", "The user saves his work.");
        expect(findings[0]!.severity).toBe("error");
        expect(findings[0]!.message).toContain("\"they\"");
    });

    it("does not report other words, code or quoted text", () => {
        expect(found("gendered-pronoun", "The theme, the shell and `he` and \"she\" are fine. They save their work.")).toEqual([]);
    });
});

describe("first-person", () => {
    it("reports I, me, my, our and us as warnings", () => {
        expect(found("first-person", "I run it. Give me the file. My file. Our tool. Tell us. Let's go. It is ours.")).toEqual([
            "I", "me", "My", "Our", "us", "Let's", "ours",
        ]);
        const findings = lint("first-person", "Our tool works.");
        expect(findings[0]!.severity).toBe("warning");
        expect(findings[0]!.message).toContain("\"we\"");
    });

    it("does not report \"we\", the abbreviation US, or I/O", () => {
        expect(found("first-person", "We release the tool in the US. The I/O is fast. You can use it.")).toEqual([]);
    });
});
