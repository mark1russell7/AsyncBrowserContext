# Testing

This document tells how the tests of `async-browser-context` are organized and how to start them.

## Start the tests

1. Install the dependencies:

   ```sh
   pnpm install
   ```

2. Install the Playwright browsers:

   ```sh
   pnpm exec playwright install chromium firefox webkit
   ```

3. Start all test projects:

   ```sh
   pnpm test
   ```

Use `pnpm test:node` for the Node.js projects only, and `pnpm test:browser` for the browser projects only. Set `BROWSERS` to a comma list to select the browsers. The default on Windows is Chromium and Firefox, because Playwright WebKit does not start on all Windows computers.

## Test projects

`vitest.config.ts` defines these projects. The test files import the package as a user does: `import { Variable } from "async-browser-context"`. Each project maps this import to the source of one runtime.

| Project | Runtime | Transform | Files |
| --- | --- | --- | --- |
| `unit` | Browser runtime in Node.js | Yes | `src/**/*.test.ts` |
| `rules (browser runtime, Node.js)` | Browser runtime in Node.js | Yes | The shared files |
| `rules (node runtime)` | Node.js runtime | Yes | The shared files |
| `rules (node runtime, no transform)` | Node.js runtime | No | The shared files |
| `memory` | Browser runtime in Node.js, with `--expose-gc` | Yes | `test/memory/` |
| `browser (chromium)`, `browser (firefox)`, `browser (webkit)` | Browser runtime | Yes | The shared files and `test/browser/` |

The shared files are in `test/rules/`, `test/regression/`, `test/api/`, `test/interleave/` and `test/legacy/`. The library's own Vite plugin transforms the test files.

## Test layers

| Layer | Files | What the layer shows |
| --- | --- | --- |
| Rules | `test/rules/` | The context rules C1 to C13. |
| Browser APIs | `test/browser/` | The event rule C13 and the patched browser APIs. |
| Regression | `test/regression/probes.test.ts` | The 23 probes of the review of 2026-10-08. |
| API | `test/api/` | The `AsyncLocalStorage` tests run against the native class on Node.js and against the browser class. Thus, the two classes agree. |
| Order variation | `test/interleave/` | 40 tasks do random operations with 5 fixed seeds. Each task reads its context after each operation. |
| Memory | `test/memory/` | Rule C12, with `WeakRef` and the garbage collector. |
| Units and transform | `src/**/*.test.ts` | The runtime parts, the Vite plugin, and output snapshots of the Babel preset. |
| Legacy | `test/legacy/` | The tests of the first test runner that were kept. `legacy-test-triage.md` gives the result for each test. |
| Smoke | `test/smoke/run.ts` | `pnpm smoke` packs the package, installs it in a new Vite application, and examines the build and the dev server in Chromium. |
| Mutation | `stryker.config.mjs` | `pnpm mutation` changes the source in small ways. The tests must find each change. |

## Rules for each test

1. Use two or more contexts. Let a different context continue immediately before each read.
2. Read the value at the points of risk. These points are the same expression after `await`, the callbacks that the library does not wrap, and the code that the transform does not change.
3. Do not put assertions in callbacks that the test does not wait for.
4. Do not use time limits to examine correctness. The benchmarks measure speed.
5. Do not skip a test silently. Use `it.skipIf` with a reason in the name.
6. Use a fixed seed for random values.

## The leak check

`test/setup/leak-check.ts` operates after each test on the browser runtime. It makes sure that the current context is the root context. Thus, a test that leaks a context fails.

## Mutation testing

Stryker examines the code that the tests can examine in Node.js. This code is the core, the patches of promises and timers, the patch helpers, the Babel preset and the Vite plugin. The browser-only patches (events, observers, streams and callback APIs) are not in the scope of Stryker, because Stryker operates Vitest in Node.js only. The browser tests examine these patches. The Node.js runtime is also not in the scope, because the native `AsyncLocalStorage` does its work.

Stryker uses its command runner. For each mutant, it starts `vitest run` with the configuration `vitest.stryker.config.ts`. This configuration has no projects: it starts the unit tests and the shared tests on the browser runtime in Node.js. The Vitest runner of Stryker started almost no tests with Vitest 5, so each mutant seemed to survive.

Some mutants cannot change the result of a test. Comments of the form `// Stryker disable` mark them, with the reason:

- The cache of the frames. Without the cache, the search gives the same result, only slower.
- The browser-only schedulers in `src/patches/timers.ts`. Node.js does not have these classes.
