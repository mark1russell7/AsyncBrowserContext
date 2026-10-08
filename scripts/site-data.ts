/**
 * This script writes the data files of the website (`site/public/data/`) from
 * the results of the test tools. Start it with `pnpm site:data`.
 *
 * - `bench.json` comes from `bench/results/latest.json` (`pnpm bench`).
 * - `mutation.json` has the mutants of the review, and the summary of
 *   `reports/mutation/mutation.json` (`pnpm mutation`).
 * - `browsers.json` comes from a run of the browser tests. The script starts
 *   this run when you give the option `--browsers`.
 * - `probes.json` has the results of the review. The regression tests examine
 *   them. The script sets only its time.
 *
 * The script does not change a file when its source does not exist.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type BrowserType } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "site", "public", "data");
const generated = new Date().toISOString();

function readJson<T>(file : string) : T | undefined {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) as T : undefined;
}

function writeData(name : string, value : object) : void {
    fs.writeFileSync(path.join(dataDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
    console.log(`wrote site/public/data/${name}.json`);
}

interface BenchResults {
    readonly date : string;
    readonly environment : { readonly node : string; readonly os : string; readonly cpu : string };
    readonly rows : readonly { readonly benchmark : string; readonly plainMs : number; readonly transformOnlyMs : number | null; readonly libraryMs : number | null }[];
}

function writeBench() : void {
    const results = readJson<BenchResults>(path.join(root, "bench", "results", "latest.json"));
    if (results === undefined) {
        console.log("no bench/results/latest.json: start pnpm bench first");
        return;
    }
    writeData("bench", {
        generated : results.date,
        environment : results.environment,
        rows : results.rows.map((row) => ({
            benchmark : row.benchmark,
            plainMs : row.plainMs,
            transformOnlyMs : row.transformOnlyMs ?? 0,
            libraryMs : row.libraryMs ?? 0,
        })),
    });
}

/** The mutants of the review of 2026-10-08 (docs/remediation-plan.md, Appendix C), with the old tests. */
const REVIEW_MUTANTS = [
    { mutant : "real", description : "The old runtime without a change, run 1", suite : "old", passed : 217, total : 217 },
    { mutant : "real", description : "The old runtime without a change, run 2 (three speed tests failed)", suite : "old", passed : 214, total : 217 },
    { mutant : "m1", description : "No Promise patches", suite : "old", passed : 202, total : 217 },
    { mutant : "m2", description : "No timer patches", suite : "old", passed : 207, total : 217 },
    { mutant : "m3", description : "No restore after await", suite : "old", passed : 101, total : 217 },
    { mutant : "m4", description : "No async support", suite : "old", passed : 82, total : 217 },
    { mutant : "m5", description : "One global value for each variable, never restored", suite : "old", passed : 148, total : 217 },
    { mutant : "m6", description : "then uses the registration context", suite : "old", passed : 214, total : 217 },
];

interface MutationReport {
    readonly files : Record<string, { readonly mutants : readonly { readonly status : string }[] }>;
}

function writeMutation() : void {
    const report = readJson<MutationReport>(path.join(root, "reports", "mutation", "mutation.json"));
    let stryker : object | undefined;
    if (report !== undefined) {
        const counts = new Map<string, number>();
        for (const file of Object.values(report.files)) {
            for (const mutant of file.mutants) {
                counts.set(mutant.status, (counts.get(mutant.status) ?? 0) + 1);
            }
        }
        const count = (status : string) : number => counts.get(status) ?? 0;
        const killed = count("Killed");
        const timeout = count("Timeout");
        const survived = count("Survived");
        const noCoverage = count("NoCoverage");
        const covered = killed + timeout + survived;
        stryker = {
            score : covered === 0 ? 0 : (100 * (killed + timeout)) / (covered + noCoverage),
            killed,
            survived,
            timeout,
            noCoverage,
            total : [...counts.values()].reduce((sum, value) => sum + value, 0),
            scope : Object.keys(report.files).map((file) => file.replace(/\\/g, "/")).sort(),
        };
    }
    writeData("mutation", { generated, rows : REVIEW_MUTANTS, ...(stryker === undefined ? {} : { stryker }) });
}

interface VitestJsonReport {
    readonly numPassedTests : number;
    readonly numFailedTests : number;
    readonly numPendingTests : number;
    readonly numTodoTests : number;
}

const BROWSER_TYPES : Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };

async function writeBrowsers() : Promise<void> {
    const selected = (process.env["BROWSERS"] ?? (process.platform === "win32" ? "chromium,firefox" : "chromium,firefox,webkit")).split(",").map((name) => name.trim());
    const rows = [];
    for (const browser of selected) {
        const type = BROWSER_TYPES[browser];
        if (type === undefined) {
            continue;
        }
        const output = path.join(os.tmpdir(), `async-browser-context-${browser}.json`);
        try {
            execSync(`npx vitest run --project "browser (${browser})" --reporter=json --outputFile="${output}"`, { cwd : root, stdio : "ignore", env : { ...process.env, BROWSERS : browser } });
        } catch {
            // A failed test gives a non-zero exit code. The report still has the counts.
        }
        const report = readJson<VitestJsonReport>(output);
        if (report === undefined) {
            continue;
        }
        const instance = await type.launch();
        const version = instance.version();
        await instance.close();
        rows.push({ browser, version, passed : report.numPassedTests, failed : report.numFailedTests, skipped : report.numPendingTests + report.numTodoTests });
    }
    writeData("browsers", { generated, rows });
}

function writeProbes() : void {
    const file = path.join(dataDir, "probes.json");
    const probes = readJson<Record<string, unknown>>(file);
    if (probes === undefined) {
        return;
    }
    delete probes["sample"];
    writeData("probes", { ...probes, generated });
}

writeBench();
writeMutation();
writeProbes();
if (process.argv.includes("--browsers")) {
    await writeBrowsers();
}
