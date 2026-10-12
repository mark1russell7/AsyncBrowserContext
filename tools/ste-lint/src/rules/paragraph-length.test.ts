import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { Linter } from "../lint.js";

const lint = (text : string, file : SteConfigFile = {}) =>
    new Linter(resolveConfig(file, { root : "/" })).lintText(text, "doc.md").filter((finding) => finding.ruleId === "paragraph-length");

const paragraph = (count : number) : string => Array.from({ length : count }, (_, i) => `Sentence ${i + 1} is short.`).join(" ");

describe("paragraph-length", () => {
    it("reports a paragraph of more than 6 sentences as a warning", () => {
        const findings = lint(paragraph(7));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ severity : "warning", line : 1, column : 1 });
        expect(findings[0]!.message).toContain("7 sentences");
    });

    it("accepts 6 sentences, and counts each paragraph separately", () => {
        expect(lint(paragraph(6))).toEqual([]);
        expect(lint(`${paragraph(4)}\n\n${paragraph(4)}`)).toEqual([]);
    });

    it("does not count an abbreviation as the end of a sentence", () => {
        expect(lint("One, e.g. two. Three. Four. Five. Six. Seven, i.e. eight.")).toEqual([]);
    });

    it("uses the limit of the configuration", () => {
        expect(lint(paragraph(3), { limits : { paragraphSentences : 2 } })).toHaveLength(1);
    });
});
