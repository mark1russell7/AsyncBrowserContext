/**
 * The browser benchmark (pnpm bench:browsers). It measures `await` in
 * Chromium, Firefox and WebKit with Playwright:
 *
 * - **Native**: the page without the library and without a transform.
 * - **Babel helper**: `@babel/plugin-transform-async-generator-functions` and
 *   `@babel/plugin-transform-async-to-generator` with their own helpers,
 *   without the library. Each step of the helpers is a `then` callback, as
 *   in the code of many compiled packages.
 * - **Library**: the patches and the Vite plugin of the library.
 *
 * The workloads are one async function with 50,000 awaits of `null`, one
 * async function with 50,000 awaits of resolved promises, a `for await`
 * loop over an async generator with 50,000 steps (each with one `await`),
 * and a chain of 50,000 `then` callbacks. The timers of the browsers have a
 * resolution of 0.1 ms to 1 ms. Thus one run repeats the workload until at
 * least 100 ms have passed, and divides the time by the number of
 * repetitions. Each value is the time of 50,000 steps: the median of 7 runs.
 * Each case has its own page and browser context. The runs of the cases
 * alternate, and the order of the cases changes in each run.
 *
 * Without `BROWSERS`, the script measures all three engines. When one of them
 * does not start, the script stops with an error and writes no results. Set
 * `BROWSERS` to a comma list, for example `chromium,firefox`, to measure only
 * these engines. The script writes `bench/results/browsers.json` and shows a
 * table. Set `BENCH_DIST` to the `dist` folder of a different build, for
 * example of a published version, to measure that build in the column
 * "Library".
 *
 * Playwright controls Firefox with the debugger API. Firefox then records an
 * async stack for each `then` callback, so `then` callbacks take more time
 * than without Playwright (docs/performance.md).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformAsync } from "@babel/core";
import asyncGeneratorFunctions from "@babel/plugin-transform-async-generator-functions";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { build, type Plugin } from "vite";
import { asyncContext as sourcePlugin } from "../src/vite/plugin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const work = path.join(root, "node_modules", ".cache", "abc-browsers");
const slash = (file : string) : string => file.split(path.sep).join("/");
const dist = (file : string) : string => slash(path.join(process.env["BENCH_DIST"] ?? path.join(root, "dist"), file));
/** The Vite plugin of the measured build: the plugin of `BENCH_DIST`, or the plugin of this repository. */
const asyncContext : typeof sourcePlugin = process.env["BENCH_DIST"] === undefined
    ? sourcePlugin
    : (await import(pathToFileURL(path.join(process.env["BENCH_DIST"], "vite", "plugin.js")).href) as { asyncContext : typeof sourcePlugin }).asyncContext;

const COUNT = 50_000;
const RUNS = 7;
/** The minimum time of one run, in ms. A run repeats its workload until this time has passed. */
const MIN_RUN_MS = 100;

/** The page: each workload gives the mean duration of one repetition (COUNT steps) in ms. */
const WORKLOADS = `
async function awaitValues(count) {
    for (let index = 0; index < count; index++) await null;
}
async function awaitPromises(promises) {
    let sum = 0;
    for (const promise of promises) sum += await promise;
    return sum;
}
async function* ticks(count) {
    for (let index = 0; index < count; index++) {
        await null;
        yield index;
    }
}
async function consumeTicks(count) {
    let sum = 0;
    for await (const value of ticks(count)) sum += value;
    return sum;
}
function thenChain(count) {
    let promise = Promise.resolve(0);
    for (let index = 0; index < count; index++) promise = promise.then((value) => value + 1);
    return promise;
}
async function time(work) {
    let repetitions = 0;
    let elapsed = 0;
    const start = performance.now();
    do {
        await work();
        repetitions++;
        elapsed = performance.now() - start;
    } while (elapsed < ${MIN_RUN_MS});
    return elapsed / repetitions;
}
window.workloads = {
    "await null": (count) => time(() => awaitValues(count)),
    "await a promise": (count) => {
        const promises = Array.from({ length : count }, (_, index) => Promise.resolve(index));
        return time(() => awaitPromises(promises));
    },
    "async generator": (count) => time(() => consumeTicks(count)),
    "then chain": (count) => time(() => thenChain(count)),
};
`;

/** Babel with its own helper for async functions, without the library. */
const babelHelper : Plugin = {
    name : "babel-helper",
    enforce : "post",
    async transform(code, id) {
        if (!id.endsWith("main.js")) {
            return null;
        }
        const result = await transformAsync(code, { filename : id, babelrc : false, configFile : false, plugins : [asyncGeneratorFunctions, asyncToGenerator] });
        return result?.code ?? null;
    },
};

const CASES : Readonly<Record<string, { readonly head : string; readonly plugins : Plugin[] }>> = {
    "Native" : { head : "", plugins : [] },
    "Babel helper" : { head : "", plugins : [babelHelper] },
    "Library" : { head : `import ${JSON.stringify(dist("index.js"))};`, plugins : [asyncContext({ runtime : dist("runtime.js") })] },
};

const CASE_NAMES : readonly string[] = Object.keys(CASES);

const ALL_ENGINES : Readonly<Record<string, readonly [string, BrowserType]>> = {
    chromium : ["Chromium", chromium],
    firefox : ["Firefox", firefox],
    webkit : ["WebKit", webkit],
};

/** The engines to measure: all engines, or the engines that `BROWSERS` selects. */
function selectEngines() : { readonly engines : readonly (readonly [string, BrowserType])[]; readonly explicit : boolean } {
    const selected = process.env["BROWSERS"];
    if (selected === undefined || selected.trim() === "") {
        return { engines : Object.values(ALL_ENGINES), explicit : false };
    }
    const engines = selected.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== "").map((name) => {
        const engine = ALL_ENGINES[name];
        if (engine === undefined) {
            throw new Error(`BROWSERS has the name "${name}". The names are ${Object.keys(ALL_ENGINES).join(", ")}.`);
        }
        return engine;
    });
    return { engines, explicit : true };
}

async function buildPages() : Promise<void> {
    for (const [name, { head, plugins }] of Object.entries(CASES)) {
        const directory = path.join(work, name);
        fs.mkdirSync(directory, { recursive : true });
        fs.writeFileSync(path.join(directory, "index.html"), `<!doctype html><html><body><script type="module" src="./main.js"></script></body></html>`);
        fs.writeFileSync(path.join(directory, "main.js"), `${head}\n${WORKLOADS}`);
        await build({ root : directory, base : "./", configFile : false, logLevel : "silent", plugins, build : { outDir : "out", emptyOutDir : true, minify : true } });
    }
}

function serve() : Promise<{ port : number; close : () => void }> {
    const server = http.createServer((request, response) => {
        const relative = decodeURIComponent((request.url ?? "/").split("?", 1)[0] ?? "/").replace(/\/$/, "/index.html");
        const file = path.join(work, relative);
        if (!file.startsWith(work) || !fs.existsSync(file)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type" : file.endsWith(".js") ? "text/javascript" : "text/html" }).end(fs.readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
        resolve({ port : (server.address() as { port : number }).port, close : () => server.close() });
    }));
}

const median = (values : number[]) : number => values.toSorted((a, b) => a - b)[values.length >> 1] ?? Number.NaN;

/** Measures all workloads of all cases in one engine. The runs of the cases alternate, and the order of the cases turns in each run. */
async function measureEngine(browser : Browser, port : number) : Promise<Record<string, Record<string, number>>> {
    const pages = new Map<string, Page>();
    for (const name of CASE_NAMES) {
        // Each case has its own browser context, so that the pages do not share a process or a heap.
        const page = await (await browser.newContext()).newPage();
        await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(name)}/out/`);
        await page.waitForFunction(() => "workloads" in window);
        pages.set(name, page);
    }
    const first = pages.get(CASE_NAMES[0]!)!;
    const workloads = await first.evaluate(() => Object.keys((window as unknown as { workloads : object }).workloads));
    const results : Record<string, Record<string, number>> = {};
    for (const workload of workloads) {
        const times = new Map<string, number[]>(CASE_NAMES.map((name) => [name, []]));
        for (let run = 0; run < RUNS; run++) {
            const order = CASE_NAMES.map((_, index) => CASE_NAMES[(index + run) % CASE_NAMES.length]!);
            for (const name of order) {
                const page = pages.get(name)!;
                await page.bringToFront();
                times.get(name)!.push(await page.evaluate(([key, count]) => (window as unknown as { workloads : Record<string, (count : number) => Promise<number>> }).workloads[key]!(count), [workload, COUNT] as const));
            }
        }
        results[workload] = Object.fromEntries(CASE_NAMES.map((name) => [name, median(times.get(name)!)]));
    }
    for (const page of pages.values()) {
        await page.context().close();
    }
    return results;
}

const { engines, explicit } = selectEngines();
// An engine that does not start stops the script before the measurement, so that the results do not lose an engine without a message.
for (const [engine, type] of engines) {
    try {
        await (await type.launch()).close();
    } catch (error) {
        const hint = explicit ? "" : " Set BROWSERS to measure only the other engines, for example BROWSERS=chromium,firefox.";
        throw new Error(`${engine} does not start on this computer.${hint}`, { cause : error });
    }
}

execSync("npx tsc -p tsconfig.build.json", { cwd : root, stdio : "ignore" });
await buildPages();
const server = await serve();
const rows : { engine : string; version : string; workload : string; ms : Record<string, number> }[] = [];
try {
    for (const [engine, type] of engines) {
        const browser = await type.launch();
        try {
            for (const [workload, ms] of Object.entries(await measureEngine(browser, server.port))) {
                rows.push({ engine, version : browser.version(), workload, ms });
            }
        } finally {
            await browser.close();
        }
    }
} finally {
    server.close();
}

fs.mkdirSync(path.join(here, "results"), { recursive : true });
fs.writeFileSync(path.join(here, "results", "browsers.json"), `${JSON.stringify({ date : new Date().toISOString(), count : COUNT, runs : RUNS, minRunMs : MIN_RUN_MS, rows }, null, 2)}\n`);
console.log(`\nThe time of ${COUNT.toLocaleString("en")} steps, in ms (the median of ${RUNS} runs, each run at least ${MIN_RUN_MS} ms)`);
console.table(rows.map((row) => ({ engine : `${row.engine} ${row.version}`, workload : row.workload, ...Object.fromEntries(Object.entries(row.ms).map(([name, ms]) => [name, ms.toFixed(1)])) })));
console.log("wrote bench/results/browsers.json");
