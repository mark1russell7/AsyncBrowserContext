import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteUserConfig } from "vitest/config";

/**
 * The tests of the STE linter. Start them from the root of the repository
 * with `pnpm test:ste-lint`. The root Vitest configuration does not include
 * these files.
 */
const config : ViteUserConfig = defineConfig({
    root : path.dirname(fileURLToPath(import.meta.url)),
    test : {
        name : "ste-lint",
        include : ["src/**/*.test.ts"],
        environment : "node",
    },
});

export default config;
