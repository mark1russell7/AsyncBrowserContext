import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE, MUTATION_LIMIT, runsOf, siteStamps } from "../../scripts/data-stamps";
import { newestRun } from "../../scripts/mutation-run";
import { actionsRun, mutationData, REVIEW_MUTANTS, type DataRun, type MutationReport } from "../../scripts/site-data";

const pagesRun = (date : string) : DataRun => ({ id : "101", url : "https://github.com/o/r/actions/runs/101", date, version : "0.3.0" });
const strykerRun : DataRun = { id : "90", url : "https://github.com/o/r/actions/runs/90", date : "2026-11-01T04:24:45Z", version : "0.2.9" };

describe("pnpm site:data: the run of a data file", () => {
    it("names the run of GitHub Actions, and no run outside GitHub Actions", () => {
        const env = { GITHUB_SERVER_URL : "https://github.com", GITHUB_REPOSITORY : "o/r", GITHUB_RUN_ID : "101" };
        expect(actionsRun(env, "2026-11-08T06:20:00Z", "0.3.0")).toEqual(pagesRun("2026-11-08T06:20:00Z"));
        expect(actionsRun({ ...env, GITHUB_RUN_ID : undefined }, "t", "0.3.0")).toBeUndefined();
        expect(actionsRun({}, "t", "0.3.0")).toBeUndefined();
    });

    it("gives the Stryker summary the run of its report, and keeps that run with no new report", () => {
        const report : MutationReport = { files : { "src/a.ts" : { mutants : [{ status : "Killed" }] } } };
        expect(mutationData(report, undefined, "t", strykerRun)).toMatchObject({ stryker : { score : 100 }, run : strykerRun });
        expect(mutationData(report, undefined, "t")).not.toHaveProperty("run");
        const stryker = { score : 98 };
        expect(mutationData(undefined, { rows : [], stryker, run : strykerRun }, "t")).toEqual({ generated : "t", rows : REVIEW_MUTANTS, stryker, run : strykerRun });
    });
});

describe("pnpm site:stamps", () => {
    const files = {
        bench : { run : pagesRun("2026-11-08T06:25:00Z") },
        size : { run : pagesRun("2026-11-08T06:20:00Z") },
        mutation : { run : strykerRun },
    };

    it("gives the home page one run for each run of its data files, with the earlier date of one run", () => {
        expect(runsOf(files, ["bench", "size", "mutation"])).toEqual([
            { id : "101", url : "https://github.com/o/r/actions/runs/101", date : "2026-11-08T06:20:00Z", engines : { [ENGINE] : "0.3.0" } },
            { id : "90", url : "https://github.com/o/r/actions/runs/90", date : "2026-11-01T04:24:45Z", engines : { [ENGINE] : "0.2.9" } },
        ]);
    });

    it("stamps the home page with the age limit of the Stryker runs", () => {
        const stamps = siteStamps(files);
        expect(stamps.schema).toBe("data-stamp/1");
        expect(stamps.pages.map(page => page.page)).toEqual(["index.html"]);
        expect(stamps.pages[0]?.limit).toBe(MUTATION_LIMIT);
    });

    it("fails on a data file with no run: the gate cannot name the run of a local result", () => {
        expect(() => siteStamps({ ...files, mutation : {} })).toThrow("data/mutation.json names no run");
        expect(() => siteStamps({ ...files, bench : undefined })).toThrow("data/bench.json names no run");
    });

    it("has a Stryker schedule that meets the age limit also after one failed run", () => {
        const workflow = readFileSync(new URL("../../.github/workflows/mutation.yml", import.meta.url), "utf8");
        const cron = /- cron: "(\d+) (\d+) \* \* ([\d,]+)"/.exec(workflow);
        expect(cron, "mutation.yml has one weekly cron line with a list of days").not.toBeNull();
        const days = (cron?.[3] ?? "").split(",").map(Number).sort((a, b) => a - b);
        const gaps = days.map((day, index) => ((days[(index + 1) % days.length] ?? day) - day + 7) % 7 || 7);
        // One failed run makes the data as old as two gaps, and the next run takes up to 90 minutes.
        expect(2 * Math.max(...gaps) + 90 / 1440).toBeLessThanOrEqual(MUTATION_LIMIT.days);
        expect(MUTATION_LIMIT.workflow).toBe(".github/workflows/mutation.yml");
    });
});

describe("pnpm mutation:run", () => {
    it("takes the newest passed run", () => {
        const run = (databaseId : number, createdAt : string) => ({ databaseId, createdAt, url : `u${databaseId}`, headSha : "s" });
        expect(newestRun([run(1, "2026-11-01T04:00:00Z"), run(3, "2026-11-05T04:00:00Z"), run(2, "2026-10-29T04:00:00Z")]).databaseId).toBe(3);
        expect(() => newestRun([])).toThrow("no passed run on main");
    });
});
