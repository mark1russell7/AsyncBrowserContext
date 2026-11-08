/**
 * This script writes `site/dist/data-stamps.json`, the data stamps of the
 * measured pages, in the format `data-stamp/1` of `@mark1russell7/site-pages`.
 * Start it with `pnpm site:stamps` after the site build. The freshness gate of
 * the Pages workflow reads the file, and stops the deploy when the data is old.
 *
 * The stamps come from the field `run` of the data files that the pages show
 * (`pnpm site:data`). Thus the page and the gate read one record, and no date
 * or version is typed. A data file with no run stops the build, because the
 * gate cannot name its run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DataRun } from "./site-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The package that the runs measure. The gate compares its version with npm. */
export const ENGINE = "async-browser-context";

/** The schedule of the Stryker runs gives this age limit to the pages with a mutation score. */
export const MUTATION_LIMIT = {
    days : 9,
    reason : "The mutation score comes from the Stryker run of each Sunday and Wednesday, and one failed run does not stop the deploy.",
    workflow : ".github/workflows/mutation.yml",
} as const;

/** One run of a stamp, in the format `data-stamp/1`. */
export interface StampRun {
    readonly id : string;
    readonly url : string;
    readonly date : string;
    readonly engines : Readonly<Record<string, string>>;
}

/** The content of `data-stamps.json`. */
export interface DataStamps {
    readonly schema : "data-stamp/1";
    readonly pages : readonly {
        readonly page : string;
        readonly runs : readonly StampRun[];
        readonly limit? : typeof MUTATION_LIMIT;
    }[];
}

/** The data files that a measured page shows, by name. */
export type DataFiles = Readonly<Record<string, { readonly run? : DataRun } | undefined>>;

/**
 * This function gives the runs of the named data files. Two files from one run
 * give one run, with the earlier date. A file with no run is an error.
 */
export function runsOf(files : DataFiles, names : readonly string[]) : StampRun[] {
    const runs = new Map<string, StampRun>();
    for (const name of names) {
        const run = files[name]?.run;
        if (run === undefined) throw new Error(`data/${name}.json names no run, so the data stamp cannot name the run of its values. Start pnpm site:data in GitHub Actions.`);
        const earlier = runs.get(run.id);
        if (earlier !== undefined && Date.parse(earlier.date) <= Date.parse(run.date)) continue;
        runs.set(run.id, { id : run.id, url : run.url, date : run.date, engines : { [ENGINE] : run.version } });
    }
    return [...runs.values()];
}

/**
 * This function gives the stamps of the measured pages. The home page shows the
 * size of the runtime (`size.json`), the mutation score (`mutation.json`) and
 * the time of one `get()` (`bench.json`).
 */
export function siteStamps(files : DataFiles) : DataStamps {
    return {
        schema : "data-stamp/1",
        pages : [{ page : "index.html", runs : runsOf(files, ["bench", "size", "mutation"]), limit : MUTATION_LIMIT }],
    };
}

function main() : void {
    const data = (name : string) : { run? : DataRun } => JSON.parse(fs.readFileSync(path.join(root, "site", "public", "data", `${name}.json`), "utf8")) as { run? : DataRun };
    const stamps = siteStamps({ bench : data("bench"), size : data("size"), mutation : data("mutation") });
    const out = path.join(root, "site", "dist", "data-stamps.json");
    fs.writeFileSync(out, `${JSON.stringify(stamps, null, 2)}\n`);
    for (const page of stamps.pages) console.log(`Data stamp of ${page.page}: ${page.runs.map((run) => `run ${run.id} of ${run.date}`).join(", ")}.`);
}

/** True when Node.js started this file, and false when a test imports its functions. */
function isMainModule() : boolean {
    const started = process.argv[1];
    if (started === undefined) return false;
    const key = (file : string) : string => (process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
    return key(started) === key(fileURLToPath(import.meta.url));
}

if (isMainModule()) main();
