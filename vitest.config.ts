import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform as swcTransform } from "@swc/core";
import { playwright } from "@vitest/browser-playwright";
import { transform as esbuildTransform } from "esbuild";
import { configDefaults, defineConfig, type TestProjectInlineConfiguration, type ViteUserConfig } from "vitest/config";
import type { Plugin } from "vite";
import { asyncContext } from "./src/vite/plugin.js";
import { BROWSER_HOST, freePort } from "./test/vitest/free-port.js";
import { lostFilesCheck } from "./test/vitest/lost-files.js";

export const here : string = path.dirname(fileURLToPath(import.meta.url));
const source = (file : string) : string => path.resolve(here, "src", file);

/** The runtime under test: the browser runtime (frames and patches) or the Node.js runtime (AsyncLocalStorage). */
export type Runtime = "browser" | "node";

/**
 * The compiler of the test files: the Babel preset of the library, SWC or
 * esbuild with the target ES2016, or no compiler. SWC and esbuild change each
 * async function into a generator with `then` callbacks, but they do not bind
 * generators to the context of their creation.
 */
export type Compiler = "babel-preset" | "swc-es2016" | "esbuild-es2016" | "none";

/**
 * The constants that tell a test file which runtime is under test. They are
 * Vite `define` constants, not `provide` values: Stryker gives its own values
 * with `provide`, and a project that sets `provide` hides them.
 */
export function constants(runtime : Runtime, compiler : Compiler) : Record<string, string> {
    return { __TEST_RUNTIME__ : JSON.stringify(runtime), __TEST_COMPILER__ : JSON.stringify(compiler) };
}

/** The import specifiers of the package, mapped to the source files of one runtime. */
export function aliases(runtime : Runtime) : { find : RegExp; replacement : string }[] {
    const prefix = runtime === "node" ? "node/" : "";
    return [
        { find : /^async-browser-context\/runtime$/, replacement : source(`${prefix}runtime.ts`) },
        { find : /^async-browser-context\/browser\/runtime$/, replacement : source("runtime.ts") },
        { find : /^async-browser-context\/opentelemetry$/, replacement : source(`${prefix}opentelemetry.ts`) },
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
const isTestFile = (id : string) : boolean => id.includes("/test/") || id.endsWith(".test.ts");
const isUntransformedFixture = (id : string) : boolean => id.includes("/test/fixtures/untransformed");

export const transformTests : Plugin = asyncContext({ include : isTestFile, exclude : isUntransformedFixture, ssr : true });

/**
 * A plugin that compiles the test files with SWC or esbuild and the target
 * ES2016, as the guide "Build tools" tells. It operates after the TypeScript
 * transform of Vite, on the same files as `transformTests`.
 */
function lowerTests(compiler : "swc-es2016" | "esbuild-es2016") : Plugin {
    return {
        name : `test-${compiler}`,
        enforce : "post",
        async transform(code, id) {
            const file = id.split("?", 1)[0] ?? id;
            if (!isTestFile(file) || isUntransformedFixture(file) || !/.[cm]?[jt]sx?$/.test(file)) {
                return null;
            }
            if (compiler === "swc-es2016") {
                const result = await swcTransform(code, { filename : file, sourceMaps : true, jsc : { target : "es2016", parser : { syntax : "ecmascript" } }, module : { type : "es6" } });
                return { code : result.code, map : result.map ?? null };
            }
            const result = await esbuildTransform(code, { sourcefile : file, loader : "js", format : "esm", target : "es2016", sourcemap : true });
            return { code : result.code, map : result.map };
        },
    };
}

/** The plugins of the projects that compile the test files with `compiler`. */
function compilerPlugins(compiler : Compiler) : Plugin[] {
    if (compiler === "babel-preset") return [transformTests];
    if (compiler === "none") return [];
    return [lowerTests(compiler)];
}

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
export const SHARED : string[] = ["test/rules/**/*.test.ts", "test/regression/**/*.test.ts", "test/api/**/*.test.ts", "test/interleave/**/*.test.ts", "test/legacy/**/*.test.ts"];

/**
 * esbuild cannot change a top-level `for await` for the target ES2016: its
 * output has `yield` outside a generator. With this target, esbuild also
 * refuses a top-level `await`. Thus the esbuild project does not run the
 * probes, which have a top-level `for await` (P10).
 */
const ESBUILD_EXCLUDE : readonly string[] = ["test/regression/probes.test.ts"];

/** The files that no project runs. */
const EXCLUDE : readonly string[] = [...configDefaults.exclude, "**/.stryker-tmp/**", "test/smoke/fixture/**"];

function nodeProject(name : string, runtime : Runtime, compiler : Compiler, include : string[]) : TestProjectInlineConfiguration {
    return {
        extends : true,
        plugins : compilerPlugins(compiler),
        resolve : { alias : aliases(runtime) },
        define : constants(runtime, compiler),
        test : {
            name,
            include,
            exclude : [...EXCLUDE, ...(compiler === "esbuild-es2016" ? ESBUILD_EXCLUDE : [])],
            environment : "node",
            setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
        },
    };
}

/**
 * The configuration is a function, because the port of the browser API server
 * comes from the operating system. The import of the exports above (for
 * example by `vitest.stryker.config.ts`) does not open ports.
 */
export default defineConfig(async () : Promise<ViteUserConfig> => ({
    // A run fails when a planned test file has no finished result (test/vitest/lost-files.ts)
    plugins : [lostFilesCheck()],
    test : {
        globals : true,
        exclude : [...EXCLUDE],
        coverage : {
            provider : "v8",
            include : ["src/**/*.ts"],
            exclude : ["src/**/*.test.ts", "src/**/test-*.ts"],
            reporter : [["text", { skipFull : true }], "text-summary", "json-summary", "html"],
            reportsDirectory : "coverage",
        },
        projects : [
            nodeProject("unit", "browser", "babel-preset", ["src/**/*.test.ts", "test/vitest/**/*.test.ts"]),
            nodeProject("rules (browser runtime, Node.js)", "browser", "babel-preset", SHARED),
            nodeProject("rules (browser runtime, SWC ES2016)", "browser", "swc-es2016", SHARED),
            nodeProject("rules (browser runtime, esbuild ES2016)", "browser", "esbuild-es2016", SHARED),
            nodeProject("rules (node runtime)", "node", "babel-preset", SHARED),
            nodeProject("rules (node runtime, no transform)", "node", "none", SHARED),
            {
                extends : true,
                plugins : [transformTests],
                resolve : { alias : aliases("browser") },
                define : constants("browser", "babel-preset"),
                test : {
                    name : "memory",
                    include : ["test/memory/**/*.test.ts"],
                    environment : "node",
                    pool : "forks",
                    execArgv : ["--expose-gc"],
                },
            },
            {
                extends : true,
                plugins : [transformTests],
                resolve : { alias : aliases("browser") },
                optimizeDeps : { exclude : ["async-browser-context"] },
                define : constants("browser", "babel-preset"),
                test : {
                    name : "browser",
                    include : [...SHARED, "test/browser/**/*.test.ts"],
                    setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
                    // The browser API server listens on 127.0.0.1, on a port that no other
                    // program uses on a loopback or wildcard address. See test/vitest/free-port.ts.
                    api : { host : BROWSER_HOST, port : await freePort(), strictPort : true },
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
}));
