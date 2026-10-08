import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import { asyncContext } from "./src/vite/plugin.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = (file : string) : string => path.resolve(here, "src", file);

/** The runtime under test: the browser runtime (frames and patches) or the Node.js runtime (AsyncLocalStorage). */
type Runtime = "browser" | "node";

declare module "vitest" {
    interface ProvidedContext {
        /** The runtime under test. */
        runtime : Runtime;
        /** `true` if the Babel preset transformed the test files. */
        transformed : boolean;
    }
}

/** The import specifiers of the package, mapped to the source files of one runtime. */
function aliases(runtime : Runtime) : { find : RegExp; replacement : string }[] {
    const prefix = runtime === "node" ? "node/" : "";
    return [
        { find : /^async-browser-context\/runtime$/, replacement : source(`${prefix}runtime.ts`) },
        { find : /^async-browser-context\/browser$/, replacement : source("index.ts") },
        { find : /^async-browser-context$/, replacement : source(`${prefix}index.ts`) },
    ];
}

/**
 * The test files transform with the preset of the library. The source files of
 * the library do not. The fixture of rule C7 stays untransformed, as a
 * dependency that the application does not transform. Vitest runs the Node.js
 * projects through the SSR transform of Vite, so `ssr` is `true`.
 */
const transformTests = asyncContext({
    include : (id) => id.includes("/test/") || id.endsWith(".test.ts"),
    exclude : (id) => id.includes("/test/fixtures/untransformed"),
    ssr : true,
});

type BrowserName = "chromium" | "firefox" | "webkit";

/**
 * The browsers of the browser project. Set BROWSERS to a comma list to change
 * them. Playwright WebKit does not start on all Windows computers, thus the
 * default on Windows is Chromium and Firefox. CI runs all three on Linux.
 */
function browsers() : BrowserName[] {
    const all : BrowserName[] = ["chromium", "firefox", "webkit"];
    const selected = process.env["BROWSERS"];
    if (selected !== undefined && selected.trim() !== "") {
        return selected.split(",").map((name) => name.trim()).filter((name) : name is BrowserName => all.includes(name as BrowserName));
    }
    return process.platform === "win32" ? ["chromium", "firefox"] : all;
}

/** The tests that run on each runtime: the rules, the regressions, the API and the order variation. */
const SHARED = ["test/rules/**/*.test.ts", "test/regression/**/*.test.ts", "test/api/**/*.test.ts", "test/interleave/**/*.test.ts", "test/legacy/**/*.test.ts"];

function nodeProject(name : string, runtime : Runtime, transformed : boolean, include : string[]) : TestProjectInlineConfiguration {
    return {
        extends : true,
        plugins : transformed ? [transformTests] : [],
        resolve : { alias : aliases(runtime) },
        test : {
            name,
            include,
            environment : "node",
            setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
            provide : { runtime, transformed },
        },
    };
}

export default defineConfig({
    test : {
        globals : true,
        exclude : [...configDefaults.exclude, "**/.stryker-tmp/**", "test/smoke/fixture/**"],
        coverage : {
            provider : "v8",
            include : ["src/**/*.ts"],
            exclude : ["src/**/*.test.ts", "src/**/test-*.ts"],
            reporter : [["text", { skipFull : true }], "text-summary", "json-summary", "html"],
            reportsDirectory : "coverage",
        },
        projects : [
            nodeProject("unit", "browser", true, ["src/**/*.test.ts"]),
            nodeProject("rules (browser runtime, Node.js)", "browser", true, SHARED),
            nodeProject("rules (node runtime)", "node", true, SHARED),
            nodeProject("rules (node runtime, no transform)", "node", false, SHARED),
            {
                extends : true,
                plugins : [transformTests],
                resolve : { alias : aliases("browser") },
                test : {
                    name : "memory",
                    include : ["test/memory/**/*.test.ts"],
                    environment : "node",
                    pool : "forks",
                    execArgv : ["--expose-gc"],
                    provide : { runtime : "browser", transformed : true },
                },
            },
            {
                extends : true,
                plugins : [transformTests],
                resolve : { alias : aliases("browser") },
                optimizeDeps : { exclude : ["async-browser-context"] },
                test : {
                    name : "browser",
                    include : [...SHARED, "test/browser/**/*.test.ts"],
                    setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
                    provide : { runtime : "browser", transformed : true },
                    browser : {
                        enabled : true,
                        headless : true,
                        provider : playwright(),
                        screenshotFailures : false,
                        instances : browsers().map((browser) => ({ browser, name : `browser (${browser})` })),
                    },
                },
            },
        ],
    },
});
