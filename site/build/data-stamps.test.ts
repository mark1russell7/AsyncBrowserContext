import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE, MEASURED_PAGES, MUTATION_LIMIT, runsOf, siteStamps } from "../../scripts/data-stamps";
import { newestRun } from "../../scripts/mutation-run";
import { actionsRun, browserBenchData, mutationData, REVIEW_MUTANTS, sizeData, type DataRun, type MutationReport, type SizeResults } from "../../scripts/site-data";
import { validateDataFile } from "../src/data/validate";

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

describe("pnpm site:data: the size and the browser benchmark", () => {
    const bundle = (gzipBytes : number) => ({ minifiedBytes : gzipBytes * 3, gzipBytes, brotliBytes : gzipBytes - 1 });
    const results : SizeResults = {
        date : "2026-11-08T06:20:00Z",
        vite : "8.3.4",
        runtime : { entries : ["a", "a/runtime"], ...bundle(6000) },
        zone : { version : "0.16.3", ...bundle(11800) },
        transform : [{ name : "ky", version : "2.2.0", kind : "HTTP client", asyncFunctions : 28, native : bundle(100), transformed : bundle(104), transformedWithoutNames : bundle(103), loweredEs2016 : bundle(116) }],
    };

    it("copies the runtime, zone.js and each package into size.json, with the run, and the page accepts the file", () => {
        const data = sizeData(results, pagesRun("2026-11-08T06:20:00Z"));
        expect(data).toMatchObject({ generated : results.date, entries : ["a", "a/runtime"], gzipBytes : 6000, vite : "8.3.4", zone : { version : "0.16.3", gzipBytes : 11800 }, run : { id : "101" } });
        expect(validateDataFile("size", data).transform[0]?.transformed.gzipBytes).toBe(104);
        expect(sizeData(results)).not.toHaveProperty("run");
    });

    it("copies the browser benchmark into browser-bench.json, and refuses a row with no time of a case", () => {
        const bench = { date : "2026-11-08T06:30:00Z", count : 50_000, runs : 7, minRunMs : 100, rows : [{ engine : "Firefox", version : "157.0", workload : "await null", ms : { Native : 0.6, "Babel helper" : 268, Library : 3.4 } }] };
        const data = browserBenchData(bench, pagesRun(bench.date));
        expect(validateDataFile("browser-bench", data)).toMatchObject({ count : 50_000, runs : 7, run : { id : "101" }, rows : [{ engine : "Firefox", ms : { Library : 3.4 } }] });
        expect(() => browserBenchData({ ...bench, rows : [{ ...bench.rows[0]!, ms : { Native : 1, Library : 2 } }] })).toThrow("Firefox await null has no time of the case \"Babel helper\"");
    });
});

describe("pnpm site:stamps", () => {
    const files = {
        bench : { run : pagesRun("2026-11-08T06:25:00Z") },
        size : { run : pagesRun("2026-11-08T06:20:00Z") },
        mutation : { run : strykerRun },
        "browser-bench" : { run : pagesRun("2026-11-08T06:30:00Z") },
        browsers : { run : pagesRun("2026-11-08T06:35:00Z") },
    };

    it("gives the home page one run for each run of its data files, with the earlier date of one run", () => {
        expect(runsOf(files, ["bench", "size", "mutation"])).toEqual([
            { id : "101", url : "https://github.com/o/r/actions/runs/101", date : "2026-11-08T06:20:00Z", engines : { [ENGINE] : "0.3.0" } },
            { id : "90", url : "https://github.com/o/r/actions/runs/90", date : "2026-11-01T04:24:45Z", engines : { [ENGINE] : "0.2.9" } },
        ]);
    });

    it("stamps the home page and the results page with the age limit of the Stryker runs", () => {
        const stamps = siteStamps(files);
        expect(stamps.schema).toBe("data-stamp/1");
        expect(stamps.pages.map(page => page.page)).toEqual(["index.html", "testing/performance/index.html", "testing/results/index.html"]);
        expect(stamps.pages.map(page => page.limit)).toEqual([MUTATION_LIMIT, undefined, MUTATION_LIMIT]);
    });

    it("stamps the performance page with the run of the build, and the results page also with the Stryker run", () => {
        const [, performance, results] = siteStamps(files).pages;
        expect(performance?.runs.map(run => [run.id, run.date])).toEqual([["101", "2026-11-08T06:20:00Z"]]);
        expect(results?.runs.map(run => run.id)).toEqual(["90", "101"]);
    });

    // The freshness gate compares only the versions of the newest run of a page with npm. After a release, the newest
    // Stryker run names the old version until the next Stryker run. Each page with the Stryker run therefore also
    // names a run of the Pages build, which is always newer, so the old version of the Stryker run does not stop the deploy.
    it("gives each page a run of the Pages build as its newest run, also when the Stryker run names an older version", () => {
        for (const stamp of siteStamps(files).pages) {
            const newest = [...stamp.runs].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
            expect(newest, stamp.page).toMatchObject({ id : "101", engines : { [ENGINE] : "0.3.0" } });
        }
    });

    it("stamps only pages that the site has: the home page and one MDX page for each other page", () => {
        for (const { page } of MEASURED_PAGES) {
            if (page === "index.html") continue;
            const content = new URL(`../content/${page.replace(/\/index\.html$/, "")}.mdx`, import.meta.url);
            expect(existsSync(content), `${page} has no MDX page`).toBe(true);
        }
    });

    it("fails on a data file with no run: the gate cannot name the run of a local result", () => {
        expect(() => siteStamps({ ...files, mutation : {} })).toThrow("data/mutation.json names no run");
        expect(() => siteStamps({ ...files, bench : undefined })).toThrow("data/bench.json names no run");
        expect(() => siteStamps({ ...files, browsers : {} })).toThrow("data/browsers.json names no run");
        expect(() => siteStamps({ ...files, "browser-bench" : {} })).toThrow("data/browser-bench.json names no run");
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
