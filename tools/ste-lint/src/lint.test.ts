import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfig, type SteConfigFile } from "./config.js";
import { formatJson, formatText, summarize } from "./format.js";
import { fileKind, Linter, lintText } from "./lint.js";
import { getRule, RULES } from "./rules/index.js";
import { RULE_IDS, isRuleId, type Finding } from "./types.js";

const config = (file : SteConfigFile = {}) => resolveConfig(file, { root : "/" });
const ids = (findings : readonly Finding[]) : string[] => findings.map((finding) => finding.ruleId);

describe("fileKind", () => {
    it("knows Markdown, MDX and TypeScript files", () => {
        expect(fileKind("a.md")).toBe("markdown");
        expect(fileKind("a.markdown")).toBe("markdown");
        expect(fileKind("a.MDX")).toBe("mdx");
        expect(fileKind("a.ts")).toBe("typescript");
        expect(fileKind("a.tsx")).toBe("typescript");
        expect(fileKind("a.mjs")).toBe("typescript");
        expect(fileKind("a.d.ts")).toBeNull();
        expect(fileKind("a.json")).toBeNull();
    });
});

describe("Linter on TSX files", () => {
    it("examines the text that the user interface shows, and the doc comments", () => {
        const source = [
            "/** Returns the page. */",
            "export function Page() {",
            "    return <p>The run may fail; <code>pnpm results</code> utilizes the data.</p>;",
            "}",
        ].join("\n");
        const findings = lintText(source, "Page.tsx", config());
        expect(ids(findings)).toEqual(expect.arrayContaining(["missing-subject", "modal-verb", "semicolon", "word-list"]));
        const modal = findings.find((finding) => finding.ruleId === "modal-verb")!;
        expect([modal.line, modal.column]).toEqual([3, source.split("\n")[2]!.indexOf("may") + 1]);
    });

    it("does not examine the text of JSX in a .ts file", () => {
        expect(lintText("const a = 'You should stop.';", "a.ts", config())).toEqual([]);
    });
});

describe("Linter", () => {
    it("gives findings with the file, the position and the rule, in order", () => {
        const findings = lintText("# Title\n\nYou should stop; it may fail.", "doc.md", config());
        expect(findings.map((finding) => [finding.file, finding.line, finding.column, finding.ruleId, finding.severity])).toEqual([
            ["doc.md", 3, 5, "modal-verb", "error"],
            ["doc.md", 3, 16, "semicolon", "error"],
            ["doc.md", 3, 21, "modal-verb", "error"],
        ]);
        expect(findings[0]).toMatchObject({ endLine : 3, endColumn : 11 });
    });

    it("gives correct positions in files with CRLF line ends", () => {
        const markdown = lintText("# Title\r\n\r\nText. You should stop.\r\n", "doc.md", config());
        expect(markdown.map((finding) => [finding.line, finding.column])).toEqual([[3, 11]]);
        const source = lintText("/**\r\n * Text.\r\n * You should stop.\r\n */\r\nexport const a = 1;\r\n", "a.ts", config());
        expect(source.map((finding) => [finding.line, finding.column])).toEqual([[3, 8]]);
    });

    it("gives no findings for a file kind that it cannot read", () => {
        expect(lintText("You should stop.", "a.json", config())).toEqual([]);
    });

    it("applies severity overrides and turns rules off", () => {
        const findings = lintText("You should stop; now.", "doc.md", config({ rules : { "modal-verb" : "warning", semicolon : "off" } }));
        expect(findings.map((finding) => [finding.ruleId, finding.severity])).toEqual([
            ["modal-verb", "warning"],
            ["word-list", "error"],
        ]);
    });

    it("runs only the word rules on headings and table cells", () => {
        const long = Array.from({ length : 30 }, (_, i) => `word${i}`).join(" ");
        const findings = lintText(`# ${long} should\n\n| ${long} may |\n| --- |\n| x |`, "doc.md", config());
        expect(ids(findings)).toEqual(["modal-verb", "modal-verb"]);
    });

    it("applies suppression comments in Markdown", () => {
        const markdown = [
            "<!-- ste-disable-next modal-verb -->",
            "You should stop; it may fail.",
            "",
            "<!-- ste-disable -->",
            "You should stop.",
            "<!-- ste-enable -->",
            "",
            "You should stop.",
        ].join("\n");
        expect(lintText(markdown, "doc.md", config()).map((finding) => [finding.line, finding.ruleId])).toEqual([
            [2, "semicolon"],
            [8, "modal-verb"],
        ]);
    });

    it("applies suppression comments in TypeScript", () => {
        const source = "// ste-disable-next\n/** You should stop; now. */\nexport const a = 1;\n/** You should stop. */\nexport const b = 2;\n";
        expect(lintText(source, "a.ts", config()).map((finding) => [finding.line, finding.ruleId])).toEqual([[4, "modal-verb"]]);
    });

    it("keeps an ste-enable for one rule from stopping a range for all rules", () => {
        const markdown = "<!-- ste-disable semicolon modal-verb -->\nYou should; stop.\n<!-- ste-enable semicolon -->\nYou should; stop.\n\n<!-- ste-disable -->\n<!-- ste-enable semicolon -->\nYou should; stop.";
        expect(lintText(markdown, "doc.md", config()).map((finding) => [finding.line, finding.ruleId])).toEqual([[4, "semicolon"]]);
    });

    it("gives the prose units of a file", () => {
        const linter = new Linter(config());
        const units = linter.units("# Title\n\nOne. Two.\n\n```\ncode\n```", "doc.md");
        expect(units.map((unit) => [unit.kind, unit.sentences.length])).toEqual([["heading", 1], ["paragraph", 2]]);
    });

    it("reads a file from the disk", () => {
        const directory = mkdtempSync(join(tmpdir(), "ste-lint-"));
        try {
            const path = join(directory, "doc.md");
            writeFileSync(path, "You should stop.");
            const linter = new Linter(config());
            expect(linter.lintFile(path, "doc.md")[0]!.file).toBe("doc.md");
            expect(linter.lintFile(path)[0]!.file).toBe(path);
        } finally {
            rmSync(directory, { recursive : true, force : true });
        }
    });
});

describe("rules", () => {
    it("has one rule for each rule ID, with a description and an STE reference", () => {
        expect(RULES.map((rule) => rule.id)).toEqual([...RULE_IDS]);
        for (const id of RULE_IDS) {
            expect(getRule(id).description.length).toBeGreaterThan(10);
            expect(getRule(id).ste.length).toBeGreaterThan(0);
        }
        expect(isRuleId("semicolon")).toBe(true);
        expect(isRuleId("nope")).toBe(false);
    });
});

describe("format", () => {
    const findings = lintText("You should stop; now.\n\nOur tool.", "doc.md", config());
    const summary = summarize(findings, 3);

    it("counts the findings by severity and by rule", () => {
        expect(summary).toEqual({
            files : 3,
            filesWithFindings : 1,
            errors : 3,
            warnings : 1,
            byRule : {
                "modal-verb" : { errors : 1, warnings : 0 },
                "semicolon" : { errors : 1, warnings : 0 },
                "word-list" : { errors : 1, warnings : 0 },
                "first-person" : { errors : 0, warnings : 1 },
            },
        });
    });

    it("writes text with one group for each file, a summary and the counts by rule", () => {
        const text = formatText(findings, summary);
        expect(text).toContain("doc.md\n  1:5   error    Do not use the modal verb \"should\".");
        expect(text).toContain("  modal-verb");
        expect(text).toContain("4 problems (3 errors, 1 warning) in 1 file of 3.");
        expect(text).toContain("Findings by rule:");
        expect(text).toMatch(/first-person\s+1 {2}\(1 warning\)/);
        expect(formatText([], summarize([], 1))).toBe("No problems found in 1 file.\n");
    });

    it("writes JSON with the summary and the findings", () => {
        const json = JSON.parse(formatJson(findings, summary)) as { tool : string; summary : unknown; findings : Finding[] };
        expect(json.tool).toBe("ste-lint");
        expect(json.summary).toEqual(summary);
        expect(json.findings).toHaveLength(4);
    });
});
