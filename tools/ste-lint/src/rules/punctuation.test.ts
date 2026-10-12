import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Linter } from "../lint.js";
import type { RuleId } from "../types.js";

const linter = new Linter(resolveConfig({}, { root : "/" }));
const lint = (rule : RuleId, text : string, path : string = "doc.md") => linter.lintText(text, path).filter((finding) => finding.ruleId === rule);
const found = (rule : RuleId, text : string) : string[] => lint(rule, text).map((finding) => text.slice(finding.column - 1, finding.endColumn - 1));

describe("semicolon", () => {
    it("reports semicolons in prose", () => {
        const findings = lint("semicolon", "The first part; the second part.");
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({ line : 1, column : 15, severity : "error" });
        expect(findings[0]!.message).toContain("two sentences");
    });

    it("does not report semicolons in code spans, code blocks, HTML entities or URLs", () => {
        expect(lint("semicolon", "Write `a; b` and &amp; &nbsp; here.\n\n```js\nf(); g();\n```\n\nRead https://x.dev/a;b now.")).toEqual([]);
    });

    it("reports semicolons in doc comments, but not in the code", () => {
        expect(lint("semicolon", "/** A; b. */\nconst a = 1; const b = 2;", "a.ts")).toHaveLength(1);
    });
});

describe("latin-abbreviation", () => {
    it("reports e.g., i.e., etc., vs., viz., cf. and et al.", () => {
        expect(found("latin-abbreviation", "Some, e.g. this, i.e. that, etc. A vs. B, viz. C, cf. D, Smith et al. wrote.")).toEqual([
            "e.g.", "i.e.", "etc.", "vs.", "viz.", "cf.", "et al.",
        ]);
    });

    it("reports the forms without periods that cannot be other words", () => {
        expect(found("latin-abbreviation", "A vs B, and so on etc, and E.g., this.")).toEqual(["vs", "etc", "E.g."]);
    });

    it("gives the alternative in the message", () => {
        expect(lint("latin-abbreviation", "Use a tool, e.g. a linter.")[0]!.message).toContain("\"for example\"");
    });

    it("does not report other words", () => {
        expect(found("latin-abbreviation", "VS Code, IE and the cf flag are names. The etcetera word and /etc/hosts are fine. Et cetera, et cetera.")).toEqual([]);
        expect(found("latin-abbreviation", "The constructor and the prototype are words.")).toEqual([]);
    });
});

describe("about-quantity", () => {
    it("reports \"about\" before a number or a quantity", () => {
        expect(found("about-quantity", "It takes about 5 ms. About twenty runs. About a second. About an hour. About 10%. About ~3.")).toEqual([
            "about", "About", "About", "About", "About", "About",
        ]);
        expect(lint("about-quantity", "It takes about 5 ms.")[0]!.message).toContain("\"approximately\"");
    });

    it("does not report \"about\" before a topic", () => {
        expect(found("about-quantity", "Read about the monitor. It is about a page. Approximately 5 ms is fine.")).toEqual([]);
    });
});
