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
| `unit` | Browser runtime in Node.js | Yes | `src/**/*.test.ts` and `test/vitest/**/*.test.ts` |
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
| Test tools | `test/vitest/` | The port of the browser API server and the check for lost test files. |
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

## Concurrent test runs

The browser projects start a Vite server, the browser API server. The browsers load the test pages from this server, and send the results to it.

Before the fix, the server used the address `localhost` and the first free port from 63315. On Windows, Vite listens on `::1` for `localhost`. Windows lets a different program listen on the same port with `127.0.0.1`. Vite does not find that program, because Vite examines only the wildcard addresses `0.0.0.0` and `::`. Chromium connects to `::1` for `localhost`, but Firefox connects to `127.0.0.1` first.

On 2026-10-08, a different project started its browser tests during a full run of this project. WebdriverIO sets the DNS order `ipv4first` in the Vitest process of that project. Thus, its browser API server listened on `127.0.0.1:63315`. The server of this project listened on `[::1]:63315`.

Firefox then loaded the test pages from the wrong server, and its sessions did not connect. After 60 seconds, Vitest stopped the Firefox project, and the remaining Firefox files gave no result. Vitest showed an `Unhandled Error`, but no `FAIL` line and no `×` line. The summary only showed fewer files and tests.

The fix:

- `vitest.config.ts` gives the browser API server the address `127.0.0.1`. The browsers open `http://127.0.0.1:<port>`, thus a server on `::1` cannot get their connections.
- `test/vitest/free-port.ts` gets the port from the operating system. No program uses this port on `127.0.0.1`, `::1`, `0.0.0.0` or `::`. Two runs that start at the same time get different ports. On a computer without IPv6, for example a CI container, the IPv6 addresses cannot hold a port.
- Vitest binds the port with `strictPort`. If a different program takes the port first, the run stops with the error `Port ... is already in use`.

The fix also removes a delay of approximately 2 seconds when a Firefox page connects to the server. Before the fix, Firefox tried `127.0.0.1` first, and Windows refused that connection only after this delay.

## The check for lost test files

Vitest does not fail a run when a planned test file gives no result. The file is only missing from the summary. Thus, `test/vitest/lost-files.ts` adds a reporter to each run. At the end of the run, the reporter compares the planned test files of each project with the test modules. A file without a test module, or with a module that did not finish, is a lost file. The reporter shows the project and the path of each lost file, and sets the exit code to 1.

The check does not examine a run that stopped early, for example with `--bail` or after a cancel in watch mode. It also does not examine a run with `--shard`: Vitest then plans all files, but runs only a part of them. A plugin adds the reporter, thus the check also operates when the command line selects other reporters, for example `--reporter=json`.

`vitest.stryker.config.ts` does not add the check. Stryker counts a failed run as a found mutant, and a lost file must not count as a found mutant.

## Mutation testing

Stryker examines the code that the tests can examine in Node.js. This code is the core, the patches of promises and timers, the patch helpers, the Babel preset, the Vite plugin and the OpenTelemetry context manager. The browser-only patches (events, observers, streams and callback APIs) are not in the scope of Stryker, because Stryker operates Vitest in Node.js only. The browser tests examine these patches. The Node.js runtime is also not in the scope, because the native `AsyncLocalStorage` does its work.

Stryker uses its command runner. For each mutant, it starts `vitest run` with the configuration `vitest.stryker.config.ts`. This configuration has no projects: it starts the unit tests and the shared tests on the browser runtime in Node.js. The Vitest runner of Stryker started almost no tests with Vitest 5, so each mutant seemed to survive.

Some mutants cannot change the result of a test. Comments of the form `// Stryker disable` mark them, with the reason:

- The cache of the frames. Without the cache, the search gives the same result, only slower.
- The browser-only schedulers in `src/patches/timers.ts`. Node.js does not have these classes.
