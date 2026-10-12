import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "../config.js";
import { Linter } from "../lint.js";

const lint = (text : string, path : string = "doc.md", file : SteConfigFile = {}) =>
    new Linter(resolveConfig(file, { root : "/" })).lintText(text, path).filter((finding) => finding.ruleId === "sentence-length");

const words = (count : number, first : string = "The") : string => [first, ...Array.from({ length : count - 1 }, (_, i) => `word${i}`)].join(" ");

describe("sentence-length", () => {
    it("reports a description of more than 25 words", () => {
        const findings = lint(`${words(26)}.`);
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ line : 1, column : 1, severity : "error" });
        expect(findings[0]!.message).toContain("26 words");
        expect(findings[0]!.message).toContain("25 words");
    });

    it("accepts a description of 25 words", () => {
        expect(lint(`${words(25)}.`)).toEqual([]);
    });

    it("uses the limit of 20 words for an instruction", () => {
        expect(lint(`${words(21, "Remove")}.`)[0]!.message).toContain("This instruction has 21 words");
        expect(lint(`${words(20, "Remove")}.`)).toEqual([]);
    });

    it("counts each code span as one word", () => {
        const code = "`pnpm --filter @lag/ste-lint exec ste-lint --format json --max-warnings 10 README.md docs`";
        expect(lint(`Run ${code} ${words(18, "now")}.`)).toEqual([]);
        expect(lint(`Run ${code} ${words(19, "now")}.`)).toHaveLength(1);
    });

    it("reports a parenthesis with more than 25 words as a separate sentence", () => {
        const findings = lint(`The value is fine (${words(26, "this")}).`);
        expect(findings).toHaveLength(1);
        expect(findings[0]!.message).toContain("text in parentheses has 26 words");
    });

    it("does not examine headings or table cells", () => {
        expect(lint(`# ${words(30)}\n\n| ${words(30)} |\n| --- |\n| ${words(30)} |`)).toEqual([]);
    });

    it("uses the limits of the configuration", () => {
        expect(lint(`${words(11)}.`, "doc.md", { limits : { descriptionWords : 10 } })).toHaveLength(1);
    });

    it("examines doc comments and the text of block tags", () => {
        expect(lint(`/** ${words(26)}. */\nexport const a = 1;`, "a.ts")).toHaveLength(1);
        expect(lint(`/**\n * @param a - ${words(26)}.\n */\nexport function f(a : number) : number { return a; }`, "a.ts")).toHaveLength(1);
    });
});
