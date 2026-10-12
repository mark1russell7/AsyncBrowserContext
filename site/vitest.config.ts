import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import { BROWSER_HOST, freePort } from "../test/vitest/free-port.ts";
import { lostFilesCheck } from "../test/vitest/lost-files.ts";
import viteConfig, { BABEL_BROWSER_ALIASES } from "./vite.config.ts";

/**
 * The browser API server of the browser tests gets a free port on 127.0.0.1, as
 * in the tests of the library (refer to ../test/vitest/free-port.ts). The default
 * port of Vitest can be in a port range that Windows reserves, or another
 * program can use it at the other address family.
 */
const browserPort = await freePort();

export default mergeConfig(viteConfig, defineConfig({
    // A run fails when a planned test file has no finished result (../test/vitest/lost-files.ts)
    plugins : [lostFilesCheck()],
    test : {
        projects : [
            {
                extends : true,
                test : {
                    name : "site (node)",
                    environment : "node",
                    include : ["build/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
                    exclude : ["**/node_modules/**", "**/*.browser.test.{ts,tsx}"],
                },
            },
            {
                extends : true,
                test : {
                    name : "site (browser)",
                    include : ["src/**/*.browser.test.{ts,tsx}"],
                    // The playground compiles code with @babel/core in the browser (refer to vite.config.ts).
                    alias : BABEL_BROWSER_ALIASES,
                    testTimeout : 60_000,
                    api : { host : BROWSER_HOST, port : browserPort, strictPort : true },
                    browser : {
                        enabled : true,
                        headless : true,
                        provider : playwright(),
                        screenshotFailures : false,
                        instances : [{ browser : "chromium" }],
                    },
                },
            },
        ],
    },
}));
