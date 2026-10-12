import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Linter } from "./lint.js";
import { parseArgs, runCli, UsageError, USAGE } from "./run-cli.js";

let root : string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ste-cli-"));
    writeFileSync(join(root, "ste.config.json"), JSON.stringify({ include : ["README.md", "docs/**/*.md", "src/**/*.ts"] }));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "src"));
});

afterEach(() => {
    rmSync(root, { recursive : true, force : true });
});

function run(argv : string[], env : Record<string, string | undefined> = {}) : { code : number; stdout : string; stderr : string } {
    let stdout = "";
    let stderr = "";
    const code = runCli(argv, {
        cwd : root,
        env,
        stdout : (text) => { stdout += text; },
        stderr : (text) => { stderr += text; },
    });
    return { code, stdout, stderr };
}

describe("parseArgs", () => {
    it("reads the options and the patterns", () => {
        expect(parseArgs(["--format", "json", "--max-warnings=3", "--config", "c.json", "a.md", "docs/**"])).toEqual({
            patterns : ["a.md", "docs/**"],
            format : "json",
            maxWarnings : 3,
            configPath : "c.json",
            help : false,
        });
        expect(parseArgs(["-h"]).help).toBe(true);
        expect(parseArgs(["--format=text", "-"]).patterns).toEqual(["-"]);
    });

    it("rejects incorrect options", () => {
        expect(() => parseArgs(["--format", "xml"])).toThrow(UsageError);
        expect(() => parseArgs(["--max-warnings", "-1"])).toThrow("integer");
        expect(() => parseArgs(["--max-warnings", "many"])).toThrow("integer");
        expect(() => parseArgs(["--config"])).toThrow("needs a value");
        expect(() => parseArgs(["--nope"])).toThrow("not a known option");
    });
});

describe("runCli", () => {
    it("shows the help", () => {
        const result = run(["--help"]);
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(USAGE);
        expect(USAGE).toContain("automated approximation");
    });

    it("exits with 0 when there are no problems", () => {
        writeFileSync(join(root, "README.md"), "The monitor measures lag.\n");
        const result = run([]);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("No problems found in 1 file.");
    });

    it("exits with 1 when there are errors, and lints the default patterns of the configuration", () => {
        writeFileSync(join(root, "README.md"), "You should stop.\n");
        writeFileSync(join(root, "docs", "guide.md"), "Text; more text.\n");
        writeFileSync(join(root, "src", "a.ts"), "/** Returns the value. */\nexport const a = 1;\n");
        writeFileSync(join(root, "notes.txt"), "You should stop.\n");
        const result = run([]);
        expect(result.code).toBe(1);
        expect(result.stdout).toContain("README.md\n  1:5");
        expect(result.stdout).toContain("docs/guide.md");
        expect(result.stdout).toContain("src/a.ts");
        expect(result.stdout).not.toContain("notes.txt");
    });

    it("writes JSON", () => {
        writeFileSync(join(root, "README.md"), "Our tool.\n");
        const result = run(["--format", "json"]);
        expect(result.code).toBe(0);
        const json = JSON.parse(result.stdout) as { summary : { warnings : number }; findings : Array<{ file : string; ruleId : string }> };
        expect(json.summary.warnings).toBe(1);
        expect(json.findings[0]).toMatchObject({ file : "README.md", ruleId : "first-person" });
    });

    it("exits with 1 when there are more warnings than --max-warnings", () => {
        writeFileSync(join(root, "README.md"), "Our tool. Our page.\n");
        expect(run(["--max-warnings", "2"]).code).toBe(0);
        const result = run(["--max-warnings", "1"]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("2 warnings. The maximum is 1.");
        expect(run(["--max-warnings", "1", "--format", "json"]).stderr).toBe("");
    });

    it("lints the patterns of the command line, relative to the working directory", () => {
        writeFileSync(join(root, "other.md"), "You should stop.\n");
        writeFileSync(join(root, "README.md"), "You should stop.\n");
        const result = run(["other.md"]);
        expect(result.stdout).toContain("other.md");
        expect(result.stdout).not.toContain("README.md");
    });

    it("exits with 2 when the patterns match no files, and with 0 when the default patterns match no files", () => {
        expect(run(["missing/*.md"])).toMatchObject({ code : 2, stderr : "ste-lint: no files match the patterns.\n" });
        expect(run([])).toMatchObject({ code : 0, stderr : "ste-lint: no files to examine.\n" });
    });

    it("exits with 2 for an incorrect command line or configuration", () => {
        expect(run(["--format", "xml"]).code).toBe(2);
        writeFileSync(join(root, "ste.config.json"), JSON.stringify({ rules : { nope : "error" } }));
        const result = run([]);
        expect(result.code).toBe(2);
        expect(result.stderr).toContain("is not a known rule");
    });

    it("uses a dictionary from STE_DICTIONARY", () => {
        writeFileSync(join(root, "README.md"), "The valve opens the zorblat.\n");
        writeFileSync(join(root, "dictionary.json"), JSON.stringify(["the", "valve", "opens"]));
        const result = run(["--format", "json"], { STE_DICTIONARY : "dictionary.json" });
        const json = JSON.parse(result.stdout) as { findings : Array<{ ruleId : string; message : string }> };
        expect(json.findings.map((finding) => finding.ruleId)).toEqual(["unknown-word"]);
        expect(json.findings[0]!.message).toContain("\"zorblat\"");
    });

    it("tells the user when the dictionary file does not exist, and continues without it", () => {
        writeFileSync(join(root, "README.md"), "The valve opens the zorblat.\n");
        const result = run([], { STE_DICTIONARY : "missing.json" });
        expect(result.code).toBe(0);
        expect(result.stderr).toContain("does not exist. The unknown-word rule is off.");
        writeFileSync(join(root, "ste.config.json"), JSON.stringify({ include : ["README.md"], dictionaryPath : "missing.json" }));
        expect(run([]).stderr).toContain("(from dictionaryPath)");
    });

    it("exits with 2 for a dictionary file that is not valid", () => {
        writeFileSync(join(root, "README.md"), "Text.\n");
        writeFileSync(join(root, "dictionary.json"), "{");
        expect(run([], { STE_DICTIONARY : "dictionary.json" }).code).toBe(2);
    });

    it("exits with 2 when it cannot examine a file, and examines the other files", () => {
        writeFileSync(join(root, "README.md"), "You should stop.\n");
        writeFileSync(join(root, "docs", "guide.md"), "Text.\n");
        const original = Linter.prototype.lintFile;
        const spy = vi.spyOn(Linter.prototype, "lintFile").mockImplementation(function (this : Linter, path : string, shown? : string) {
            if (path.endsWith("guide.md")) throw new Error("cannot read");
            return original.call(this, path, shown);
        });
        try {
            const result = run([]);
            expect(result.code).toBe(2);
            expect(result.stderr).toContain("cannot examine");
            expect(result.stderr).toContain("cannot read");
            expect(result.stdout).toContain("README.md");
        } finally {
            spy.mockRestore();
        }
    });

    it("does not catch errors that are not configuration errors", () => {
        const env = new Proxy({}, { get : () => { throw new TypeError("unexpected"); } });
        expect(() => runCli([], { cwd : root, env, stdout : () => {}, stderr : () => {} })).toThrow("unexpected");
    });
});
