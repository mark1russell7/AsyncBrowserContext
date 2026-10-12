/**
 * The browser benchmark (pnpm bench:browsers). It measures `await` in
 * Chromium, Firefox and WebKit with Playwright:
 *
 * - **Native**: the page without the library and without a transform.
 * - **Babel helper**: `@babel/plugin-transform-async-to-generator` with its
 *   own helper, without the library. Each step of the helper is a `then`
 *   callback, as in the code of many compiled packages.
 * - **Library**: the patches and the Vite plugin of the library.
 *
 * The workloads are one async function with 50,000 awaits of `null`, one
 * async function with 50,000 awaits of resolved promises, and a chain of
 * 50,000 `then` callbacks. Each value is the median of 7 runs in one page.
 * Firefox gives times with a resolution of 1 ms. The script writes
 * `bench/results/browsers.json` and shows a table. Set `BENCH_DIST` to the
 * `dist` folder of a different build, for example of a published version, to
 * measure that build in the column "Library".
 *
 * Playwright controls Firefox with the debugger API. Firefox then records an
 * async stack for each `then` callback, so `then` callbacks take more time
 * than without Playwright (docs/performance.md).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";
import asyncToGenerator from "@babel/plugin-transform-async-to-generator";
import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { build, type Plugin } from "vite";
import { asyncContext } from "../src/vite/plugin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const work = path.join(root, "node_modules", ".cache", "abc-browsers");
const slash = (file : string) : string => file.split(path.sep).join("/");
const dist = (file : string) : string => slash(path.join(process.env["BENCH_DIST"] ?? path.join(root, "dist"), file));

const COUNT = 50_000;
const RUNS = 7;

/** The page: each workload gives its duration in ms. */
const WORKLOADS = `
async function awaitValues(count) {
    for (let index = 0; index < count; index++) await null;
}
async function awaitPromises(promises) {
    let sum = 0;
    for (const promise of promises) sum += await promise;
    return sum;
}
function thenChain(count) {
    let promise = Promise.resolve(0);
    for (let index = 0; index < count; index++) promise = promise.then((value) => value + 1);
    return promise;
}
async function time(work) {
    const start = performance.now();
    await work();
    return performance.now() - start;
}
window.workloads = {
    "await null": (count) => time(() => awaitValues(count)),
    "await a promise": (count) => {
        const promises = Array.from({ length : count }, (_, index) => Promise.resolve(index));
        return time(() => awaitPromises(promises));
    },
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
        const result = await transformAsync(code, { filename : id, babelrc : false, configFile : false, plugins : [asyncToGenerator] });
        return result?.code ?? null;
    },
};

const CASES : Readonly<Record<string, { readonly head : string; readonly plugins : Plugin[] }>> = {
    "Native" : { head : "", plugins : [] },
    "Babel helper" : { head : "", plugins : [babelHelper] },
    "Library" : { head : `import ${JSON.stringify(dist("index.js"))};`, plugins : [asyncContext({ runtime : dist("runtime.js") })] },
};

const ENGINES : readonly (readonly [string, BrowserType])[] = [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]];

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

execSync("npx tsc -p tsconfig.build.json", { cwd : root, stdio : "ignore" });
await buildPages();
const server = await serve();
const rows : { engine : string; version : string; workload : string; ms : Record<string, number> }[] = [];
try {
    for (const [engine, type] of ENGINES) {
        let browser;
        try {
            browser = await type.launch();
        } catch {
            console.log(`${engine} does not start on this computer`);
            continue;
        }
        const results : Record<string, Record<string, number>> = {};
        for (const name of Object.keys(CASES)) {
            const page = await browser.newPage();
            await page.goto(`http://127.0.0.1:${server.port}/${encodeURIComponent(name)}/out/`);
            await page.waitForFunction(() => "workloads" in window);
            const workloads = await page.evaluate(() => Object.keys((window as unknown as { workloads : object }).workloads));
            for (const workload of workloads) {
                const times : number[] = [];
                for (let run = 0; run < RUNS; run++) {
                    times.push(await page.evaluate(([key, count]) => (window as unknown as { workloads : Record<string, (count : number) => Promise<number>> }).workloads[key]!(count), [workload, COUNT] as const));
                }
                (results[workload] ??= {})[name] = median(times);
            }
            await page.close();
        }
        for (const [workload, ms] of Object.entries(results)) {
            rows.push({ engine, version : browser.version(), workload, ms });
        }
        await browser.close();
    }
} finally {
    server.close();
}

fs.mkdirSync(path.join(here, "results"), { recursive : true });
fs.writeFileSync(path.join(here, "results", "browsers.json"), `${JSON.stringify({ date : new Date().toISOString(), count : COUNT, runs : RUNS, rows }, null, 2)}\n`);
console.log(`\nThe median time of ${COUNT.toLocaleString("en")} steps, in ms`);
console.table(rows.map((row) => ({ engine : `${row.engine} ${row.version}`, workload : row.workload, ...Object.fromEntries(Object.entries(row.ms).map(([name, ms]) => [name, ms.toFixed(1)])) })));
console.log("wrote bench/results/browsers.json");
