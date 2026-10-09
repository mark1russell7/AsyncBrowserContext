import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TestSpecification, Vitest } from "vitest/node";
import { describeLostFiles, findLostFiles, LostFilesReporter, type PlannedFile } from "./lost-files.js";

const root = path.resolve("/repo");

function planned(file : string, state : string | undefined, project = "browser (firefox)") : PlannedFile {
    return {
        moduleId : path.join(root, file),
        project : { name : project },
        testModule : state === undefined ? undefined : { state : () => state },
    };
}

/** A reporter with a recorder for its failures, and a minimal Vitest object. */
function reporter(shard? : { index : number; count : number }) : { check : LostFilesReporter; failures : string[] } {
    const failures : string[] = [];
    const check = new LostFilesReporter((message) => failures.push(message));
    check.onInit({ config : { root, shard } } as unknown as Vitest);
    return { check, failures };
}

const asSpecifications = (files : PlannedFile[]) : TestSpecification[] => files as unknown as TestSpecification[];

describe("lost test files", () => {
    it("finds no lost file when each planned file passed, failed or was skipped", () => {
        expect(findLostFiles([planned("a.test.ts", "passed"), planned("b.test.ts", "failed"), planned("c.test.ts", "skipped")])).toEqual([]);
    });

    it("finds a file without a test module and a file that did not finish", () => {
        const lost = findLostFiles([planned("a.test.ts", "passed"), planned("b.test.ts", undefined, "unit"), planned("c.test.ts", "pending"), planned("d.test.ts", "queued")]);
        expect(lost.map((file) => [file.project, path.basename(file.file), file.state])).toEqual([
            ["unit", "b.test.ts", "no result"],
            ["browser (firefox)", "c.test.ts", "pending"],
            ["browser (firefox)", "d.test.ts", "queued"],
        ]);
    });

    it("names the project and the relative path of each lost file in the message", () => {
        const message = describeLostFiles(findLostFiles([planned("test/rules/c01-root.test.ts", "pending")]), root);
        expect(message).toContain("1 test file of this run did not give a finished result");
        expect(message).toContain("|browser (firefox)| test/rules/c01-root.test.ts (pending)");
    });

    it("fails a run that ended with a lost file", () => {
        const { check, failures } = reporter();
        check.onTestRunStart(asSpecifications([planned("a.test.ts", "passed"), planned("b.test.ts", "pending")]));
        check.onTestRunEnd([], [], "passed");
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain("|browser (firefox)| b.test.ts (pending)");
    });

    it("does not fail a complete run", () => {
        const { check, failures } = reporter();
        check.onTestRunStart(asSpecifications([planned("a.test.ts", "passed"), planned("b.test.ts", "skipped")]));
        check.onTestRunEnd([], [], "passed");
        expect(failures).toEqual([]);
    });

    it("does not examine a run that stopped early (bail, cancel)", () => {
        const { check, failures } = reporter();
        check.onTestRunStart(asSpecifications([planned("a.test.ts", "failed"), planned("b.test.ts", undefined)]));
        check.onTestRunEnd([], [], "interrupted");
        expect(failures).toEqual([]);
    });

    it("does not examine a run with --shard, because Vitest plans all files", () => {
        const { check, failures } = reporter({ index : 1, count : 2 });
        check.onTestRunStart(asSpecifications([planned("a.test.ts", "passed"), planned("b.test.ts", undefined)]));
        check.onTestRunEnd([], [], "passed");
        expect(failures).toEqual([]);
    });

    it("examines only the files of the current run (watch mode)", () => {
        const { check, failures } = reporter();
        check.onTestRunStart(asSpecifications([planned("a.test.ts", undefined)]));
        check.onTestRunEnd([], [], "interrupted");
        check.onTestRunStart(asSpecifications([planned("b.test.ts", "passed")]));
        check.onTestRunEnd([], [], "passed");
        expect(failures).toEqual([]);
    });
});
