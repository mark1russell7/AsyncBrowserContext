/**
 * The build tool test (pnpm test:bundlers). It builds the checks of the smoke
 * test with each setup of the guide "Build tools", as a user does:
 *
 * 1. It packs the package and the fake dependency with native async
 *    functions (`test/smoke/fixture/fake-dependency`).
 * 2. It installs the two tarballs and the build tools with npm in a new
 *    folder.
 * 3. It builds the page with webpack, Rspack, Rollup and esbuild
 *    (`fixture/build.mjs`), and with Next.js (`fixture/next`).
 * 4. It opens each page in Chromium. The page writes the results of
 *    `test/smoke/fixture/checks.js` to `window.__results`.
 *
 * With the Babel preset, each result must be "A". When SWC or esbuild change
 * async functions into generators (the target ES2016), the context stays
 * through `await`, but a generator body gets the context of the `next()`
 * call (rule C5). Thus the result of the generator check is "B" for these
 * cases.
 *
 * An error on a page, or a Next.js server that ends before it answers, stops
 * the test immediately with the message. The test removes the work folder and
 * stops the servers and the browser also when a step fails.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { removeFolder } from "../scripts/folder.js";
import { resultsOf, type Results } from "../scripts/page.js";
import { startProcess, withServer } from "../scripts/process.js";
import { BROWSER_HOST, freePort } from "../vitest/free-port.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const smoke = path.join(root, "test", "smoke", "fixture");

/** The build tools, with the versions of the test. */
const TOOLS : readonly string[] = [
    "webpack@5.112.2",
    "babel-loader@10.1.1",
    "@rspack/core@2.2.8",
    "rollup@4.64.5",
    "@rollup/plugin-babel@7.1.0",
    "@rollup/plugin-node-resolve@16.0.3",
    "esbuild@0.28.2",
    "next@16.4.0",
    "react@19.3.0",
    "react-dom@19.3.0",
];

/** All checks give "A": the setup keeps each rule. */
const ALL_RULES : Results = { inExpression : "A", inDependency : "A", generator : "A", browserEvent : "A" };
/** The compiler changes async functions into generators: a generator body gets the context of the `next()` call. */
const WITHOUT_RULE_C5 : Results = { ...ALL_RULES, generator : "B" };

/** The builds of `fixture/build.mjs`. */
const STATIC_CASES : readonly (readonly [string, Results])[] = [
    ["webpack", ALL_RULES],
    ["rspack", ALL_RULES],
    ["rollup", ALL_RULES],
    ["esbuild-babel", ALL_RULES],
    ["rspack-swc-es2016", WITHOUT_RULE_C5],
    ["esbuild-es2016", WITHOUT_RULE_C5],
];

interface NextCase {
    readonly name : string;
    readonly args : readonly string[];
    /** `babel`: the Babel config of the fixture. `swc`: no Babel config, and a browserslist query that makes SWC change async functions. */
    readonly compiler : "babel" | "swc";
    readonly expected : Results;
}

const NEXT_CASES : readonly NextCase[] = [
    { name : "next-turbopack-babel", args : [], compiler : "babel", expected : ALL_RULES },
    { name : "next-webpack-babel", args : ["--webpack"], compiler : "babel", expected : ALL_RULES },
    { name : "next-turbopack-swc", args : [], compiler : "swc", expected : WITHOUT_RULE_C5 },
];

/** Runs a command in a shell (npm is a .cmd file on Windows). Each argument is in quotes. */
function run(command : string, args : readonly string[], cwd : string) : string {
    const line = [command, ...args.map((argument) => JSON.stringify(argument))].join(" ");
    return execSync(line, { cwd, encoding : "utf8", stdio : ["ignore", "pipe", "inherit"] });
}

/** Packs the package in `directory` into `destination`, and gives the path of the tarball. */
function pack(directory : string, destination : string) : string {
    const output = run("npm", ["pack", "--pack-destination", destination, "--silent"], directory).trim().split(/\r?\n/).pop() ?? "";
    return path.join(destination, output);
}

const TYPES : Readonly<Record<string, string>> = { ".html" : "text/html", ".js" : "text/javascript", ".mjs" : "text/javascript" };

/** Serves the files of `directory` on a free port of 127.0.0.1. `close()` waits until the server closed. */
async function serve(directory : string) : Promise<{ url : string; close : () => Promise<void> }> {
    const server = http.createServer((request, response) => {
        const relative = decodeURIComponent((request.url ?? "/").split("?", 1)[0] ?? "/").replace(/\/$/, "/index.html");
        const file = path.join(directory, relative);
        if (!file.startsWith(directory) || !fs.existsSync(file)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type" : TYPES[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
    });
    const port = await freePort();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, BROWSER_HOST, () => {
            server.off("error", reject);
            resolve();
        });
    });
    const close = () : Promise<void> => new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
    });
    return { url : `http://${BROWSER_HOST}:${port}/`, close };
}

/**
 * Starts `next start` in `directory`, and stops it after `use`. If the server
 * ends before it answers, the function rejects immediately with the output of
 * the server. After `use`, the function waits until the server ended
 * (test/scripts/process.ts).
 */
async function withNextServer<T>(directory : string, next : string, env : NodeJS.ProcessEnv, use : (url : string) => Promise<T>) : Promise<T> {
    const port = await freePort();
    const server = startProcess(process.execPath, [next, "start", "--port", String(port), "--hostname", BROWSER_HOST], { cwd : directory, env, echo : true });
    return await withServer(server, `http://${BROWSER_HOST}:${port}/`, use);
}

/** Makes the folder of one Next.js case from `fixture/next`. */
function nextApp(app : string, testCase : NextCase) : string {
    const directory = path.join(app, testCase.name);
    fs.cpSync(path.join(app, "next"), directory, { recursive : true });
    if (testCase.compiler === "swc") {
        // Without a Babel config, SWC compiles the code. A browser without async functions
        // in the query makes SWC change them into generators, also in node_modules.
        fs.rmSync(path.join(directory, "babel.config.js"));
        fs.rmSync(path.join(directory, "next.config.mjs"));
        fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private : true, browserslist : ["chrome 54"] }));
    }
    return directory;
}

function check(label : string, results : Results, expected : Results) : boolean {
    const pass = Object.entries(expected).every(([key, value]) => results[key] === value);
    console.log(`${pass ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(results)}${pass ? "" : ` (expected ${JSON.stringify(expected)})`}`);
    return pass;
}

/** Makes the application in `work`, and installs the two tarballs and the build tools. Gives the folder of the application. */
function install(work : string) : string {
    const app = path.join(work, "app");
    fs.cpSync(path.join(here, "fixture"), app, { recursive : true });
    for (const file of ["checks.js", "main.js"]) {
        fs.copyFileSync(path.join(smoke, file), path.join(app, file));
    }
    fs.copyFileSync(path.join(smoke, "checks.js"), path.join(app, "next", "checks.js"));
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name : "bundlers-app", private : true, type : "module" }));

    const libraryTarball = pack(root, work);
    const dependencyTarball = pack(path.join(smoke, "fake-dependency"), work);
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", libraryTarball, dependencyTarball, ...TOOLS], app);
    const babel = (JSON.parse(fs.readFileSync(path.join(app, "node_modules", "@babel", "core", "package.json"), "utf8")) as { version : string }).version;
    console.log(`Babel of babel-loader and @rollup/plugin-babel: ${babel}`);
    return app;
}

/** Builds each case and opens its page in `browser`. Gives true if each case gives its expected results. */
async function checkCases(app : string, browser : Browser) : Promise<boolean> {
    let passed = true;
    for (const [name, expected] of STATIC_CASES) {
        execFileSync(process.execPath, ["build.mjs", name], { cwd : app, stdio : "inherit" });
        const server = await serve(path.join(app, "out", name));
        try {
            passed = check(name, await resultsOf(browser, server.url), expected) && passed;
        } finally {
            await server.close();
        }
    }
    const next = path.join(app, "node_modules", "next", "dist", "bin", "next");
    const env = { ...process.env, NEXT_TELEMETRY_DISABLED : "1" };
    for (const testCase of NEXT_CASES) {
        const directory = nextApp(app, testCase);
        execFileSync(process.execPath, [next, "build", ...testCase.args], { cwd : directory, stdio : ["ignore", "ignore", "inherit"], env });
        const results = await withNextServer(directory, next, env, (url) => resultsOf(browser, url));
        passed = check(testCase.name, results, testCase.expected) && passed;
    }
    return passed;
}

async function main() : Promise<void> {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "async-browser-context-bundlers-"));
    console.log(`Work folder: ${work}`);
    try {
        const app = install(work);
        const browser = await chromium.launch();
        try {
            if (!await checkCases(app, browser)) {
                process.exitCode = 1;
            }
        } finally {
            await browser.close();
        }
    } finally {
        removeFolder(work);
    }
}

await main();
