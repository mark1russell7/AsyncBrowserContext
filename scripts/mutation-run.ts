/**
 * This script gets the Stryker report of the newest passed run of
 * `.github/workflows/mutation.yml` on main. Start it with `pnpm mutation:run`
 * in a GitHub Actions job that has `GITHUB_TOKEN` and the permission
 * `actions: read`.
 *
 * The script puts the report in `reports/mutation/`, where `pnpm site:data`
 * reads it. It also writes `reports/mutation/run.json`: the ID, the link, the
 * date and the package version of that run. The site shows this run next to
 * the mutation score, and the data stamp names it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DataRun } from "./site-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "reports", "mutation");

/** The fields of one run in the output of `gh run list --json`. */
export interface ListedRun {
    readonly databaseId : number;
    readonly createdAt : string;
    readonly url : string;
    readonly headSha : string;
}

/** This function gives the newest run of the list. An empty list is an error: the site then has no score to show. */
export function newestRun(runs : readonly ListedRun[]) : ListedRun {
    const newest = [...runs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1);
    if (newest === undefined) throw new Error("The workflow mutation.yml has no passed run on main, so the site has no mutation score.");
    return newest;
}

function gh(args : readonly string[]) : string {
    return execFileSync("gh", args, { cwd : root, encoding : "utf8", stdio : ["ignore", "pipe", "inherit"] });
}

function main() : void {
    const repository = process.env["GITHUB_REPOSITORY"];
    if (repository === undefined || repository === "") throw new Error("GITHUB_REPOSITORY is not set. Start this script in GitHub Actions.");
    const runs = JSON.parse(gh(["run", "list", "--repo", repository, "--workflow", "mutation.yml", "--branch", "main", "--status", "success", "--limit", "5", "--json", "databaseId,createdAt,url,headSha"])) as ListedRun[];
    const run = newestRun(runs);
    fs.rmSync(reportDir, { recursive : true, force : true });
    gh(["run", "download", String(run.databaseId), "--repo", repository, "--name", "mutation-report", "--dir", reportDir]);
    if (!fs.existsSync(path.join(reportDir, "mutation.json"))) throw new Error(`The artifact mutation-report of run ${run.databaseId} has no mutation.json.`);
    // The version of the package at the commit of the run. The data stamp compares it with npm.
    const manifest = JSON.parse(gh(["api", `repos/${repository}/contents/package.json?ref=${run.headSha}`, "-H", "Accept: application/vnd.github.raw+json"])) as { version : string };
    const record : DataRun = { id : String(run.databaseId), url : run.url, date : run.createdAt, version : manifest.version };
    fs.writeFileSync(path.join(reportDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Stryker run ${record.id} of ${record.date} (async-browser-context ${record.version}).`);
}

/** True when Node.js started this file, and false when a test imports its functions. */
function isMainModule() : boolean {
    const started = process.argv[1];
    if (started === undefined) return false;
    const key = (file : string) : string => (process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
    return key(started) === key(fileURLToPath(import.meta.url));
}

if (isMainModule()) main();
