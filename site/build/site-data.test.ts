import { describe, expect, it } from "vitest";
import { benchRows, mutationData, REVIEW_MUTANTS, strykerSummary, type MutationReport } from "../../scripts/site-data";

const REPORT : MutationReport = {
    files : {
        "src\\a.ts" : { mutants : [{ status : "Killed" }, { status : "Killed" }, { status : "Survived" }, { status : "CompileError" }] },
        "src/b.ts" : { mutants : [{ status : "Timeout" }, { status : "NoCoverage" }] },
    },
};

describe("pnpm site:data", () => {
    it("gives the Stryker score of the killed, timeout, survived and no-coverage mutants", () => {
        expect(strykerSummary(REPORT)).toEqual({
            score : 60,
            killed : 2,
            survived : 1,
            timeout : 1,
            noCoverage : 1,
            total : 6,
            scope : ["src/a.ts", "src/b.ts"],
        });
        expect(strykerSummary({ files : {} })).toMatchObject({ score : 0, total : 0 });
    });

    it("keeps the Stryker summary of mutation.json when there is no report", () => {
        const stryker = { score : 98 };
        expect(mutationData(undefined, { rows : REVIEW_MUTANTS, stryker }, "t")).toBeUndefined();
        expect(mutationData(undefined, { rows : [], stryker }, "t")).toEqual({ generated : "t", rows : REVIEW_MUTANTS, stryker });
        expect(mutationData(undefined, undefined, "t")).toEqual({ generated : "t", rows : REVIEW_MUTANTS });
        expect(mutationData(REPORT, { rows : REVIEW_MUTANTS, stryker }, "t")).toMatchObject({ stryker : { score : 60 } });
    });

    it("leaves out a benchmark that has no value for a case", () => {
        const environment = { node : "v24", os : "Linux", cpu : "x" };
        const result = benchRows({
            date : "t",
            environment,
            rows : [
                { benchmark : "full", plainMs : 1, transformOnlyMs : 2, libraryMs : 3 },
                { benchmark : "no library", plainMs : 1, transformOnlyMs : 2, libraryMs : null },
                { benchmark : "no transform", plainMs : 1, transformOnlyMs : null, libraryMs : 3 },
            ],
        });
        expect(result.rows).toEqual([{ benchmark : "full", plainMs : 1, transformOnlyMs : 2, libraryMs : 3 }]);
        expect(result.incomplete).toEqual(["no library", "no transform"]);
    });
});
