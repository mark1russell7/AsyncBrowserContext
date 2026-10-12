import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Linter } from "../lint.js";

const linter = new Linter(resolveConfig({ technicalVerbs : ["flush"] }, { root : "/" }));
const lint = (comment : string, path : string = "a.ts") =>
    linter.lintText(`${comment}\nexport const a = 1;\n`, path).filter((finding) => finding.ruleId === "missing-subject");
const found = (comment : string) : string[] => lint(comment).map((finding) => comment.split("\n")[finding.line - 1]!.slice(finding.column - 1, finding.endColumn - 1));

describe("missing-subject", () => {
    it("reports a doc comment sentence that starts with a verb", () => {
        expect(found("/** Returns the value. */")).toEqual(["Returns"]);
        expect(found("/** Creates a monitor and starts it. */")).toEqual(["Creates"]);
        expect(found("/** Stops `monitor` while the page is hidden. */")).toEqual(["Stops"]);
        expect(found("/** Flushes the buffer. */")).toEqual(["Flushes"]);
        expect(found("/** Applies the change. */")).toEqual(["Applies"]);
        expect(found("/** Runs in the worker. */")).toEqual(["Runs"]);
        const findings = lint("/** Returns the value. */");
        expect(findings[0]!.severity).toBe("error");
        expect(findings[0]!.message).toContain("This function gives");
    });

    it("reports a sentence that starts with an auxiliary verb or a participle", () => {
        expect(found("/** Can be null. */")).toEqual(["Can"]);
        expect(found("/** Is true when the page is visible. */")).toEqual(["Is"]);
        expect(found("/** Called when the worker stops. */")).toEqual(["Called"]);
        expect(found("/** Used by the worker. */")).toEqual(["Used"]);
    });

    it("examines each sentence of the summary and of @remarks", () => {
        expect(found("/**\n * The monitor. Returns the value.\n * @remarks\n * Uses a timer.\n */")).toEqual(["Returns", "Uses"]);
    });

    it("does not report a sentence with a subject, a question or a plural noun subject", () => {
        expect(found("/** This function returns the value. */")).toEqual([]);
        expect(found("/** Is it visible? */")).toEqual([]);
        expect(found("/** Samples at or above this value wait for evidence. */")).toEqual([]);
        expect(found("/** Values are clamped. */")).toEqual([]);
        expect(found("/** Samples per calibration round. */")).toEqual([]);
        expect(found("/** Tags whose content is code. */")).toEqual([]);
        expect(found("/** Monitors ask whether the window overlaps. */")).toEqual([]);
        expect(found("/** Handles returned by the setup. */")).toEqual([]);
        expect(found("/** Settings for the run. */")).toEqual([]);
        expect(found("/** Based on the frame time, the monitor reports lag. */")).toEqual([]);
        expect(found("/** Status of the monitor. */")).toEqual([]);
        expect(found("/** `stop()` releases the timers. */")).toEqual([]);
    });

    it("does not examine block tag text, list items or Markdown files", () => {
        expect(found("/**\n * The function.\n * @returns Returns the value.\n * - Returns a list item.\n */")).toEqual([]);
        expect(linter.lintText("Returns the value.", "doc.md").filter((finding) => finding.ruleId === "missing-subject")).toEqual([]);
    });
});
