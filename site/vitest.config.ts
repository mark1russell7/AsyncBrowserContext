import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig, { BABEL_BROWSER_ALIASES } from "./vite.config.ts";

export default mergeConfig(viteConfig, defineConfig({
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
