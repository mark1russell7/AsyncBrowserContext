/**
 * The smoke test (pnpm smoke). The test does the README setup in a new
 * application, as a user does:
 *
 * 1. It packs the package and a fake dependency with native async functions.
 * 2. It installs the two tarballs and Vite with npm in a new folder.
 * 3. It builds the application, starts `vite preview`, and opens the page in
 *    Chromium.
 * 4. It starts the dev server, which pre-bundles the dependencies, and opens
 *    the page again.
 *
 * The page writes its results to `window.__results`. Each result must be "A".
 * The dependency result shows that the Vite plugin transforms the code in
 * `node_modules`.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const EXPECTED = { inExpression : "A", inDependency : "A", generator : "A", browserEvent : "A" };

type ViteModule = typeof import("vite");

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

async function importVite(app : string) : Promise<ViteModule> {
    const manifest = JSON.parse(fs.readFileSync(path.join(app, "node_modules", "vite", "package.json"), "utf8")) as { exports : Record<string, unknown> };
    const entry = manifest.exports["."] as { import? : string | { default? : string }; default? : string };
    const relative = typeof entry.import === "string" ? entry.import : entry.import?.default ?? entry.default ?? "./dist/node/index.js";
    return await import(pathToFileURL(path.join(app, "node_modules", "vite", relative)).href) as ViteModule;
}

async function resultsOf(url : string) : Promise<Record<string, unknown>> {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors : string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(url);
        // The dev server can reload the page one time, after it pre-bundles new dependencies
        for (let attempt = 1; ; attempt++) {
            try {
                await page.waitForFunction(() => (window as unknown as { __results? : unknown }).__results !== undefined, undefined, { timeout : 30_000 });
                const results = await page.evaluate(() => (window as unknown as { __results : Record<string, unknown> }).__results);
                if (errors.length > 0) {
                    throw new Error(`Page errors: ${errors.join("; ")}`);
                }
                return results;
            } catch (error) {
                const destroyed = error instanceof Error && error.message.includes("Execution context was destroyed");
                if (!destroyed || attempt === 3) {
                    throw error;
                }
                await page.waitForLoadState("load");
            }
        }
    } finally {
        await browser.close();
    }
}

function check(label : string, results : Record<string, unknown>) : boolean {
    const failures = Object.entries(EXPECTED).filter(([key, value]) => results[key] !== value);
    console.log(`${failures.length === 0 ? "PASS" : "FAIL"} ${label}: ${JSON.stringify(results)}`);
    return failures.length === 0;
}

async function main() : Promise<void> {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "async-browser-context-smoke-"));
    const app = path.join(work, "app");
    fs.cpSync(path.join(here, "fixture"), app, { recursive : true });
    console.log(`Work folder: ${work}`);

    const libraryTarball = pack(root, work);
    const dependencyTarball = pack(path.join(app, "fake-dependency"), work);
    fs.rmSync(path.join(app, "fake-dependency"), { recursive : true });
    const viteVersion = (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { devDependencies : Record<string, string> }).devDependencies["vite"] ?? "latest";
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", libraryTarball, dependencyTarball, `vite@${viteVersion}`], app);

    const vite = await importVite(app);
    let passed = true;

    await vite.build({ root : app, logLevel : "warn" });
    const preview = await vite.preview({ root : app, logLevel : "warn", preview : { port : 4317, strictPort : true } });
    try {
        passed = check("build + preview", await resultsOf("http://localhost:4317/")) && passed;
    } finally {
        await preview.close();
    }

    const server = await vite.createServer({ root : app, logLevel : "warn", server : { port : 4318, strictPort : true } });
    await server.listen();
    try {
        passed = check("dev server", await resultsOf("http://localhost:4318/")) && passed;
    } finally {
        await server.close();
    }

    try {
        // Windows can lock the files of the closed servers for a short time
        fs.rmSync(work, { recursive : true, force : true, maxRetries : 10, retryDelay : 500 });
    } catch {
        console.warn(`Could not remove the work folder ${work}`);
    }
    if (!passed) {
        process.exitCode = 1;
    }
}

await main();
