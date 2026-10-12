/** The runtime under test. Each Vitest project defines this constant. */
declare const __TEST_RUNTIME__ : "browser" | "node";
/** The compiler of the test files (`Compiler` in vitest.config.ts). Each Vitest project defines this constant. */
declare const __TEST_COMPILER__ : "babel-preset" | "swc-es2016" | "esbuild-es2016" | "none";
