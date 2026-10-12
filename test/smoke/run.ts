/**
 * The smoke test (pnpm smoke). The test does the README setup in a new
 * application, as a user does:
 *
 * 1. It packs the package and a fake dependency with native async functions.
 * 2. It installs the two tarballs and Vite with npm in a new folder.
 * 3. It builds the application with `vite build`, starts `vite preview`, and
 *    opens the page in Chromium.
 * 4. It starts the dev server (`vite`), which pre-bundles the dependencies,
 *    and opens the page again.
 *
 * The page writes its results to `window.__results`. Each result must be "A".
 * The dependency result shows that the Vite plugin transforms the code in
 * `node_modules`.
 *
 * An error on the page, or a Vite server that ends before it answers, stops
 * the test immediately with the message. The test removes the work folder and
 * stops the servers and the browser also when a step fails. Vite operates in
 * child processes: on Windows, a process that loaded the native modules of
 * Vite locks their files, and the work folder then stays.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
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
const EXPECTED = { inExpression : "A", inDependency : "A", generator : "A", browserEvent : "A" };

/** Runs a command in a shell (npm is a .cmd file on Windows). Each argument is in quotes. */
function run(command : string, args : string[], cwd : string) : string {
    const line = [command, ...args.map((argument) => JSON.stringify(argument))].join(" ");
    return execSync(line, { cwd, encoding : "utf8", stdio : ["ignore", "pipe", "inherit"] });
}

/** Packs the package in `directory` into `destination`, and gives the path of the tarball. */
function pack(directory : string, destination : string) : string {
    const output = run("npm", ["pack", "--pack-destination", destination, "--silent"], directory).trim().split(/\r?\n/).pop() ?? "";
    return path.join(destination, output);
}

/** The command line of Vite in the application. */
function viteCli(app : string) : string {
    return path.join(app, "node_modules", "vite", "bin", "vite.js");
}

/**
 * Starts a Vite server in the application (`vite preview` or the dev server),
 * and stops it after `use`. Free ports on 127.0.0.1: another program can use a
 * fixed port (test/vitest/free-port.ts).
 */
async function withViteServer<T>(app : string, command : readonly string[], use : (url : string) => Promise<T>) : Promise<T> {
    const port = await freePort();
    const args = [viteCli(app), ...command, "--host", BROWSER_HOST, "--port", String(port), "--strictPort", "--logLevel", "warn"];
    return await withServer(startProcess(process.execPath, args, { cwd : app, echo : true }), `http://${BROWSER_HOST}:${port}/`, use);
}

function check(label : string, results : Results) : boolean {
    const failures = Object.entries(EXPECTED).filter(([key, value]) => results[key] !== value);
    console.log(`${failures.length === 0 ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(results)}`);
    return failures.length === 0;
}

/** Makes the application in `work`, and installs the two tarballs and Vite. Gives the folder of the application. */
function install(work : string) : string {
    const app = path.join(work, "app");
    fs.cpSync(path.join(here, "fixture"), app, { recursive : true });
    const libraryTarball = pack(root, work);
    const dependencyTarball = pack(path.join(app, "fake-dependency"), work);
    fs.rmSync(path.join(app, "fake-dependency"), { recursive : true });
    const viteVersion = (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { devDependencies : Record<string, string> }).devDependencies["vite"] ?? "latest";
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", libraryTarball, dependencyTarball, `vite@${viteVersion}`], app);
    return app;
}

/** Builds the application and opens it with `vite preview`, then with the dev server. Gives true if each result is "A". */
async function checkApp(app : string, browser : Browser) : Promise<boolean> {
    let passed = true;
    execFileSync(process.execPath, [viteCli(app), "build", "--logLevel", "warn"], { cwd : app, stdio : "inherit" });
    passed = check("build + preview", await withViteServer(app, ["preview"], (url) => resultsOf(browser, url))) && passed;
    passed = check("dev server", await withViteServer(app, [], (url) => resultsOf(browser, url))) && passed;
    return passed;
}

async function main() : Promise<void> {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "async-browser-context-smoke-"));
    console.log(`Work folder: ${work}`);
    try {
        const app = install(work);
        const browser = await chromium.launch();
        try {
            if (!await checkApp(app, browser)) {
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
