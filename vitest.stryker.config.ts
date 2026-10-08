import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import { aliases, constants, here, SHARED, transformTests } from "./vitest.config.js";

/**
 * The Vitest configuration of mutation testing. It has no projects: Stryker
 * gives the active mutant to the tests with `provide`, and with Vitest 5 a
 * project does not see a later `provide` of the root. The tests run on the
 * browser runtime in Node.js. Stryker does not mutate the Node.js runtime and
 * the browser-only patches (docs/testing.md).
 */
export default defineConfig({
    plugins : [transformTests],
    resolve : { alias : aliases("browser") },
    define : constants("browser", true),
    test : {
        globals : true,
        environment : "node",
        include : ["src/**/*.test.ts", ...SHARED],
        exclude : [...configDefaults.exclude, "**/.stryker-tmp/**"],
        setupFiles : [path.resolve(here, "test/setup/leak-check.ts")],
    },
});
