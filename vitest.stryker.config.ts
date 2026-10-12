import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import { aliases, constants, here, SHARED, transformTests } from "./vitest.config.js";

/**
 * The Vitest configuration of mutation testing. Stryker starts Vitest once for
 * each mutant, with the mutant in the environment variable
 * __STRYKER_ACTIVE_MUTANT__ (stryker.config.mjs). For speed, the configuration
 * has no projects: the tests run once, on the browser runtime in Node.js.
 * Stryker does not mutate the Node.js runtime and the browser-only patches
 * (docs/testing.md).
 */
export default defineConfig({
    plugins : [transformTests],
    resolve : { alias : aliases("browser") },
    define : constants("browser", "babel-preset"),
    test : {
        globals : true,
        environment : "node",
        include : ["src/**/*.test.ts", ...SHARED],
        exclude : [...configDefaults.exclude, "**/.stryker-tmp/**"],
        setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
    },
});
