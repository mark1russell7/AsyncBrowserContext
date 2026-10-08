// The configuration of mutation testing (pnpm mutation). Stryker changes the
// source code in small ways (mutants) and starts the tests for each mutant.
// A good test suite finds (kills) the mutants.
//
// The command runner starts Vitest once for each mutant, with the mutant in the
// environment variable __STRYKER_ACTIVE_MUTANT__. The Vitest runner of Stryker
// 10 started almost no tests with Vitest 5, so each mutant seemed to survive.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
    packageManager : "pnpm",
    testRunner : "command",
    commandRunner : { command : "npx vitest run --config vitest.stryker.config.ts --bail 1 --reporter dot" },
    coverageAnalysis : "off",
    mutate : [
        "src/core/**/*.ts",
        "src/patches/patch.ts",
        "src/patches/promise.ts",
        "src/patches/timers.ts",
        "src/patches/to-string.ts",
        "src/babel/**/*.ts",
        "src/vite/**/*.ts",
        "!src/**/*.test.ts",
    ],
    reporters : ["clear-text", "progress", "json", "html"],
    jsonReporter : { fileName : "reports/mutation/mutation.json" },
    htmlReporter : { fileName : "reports/mutation/mutation.html" },
    concurrency : 6,
    timeoutMS : 60000,
    thresholds : { high : 90, low : 85, break : 85 },
    tempDirName : ".stryker-tmp",
    cleanTempDir : "always",
};
