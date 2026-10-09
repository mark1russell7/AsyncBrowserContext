# Remediation Plan: async-browser-context

| Item | Value |
|---|---|
| Status | Done. The maintainer accepted the proposed options on 2026-10-08, with the changes in section 11. |
| Date | 2026-10-08 |
| Base commit | `c83992a` on `main` |
| Source | The review of 2026-10-08: code reading, 23 probes, 6 mutants, benchmarks, and a prototype. |
| Language | ASD-STE100 Simplified Technical English, as much as possible. A full word check needs the licensed STE dictionary or a checker tool. |

## Contents

1. Purpose
2. Summary
3. Decisions
4. Target design
5. Work phases
6. Test strategy
7. Acceptance criteria
8. Risks
9. Out of scope
10. Terms
11. Execution

Appendix A. Problem list
Appendix B. Probe results
Appendix C. Mutation results for the current tests
Appendix D. Benchmark results
Appendix E. Prototype code
Appendix F. File changes
Appendix G. STE checklist for this project

## 1. Purpose

This document tells how to correct the problems that the review of 2026-10-08 found. It covers the runtime, the Babel transform, the tests, the package, and the documentation.

The plan has nine phases (Phase 0 to Phase 8). Each phase has steps and exit criteria. Some phases have a review gate. At a review gate, work stops until the maintainer approves the results.

## 2. Summary

### 2.1 Problems

The library has five root causes of errors (RC1 to RC5). The tests (TST) and the documentation (DOC) also have problems. Appendix A gives the full list with file locations. Appendix B gives the probe results.

| ID | Problem | Effect |
|---|---|---|
| RC1 | When an async function continues after `await`, the runtime sets the context. When the function stops again, the runtime does not set the previous context. | Code gets the context of a different operation. Refer to probes P01, P02, P16, and P17. |
| RC2 | A `then` callback gets the context from when the program made the promise. It does not get the context from when the program called `then`. | Shared and cached promises give incorrect values. Refer to probes P03 and P22. |
| RC3 | Each promise keeps a strong reference to its parent promise. | Memory use increases with each `then` call in a chain. Refer to probe P21. |
| RC4 | The runtime replaces the global `Promise` constructor with a function. | `Promise` subclasses and identity checks operate incorrectly. Refer to probe P04. |
| RC5 | The Babel plugin uses custom code to change each statement that contains `await`. | The plugin stops the build, or it changes the result of correct code. Refer to probes P05 to P15, P18, and P23. |
| TST | The tests cannot find these errors. | A runtime with no async support passes 82 of the 217 tests (Appendix C). |
| DOC | The documentation contains false statements. It does not follow STE. | Users configure the library incorrectly. They trust claims that are not true. |

### 2.2 Solution

The solution uses the rules of the TC39 AsyncContext proposal. The proposal is at Stage 2. This plan uses the specification draft of 2026-06-16.

1. The runtime sets a context only while a step of code that it controls runs. After the step, it sets the previous context again. Between tasks, the current context is the root context.
2. The runtime changes only `Promise.prototype.then`. It records the context when the program calls `then`.
3. The Babel transform uses the Babel transforms for async functions and async generators. A small runtime function runs each step in the correct context.
4. Each `Variable` object keeps its values in a private store. Other scripts cannot read the values.

### 2.3 Evidence from a prototype

The review made a prototype of this solution in a temporary folder. The prototype is not in the repository. Appendix E contains its code.

- The prototype gives the target result for 22 of the 23 probes. The other probe (P20a) tests an error in the README, not the runtime.
- Probe P02 tests code that Babel does not transform. Its target is the root context (rule C7). The prototype gives the root context (`undefined`). The current library gives the value of a different request.
- The speed of the prototype is approximately equal to the speed of the current library (Appendix D).

### 2.4 Cost

- In microbenchmarks on Node.js 25, the prototype uses 1.2 to 2.2 times the time of plain JavaScript. The current library uses 1.3 to 1.8 times the time of plain JavaScript.
- The Babel transforms change the number of microtask steps for each `await`. Code that depends on an exact microtask order can operate differently (risk K2).

## 3. Decisions

The maintainer must make these decisions. Each decision has options, a proposed option, and the first phase that it blocks. If the maintainer accepts all proposed options, work can start.

### 3.1 Decisions that block the start

| ID | Question | Options | Proposed option | Blocks |
|---|---|---|---|---|
| D7 | The workspace instructions in `~/git/CLAUDE.md` say: use `cue-config` for package configuration, and do not edit `tsconfig.json` or `package.json` manually. This repository does not use `cue-config`, and it is not in the ecosystem manifest. How do we change the configuration? | A: Keep the repository standalone. Edit `package.json` and `tsconfig.json` directly. Make new files and folders under `src/` directly. B: First add the repository to the ecosystem (`cue-config`, `pnpm`, and the manifest). | A. It is the smallest change. Option B is a separate task. Option B can also change the TypeScript settings that a browser library needs. This option is not the workspace rule, so your explicit approval is necessary. | Phase 0 |
| D11 | How do we use git? | A: Make the branch `fix/remediation` from `main`. Commit at the end of each phase. Push and open a pull request only when the maintainer says so. B: One commit at the end. C: Other. | A | Phase 0 |
| D12 | Where must work stop for a review? | A: After Phase 1, after Phase 3, after Phase 7, and before Phase 8. B: After each phase. C: Only before Phase 8. | A | Phase 0 |
| D6 | Which test tools do we use? | A: Vitest for Node.js, and Vitest browser mode with Playwright for Chromium, Firefox, and WebKit. Remove the custom runner (`tests/framework/`, `tests/runner.html`). B: Option A, but keep the custom runner as a visual demonstration. C: Keep only the custom runner. | A. The custom runner has no exit code and no CI support. It also has errors in its timeouts and assertions (Appendix A.3). | Phase 1 |

### 3.2 Decisions that block later phases

| ID | Question | Options | Proposed option | Blocks |
|---|---|---|---|---|
| D1 | Which context rules does the library use? | A: The TC39 AsyncContext rules (section 4.1). B: The current rules. | A. Option B keeps RC2. Only one current test depends on the current rules, and that test asserts an error (`tests/suites/02-error-handling/error-handling.test.js:325`). | Phase 2 |
| D2 | How does the transform keep the context after `await`? | A: The Babel async transforms and a step function that sets the context (generators). B: Keep native `await`. Change each `await` expression with custom code. C: No transform. Users call `Snapshot.wrap` manually. | A. The prototype shows that option A gives correct results for all syntax probes, at approximately the current speed. Option B needs much custom code, and it also changes the microtask order. Option C removes the main function of the library. | Phase 3 |
| D3 | Which names does the public API use? | A: The TC39 names (`AsyncContext.Variable`, `AsyncContext.Snapshot`, `run(value, fn, ...args)`, `Snapshot.wrap(fn)`). Also keep `AsyncVariable` and `AsyncSnapshot` as aliases. B: Only the TC39 names. C: Only the current names. | A. The package is not on npm, so no npm user uses the old names. The aliases are small. All options remove `AsyncSnapshot.contexts`, because it shows all values. | Phase 2 |
| D4 | Which platforms must the library operate on? Is there a current user, for example a Meteor application, that must continue to operate? | A: Browsers only. B: Browsers and Node.js. On Node.js, the library uses `AsyncLocalStorage`. C: Browsers and Node.js, with the browser runtime on both. | B, if Node.js is a target. Node.js has a correct native solution. Tell us about current users before Phase 2. | Phase 2 |
| D14 | Does the library patch more browser APIs? | A: Patch only the timers, `queueMicrotask`, `requestAnimationFrame`, and `requestIdleCallback`. Document `Snapshot.wrap` for events, observers, `MessageChannel`, XHR, WebSocket, and IndexedDB. B: Also patch `addEventListener` and the observers. | A. For events, the correct context is not clear: the context of the registration, or the context of the dispatch. The TC39 draft lets each host decide this. | Phase 2 |
| D5 | Which browser versions are the minimum? | A: The last two major versions of Chrome, Edge, Firefox, and Safari. Compile to ES2022. B: A list of older versions. | A | Phase 6 |
| D8 | Which package name do we use? | A: `async-browser-context`. The README uses this name, and it is available on npm. B: `@mark1russell7/async-browser-context`, the scope of the workspace packages. C: `@async-browser-context/async-browser-context`, the current name in `package.json`. | B, if you publish your workspace packages with this scope. If not, A. Option C needs a new npm organization. | Phase 6 |
| D9 | Which version do we use? | A: Change to `0.1.0` until the plan is complete. Then release `1.0.0`. B: Keep `1.0.0`, and release `2.0.0`. | A. No version is on npm. | Phase 6 |
| D10 | Which documents do we remove? | A: Remove `TESTING_STRATEGY.md`, `PROGRESS.md`, `COMPREHENSIVE_TEST_COVERAGE.md`, and `run-tests.sh`. Replace `TESTING.md` with `docs/testing.md`. B: Keep these files and correct them. | A. Most of their content is not true. Git keeps the old versions. | Phase 7 |
| D13 | How does the library tell users about code that Babel does not transform, for example dependencies? | A: Document the root-context result (rule C7). Give bundler recipes that transform selected dependencies. B: Option A, and also show a warning in development mode. | A. A development warning cannot find all cases. | Phase 7 |

## 4. Target design

### 4.1 Context rules

These rules define the correct operation of the library. Phase 1 writes tests for each rule.

| ID | Rule |
|---|---|
| C1 | Outside a library callback, `get()` gives the default value. Between tasks, the current context is the root context. |
| C2 | While `run(value, fn, ...args)` runs `fn`, `get()` gives `value`. After `run()` returns or throws, the previous context is current again. |
| C3 | An async function keeps the context of its call. This is also true after each `await`, in the same expression as the `await`, and when the promise rejects. |
| C4 | A `then`, `catch`, or `finally` callback runs in the context of the `then`, `catch`, or `finally` call. |
| C5 | A generator body runs in the context of the call that made the generator. After each step of the generator, the context of the caller is current again. This rule applies to sync generators and to async generators. |
| C6 | A callback of `setTimeout`, `setInterval`, `queueMicrotask`, `requestAnimationFrame`, or `requestIdleCallback` runs in the context of the call that scheduled it. |
| C7 | After an `await`, code that the transform does not change gets the root context. Callbacks from APIs that the library does not patch also get the root context. They never get the context of a different operation. |
| C8 | `snapshot.run(fn, ...args)` runs `fn` in the context of the snapshot. A function from `Snapshot.wrap(fn)` also runs in the context of the snapshot. |
| C9 | Only code that has a `Variable` object can read the values of that object. The library does not put values on `globalThis`. |
| C10 | When a page contains two copies of the library, the two copies use one context store. |
| C11 | The library does not replace the `Promise` constructor. `Promise` subclasses, `constructor` checks, and `Promise.toString()` operate as they do without the library. |
| C12 | The library does not keep a promise in memory after the program has no reference to that promise. |

Rules C3, C4, and C5 come from the TC39 draft. In the draft, `PerformPromiseThen` records the context when the program calls `then`. `GeneratorStart` and `GeneratorResume` keep the context of the generator. The draft lets each host decide the rules for timers and events (rule C6 and decision D14).

### 4.2 Runtime

The runtime has these parts:

1. **Context store.** One object at `globalThis[Symbol.for('async-browser-context.store')]`. It contains the current frame and a flag for the patches. It contains no values.
2. **Frames.** A frame is a frozen object with one property: `parent`. Each `run()` call makes a new frame. The parent of the new frame is the current frame. The root frame has no parent.
3. **Variables.** Each `Variable` object has a private `WeakMap` from frame to value. `get()` examines the current frame, and then the parents of that frame, until it finds a value. If it finds no value, it gives the default value. The time of `get()` increases with the number of nested `run()` calls. Phase 5 measures this time.
4. **Promise patch.** The runtime patches only `Promise.prototype.then`. The patch records the current frame and wraps the callbacks. The patch keeps the `name` and `length` of the function. The `catch` and `finally` methods and the static combinators call `then`, so they also follow rule C4.
5. **Scheduler patches.** The runtime wraps the callbacks of the APIs in decision D14. Each wrapper keeps the function name. A flag in the context store prevents a second patch.
6. **Step function.** The `coroutine` function runs transformed async functions. It records the frame when the program calls the function. Before each step, it sets this frame. After each step, it sets the previous frame again.
7. **Generator binder.** The `bindGenerator` function records the frame when the program makes a generator. Before each `next`, `throw`, or `return` call, it sets this frame. After the call, it sets the previous frame again.
8. **Public API.** The names in decision D3.

The new runtime does not contain these parts of the current runtime:

- The replacement of the `Promise` constructor, and the patches of `Promise.resolve`, `Promise.reject`, `Promise.all`, `Promise.race`, `Promise.allSettled`, and `Promise.any`.
- The promise metadata symbols, the parent references, and `currentActivePromise`.
- The `DEBUG_ASYNC_CONTEXT` check.
- The global functions `__getAsyncContext` and `__setAsyncContext`.
- The public property `AsyncSnapshot.contexts`.
- The public `init()` function. The runtime starts one time when it loads.

### 4.3 Babel preset

The library gives a Babel preset, not a plugin. A preset can set the order of more than one plugin.

The preset contains these plugins, in this order:

1. **A generator binder plugin of this library.** It wraps generator functions with `bindGenerator` (rule C5). It must change the code before the async generator transform does. The prototype does this in the `Program` enter visitor.
2. **`@babel/plugin-transform-async-generator-functions`.** It changes async generators and `for await` loops.
3. **`@babel/plugin-transform-async-to-generator`** with the options `{ module: '<package>/runtime', method: 'coroutine' }`. It changes each async function to a generator that the step function runs.

These are the results of this design:

- The library has no custom code that changes `await` expressions. The Babel transforms already handle destructuring, `var`, labels, closures, sync iterables, and the `return()` call on `break`.
- If a project also uses `@babel/preset-env`, put this preset last in the `presets` list. Babel runs presets in reverse order.
- Tools that do not use Babel by default, for example Vite, need a Babel step for application code. Phase 7 documents recipes for Vite and webpack.

### 4.4 Node.js runtime (decision D4, option B)

1. The `exports` field of `package.json` uses the `node` condition to select a runtime that uses `AsyncLocalStorage`.
2. Each `Variable` object uses one `AsyncLocalStorage` object.
3. `Snapshot` uses `AsyncLocalStorage.snapshot()`.
4. On Node.js, the step function only runs the generator. `AsyncLocalStorage` keeps the context.
5. The same rule tests run on both runtimes.

### 4.5 Limits

The library does not keep the context in these conditions. The README must tell users about each one.

- Code that Babel does not transform. This includes most dependencies.
- Callbacks of APIs that the library does not patch (decision D14).
- Code in `eval()` and `new Function()`.
- Web workers, iframes, and other realms.
- Other code that patches `Promise.prototype.then`, for example zone.js.

## 5. Work phases

Each phase has a size: S (small), M (medium), or L (large). The size is a relative estimate.

### Phase 0. Prepare

| Item | Value |
|---|---|
| Size | S |
| Blocked by | D7, D11, D12 |
| Review gate | No |

Steps:

1. Make the branch `fix/remediation` from `main`.
2. Install Vitest, `@vitest/browser`, and Playwright as development dependencies.
3. Install the Playwright browsers: Chromium, Firefox, and WebKit.
4. Add the scripts `test`, `test:node`, `test:browser`, `typecheck`, and `bench` to `package.json`.

Exit criteria:

- `npm test` runs and gives an exit code.

### Phase 1. Write the tests first

| Item | Value |
|---|---|
| Size | L |
| Blocked by | D6 |
| Review gate | Yes |

Steps:

1. Configure Vitest with two projects: `node` and `browser`.
2. Configure Vitest to transform the test files with the transform of the library. Use the current plugin until Phase 3 replaces it.
3. Write one test file for each context rule (C1 to C12). Use two or more contexts in each test.
4. Change probes P01 to P23 into regression tests.
5. Mark each test that fails on the current library as an expected failure (`test.fails`). Each expected failure must name its probe or rule.
6. Add a leak check after each test. The check makes sure that the current context is the root context. It also reads a value in a callback that the library does not wrap: `MessageChannel` in browsers, and `setImmediate` on Node.js.
7. Add reference tests for Node.js. Each reference test runs one scenario with `AsyncLocalStorage` and with the library. The two results must be equal.
8. Add fixture tests for the transform. For each fixture, compare the output with a stored copy. Also run the original code and the transformed code, and compare the results.
9. Add a CI workflow in `.github/workflows/ci.yml`. The workflow runs the type check, the Node.js tests, and the browser tests in three engines.

Exit criteria:

- CI runs on each push to the branch.
- Each known error has a test. The test is marked as an expected failure.
- Each test has at least one assertion that can fail.

### Phase 2. Replace the runtime

| Item | Value |
|---|---|
| Size | M |
| Blocked by | D1, D3, D4, D14 |
| Review gate | No. Phase 3 continues directly. |

CAUTION: Do not release the runtime of Phase 2 without Phase 3. The current Babel plugin calls global functions that the new runtime removes. Without Phase 3, async functions lose their context after `await`.

Steps:

1. Write the context store, the frames, and `Variable` (section 4.2).
2. Write `Snapshot` with `run` and `wrap`.
3. Patch `Promise.prototype.then` (rule C4). Remove the other Promise patches.
4. Write the scheduler patches. Prevent a second patch with the flag in the context store.
5. Write the step function and the generator binder.
6. Remove the parts that section 4.2 lists.
7. If decision D4 is option B, write the Node.js runtime with `AsyncLocalStorage`. Add the `node` export condition.

Exit criteria:

- The unit tests for `Variable`, `Snapshot`, the `then` patch, and the scheduler patches pass on Node.js and in three browsers.

### Phase 3. Replace the Babel transform

| Item | Value |
|---|---|
| Size | M |
| Blocked by | D2 |
| Review gate | Yes |

Steps:

1. Write the preset (section 4.3).
2. Write the generator binder plugin for all generator forms: declarations, expressions, object methods, class methods, static methods, private methods, and exported declarations.
3. Remove `babel-plugin/` and `.babelrc`.
4. Add fixture tests for this syntax:
   - `for await` over async iterables, sync iterables, and arrays of promises
   - `for await` with destructuring, labels, `break`, `continue`, `return`, and `throw`
   - closures over the variable of a `for await` loop
   - top-level `await` and top-level `for await`
   - `var` declarations with `await`, also in blocks and with two declarations
   - destructuring with default values after `await`
   - more than one declarator in one declaration
   - `await` in object literals, call arguments, conditions, loop heads, and template literals
   - `try`, `catch`, and `finally` with `await`
   - async arrow functions, async methods, and async class methods that use `this` and `arguments`
   - sync generators and async generators, also with `yield*`
5. Add tests with `@babel/preset-env` for two targets: current browsers, and an old target that changes generators with regenerator.
6. Change each expected failure that now passes into a normal test. Each test that still fails must have a reason that the maintainer accepts.

Exit criteria:

- All tests for rules C1 to C12 pass on Node.js and in three browsers.
- Probes P01, P03 to P19, P20b, and P21 to P23 pass. Probe P02 gives the root context. Probe P20a stays a documentation error until Phase 7.
- No custom code changes `await` expressions.

### Phase 4. Sort the current tests

| Item | Value |
|---|---|
| Size | L |
| Blocked by | D6 |
| Review gate | No |

The 217 current tests are in `tests/suites/`. Each test gets one of these results:

- **Move.** The test is correct. Move it to Vitest.
- **Make stronger.** Add a second context or the missing assertion.
- **Change.** The test asserts an error, for example `tests/suites/02-error-handling/error-handling.test.js:325`. Change the expected value.
- **Remove.** The test cannot fail, or another test does the same check.

Steps:

1. Make a table with one row for each current test and its result. Put the table in the pull request.
2. Do the action for each test.
3. Remove the time limits from the correctness tests. Phase 5 measures speed.
4. Remove the silent skips. Use `test.skipIf` with a reason.
5. Remove `tests/framework/`, `tests/runner.html`, and the `*-transformed.js` files (decision D6).
6. Run mutation testing with StrykerJS on the runtime. Add tests until the mutation score is 85% or more.
7. Run the full test suite 20 times in a sequence. Correct each test that fails one or more times.

Exit criteria:

- Each current test has a result in the table.
- The mutation score of the runtime is 85% or more.
- 20 runs in a sequence pass with no failure.

### Phase 5. Measure speed and memory

| Item | Value |
|---|---|
| Size | M |
| Blocked by | Phase 3 |
| Review gate | No |

Steps:

1. Add the folder `bench/` with tinybench. Use the four microbenchmarks of Appendix D and one realistic scenario.
2. Run each benchmark in a separate process for three cases: plain JavaScript, the library, and the transform without the runtime patches.
3. Record the median and the spread of 10 runs. Record the CPU, the operating system, and the engine version.
4. If a benchmark uses more than 2.0 times the time of plain JavaScript, find the cause with a profiler. Correct the cause if possible.
5. Add memory tests for Node.js with `--expose-gc` and `WeakRef`, as in probe P21.
6. Measure the minified size and the gzip size of the runtime.

Exit criteria:

- The results are in `docs/performance.md`.
- The memory tests pass.

### Phase 6. Correct the package and the build

| Item | Value |
|---|---|
| Size | S |
| Blocked by | D5, D7, D8, D9 |
| Review gate | No |

Steps:

1. Set the package name (decision D8) and the version (decision D9).
2. Set the `exports` field. Put the `types` condition first in each entry. Add the entries `./babel-preset` and `./runtime`. If decision D4 is option B, add the `node` condition.
3. Remove `dist/.tsbuildinfo` from the published files.
4. Change `@babel/core` to an optional peer dependency. Add the two Babel transforms as dependencies.
5. Set the `engines` and `sideEffects` fields correctly.
6. In `tsconfig.json`, remove the entries for files that do not exist. Set the target from decision D5. Add the `DOM` library.
7. Remove `run-tests.sh` and the `bash -c` script.
8. Add a smoke test. The smoke test packs the package and installs it in a new Vite application. Then it does the README setup steps and runs one check.

Exit criteria:

- The smoke test passes in CI.
- `npm pack --dry-run` shows only the necessary files.

### Phase 7. Write the documentation in STE

| Item | Value |
|---|---|
| Size | M |
| Blocked by | D10, D13 |
| Review gate | Yes |

Steps:

1. Write `README.md`. Include the purpose, the context rules C1 to C12, the setup procedure, the limits, the API reference, and recipes for Vite and webpack.
2. Write all procedures as numbered steps in the imperative.
3. Add CAUTION notes for the global patches, the load order, code that Babel does not transform, and other code that patches `Promise`.
4. Write `docs/testing.md`, `docs/design.md`, and `CHANGELOG.md`.
5. Write the comments in the source code in STE.
6. Remove the documents of decision D10.
7. Make a table of claims. For each claim in the documentation, give the test or the measurement that shows it.
8. Examine all documents with an STE checker if one is available. If no checker is available, use the checklist in Appendix G.

Exit criteria:

- Each claim has a test or a measurement.
- The documents pass the STE checklist.

### Phase 8. Release

| Item | Value |
|---|---|
| Size | S |
| Blocked by | D8, D9, and the explicit approval of the maintainer |
| Review gate | Yes, before step 1 |

CAUTION: Do not publish the package before the maintainer approves. A published version is public. npm lets you remove a version only in a short period and with conditions.

Steps:

1. Set the version and complete `CHANGELOG.md`.
2. Merge the pull request.
3. Make a git tag for the version.
4. Publish the package to npm.

Exit criteria:

- The smoke test passes with the published package.

## 6. Test strategy

### 6.1 Test layers

| Layer | Tool | What the layer shows |
|---|---|---|
| Unit | Vitest on Node.js | Each part of the runtime operates correctly. |
| Rules | Vitest on Node.js and in browsers | Rules C1 to C12. |
| Transform fixtures | Vitest and Babel | The output and the results of transformed code. |
| Reference | Vitest and `AsyncLocalStorage` | The library gives the same results as Node.js. |
| Order variation | Vitest with a random scheduler that has a fixed seed | No leak occurs in many different orders of steps. |
| Browser APIs | Vitest browser mode in three engines | The patched APIs operate correctly. |
| Memory | Node.js with `--expose-gc` | Rule C12. |
| Mutation | StrykerJS | The tests find errors that a mutant adds to the runtime. |
| Speed | tinybench in separate processes | The results of Phase 5. |
| Smoke | The packed package in a Vite application | The README steps operate. |

### 6.2 Rules for each test

1. Use two or more contexts. Let a different context run immediately before each read.
2. Read the value at the points of risk: in the same expression after `await`, in callbacks that the library does not wrap, and in code that the transform does not change.
3. Do not put assertions in callbacks that the test does not wait for.
4. Do not use time limits to examine correctness. Put speed checks in the benchmarks.
5. Do not skip a test silently. Use `test.skipIf` with a reason.
6. Use a fixed seed for random values. Record the seed when a test fails.
7. Make each test name state the rule and the expected result.

## 7. Acceptance criteria

The work is complete when all of these conditions are true:

1. All tests for rules C1 to C12 pass on Node.js, Chromium, Firefox, and WebKit.
2. The probe results agree with the exit criteria of Phase 3.
3. The mutation score of the runtime is 85% or more.
4. 20 test runs in a sequence pass.
5. A test or a measurement supports each claim in the documentation.
6. The documentation passes the STE checklist.
7. The smoke test passes with the packed package.
8. The memory tests pass.

## 8. Risks

| ID | Risk | Control |
|---|---|---|
| K1 | Generator-based async is slower than native `await`. | Measure in Phase 5. Make the step function faster. Publish the numbers. |
| K2 | The step function changes the number of microtask steps. Code that depends on an exact microtask order can operate differently. | Document this. Add tests for usual order patterns. |
| K3 | Stack traces and the async stack view in browser tools change. | Publish source maps. Document the change. |
| K4 | Other Babel plugins or presets change the code in a different order. | Give a preset. Test with `@babel/preset-env`. Document the order. |
| K5 | Tools that do not use Babel, for example esbuild, SWC, and `tsc`, do not apply the transform. | Give recipes. Plugins for SWC and esbuild are out of scope. |
| K6 | Users think that dependencies get the context. | Add a CAUTION to the README (rule C7). |
| K7 | The TC39 proposal changes. | Keep the context rules in one module. Follow the proposal. |
| K8 | Other code patches `Promise.prototype.then`, for example zone.js. | Document this as a limit. If `then` is not native when the runtime loads, show a warning in development mode. |
| K9 | Browsers add a native AsyncContext. | Later task: if `globalThis.AsyncContext` exists, use it. |

## 9. Out of scope

- Web workers, iframes, and other realms.
- Code in `eval()` and `new Function()`.
- Plugins for SWC and esbuild.
- Operation together with zone.js.
- An automatic context for events and observers, if decision D14 is option A.

## 10. Terms

| Term | Meaning in this document |
|---|---|
| context | The values that all `Variable` objects give at one point in the program. |
| root context | The context that has no values. In the root context, `get()` gives the default value. |
| frame | An object that identifies one context. A frame does not contain values. |
| step | A part of a function that runs with no stop: from the start or from one `await` or `yield`, to the next `await`, `yield`, or end. |
| registration context | The context when the program calls `then`, `catch`, or `finally`. |
| creation context | The context when the program makes a promise. |
| transform | The Babel preset of this library, or its output. |
| leak | A condition in which code gets the context of a different operation. |
| probe | A small program from the review that shows one problem (P01 to P23). |
| mutant | A copy of the runtime with a known error. We use mutants to examine the tests. |
| maintainer | The owner of this repository. The maintainer makes the decisions in section 3. |

## Appendix A. Problem list

### A.1 Runtime (`src/context.ts`)

| ID | Location | Problem | Probe |
|---|---|---|---|
| RC1 | `src/context.ts:89`, `:591` | `__setAsyncContext` sets the global context. Nothing sets the previous context again. | P01, P02, P17 |
| RC2 | `src/context.ts:312`, `:388` | `then` and `finally` use the context of the promise before the current context. | P03, P22 |
| RC3 | `src/context.ts:50`, `:370` | Each result of `then` keeps a strong reference to its parent promise. | P21 |
| RC3 | `src/context.ts:244`, `:255` | `createdPromise` is always `undefined` while the executor runs. The code that uses it never runs. | none |
| RC4 | `src/context.ts:227-303` | The runtime replaces the `Promise` constructor with a plain function. | P04 |
| RT1 | `src/context.ts:596` | `__getAsyncContext` is on `globalThis`. It gives a map of all values to all scripts. `AsyncSnapshot.contexts` also shows all values. | none |
| RT2 | `src/context.ts:89` | The state is in the module, but the hooks are on `globalThis`. Two copies of the library do not operate together. | P19 |
| RT3 | `src/context.ts:423` | `patchTimers` has no guard. A second `init()` call wraps the timers two times. | none |
| RT4 | `src/context.ts:316` | A debug check runs on each `then` call. | none |
| RT5 | `src/context.ts:573` | The runtime copies the context map on each async call and each timer. The maps never change, so the copies are not necessary. | none |
| RT6 | `src/context.ts:306`, `:425` | The patched functions lose their names (`then`, `setTimeout`). | P04 |

### A.2 Babel plugin (`babel-plugin/index.js`)

| ID | Location | Problem | Probe |
|---|---|---|---|
| RC5 | `index.js:217` | The context restore is after the full statement, not after the `await`. | P16 |
| RC5 | `index.js:82-96` | `for await` uses only `Symbol.asyncIterator`. Sync iterables fail. | P05 |
| RC5 | `index.js:36-42` | The loop variable becomes one `let` outside the loop. Destructuring gives a syntax error, and closures share one variable. | P06, P08 |
| RC5 | `index.js:20-175` | The `for await` transform does not call `return()` on `break`. Labels and top-level `for await` fail. | P07, P09, P10 |
| RC5 | `index.js:245-265` | `var` becomes `let`. Two declarations of one name give a syntax error, and block scope changes. | P11, P12 |
| RC5 | `index.js:276-323` | Destructuring with default values stops the build with a `TypeError`. | P13, P14 |
| RC5 | `index.js:360-369` | A declaration with more than one declarator moves into a `try` block. | P15 |
| RC5 | `index.js:178-407` | `yield` is not a restore point. Generator bodies run in the context of the caller of `next()`. | P18, P23 |

### A.3 Tests (`tests/`)

| ID | Location | Problem |
|---|---|---|
| TST1 | `tests/suites/` (all) | Most tests use one context at a time. A leaked value is the same as the correct value. |
| TST2 | `tests/suites/` (all) | Each test makes a new `AsyncVariable`. A value that leaks from an earlier test cannot show. |
| TST3 | `tests/suites/08-long-running/long-running.test.js:198` | The memory test ends with `expect(true).toBeTruthy()`. |
| TST4 | `tests/suites/13-modern-promises/modern-promises.test.js:204` | The test examines only `handlers.length`. It does not examine the context. |
| TST5 | `tests/suites/11-browser-apis/browser-apis.test.js:213-311` | The observer and `MessageChannel` tests examine only that a callback ran. |
| TST6 | `tests/suites/11-browser-apis/browser-apis.test.js:147-210` | The event tests dispatch events synchronously inside `run()`. A runtime with no async support passes. |
| TST7 | `tests/suites/10-performance/performance.test.js:204` | The test reads `ctx._contexts`, which does not exist. The assertions never run. |
| TST8 | `tests/suites/14-edge-cases/edge-cases.test.js:38` | The test for "unset or undefined" expects `undefined` in both cases. |
| TST9 | `tests/suites/16-extreme-concurrency/extreme-concurrency.test.js:415` | The test expects a value greater than 0. The correct value is 120. |
| TST10 | `tests/suites/15-advanced-errors/advanced-errors.test.js:23` and others | The assertions are only in `catch` blocks. If no error occurs, the test passes. |
| TST11 | `tests/suites/02-error-handling/error-handling.test.js:325` | The test asserts the error of probe P03d as correct. |
| TST12 | `tests/suites/11-browser-apis/browser-apis.test.js:126`, `:239`, `:266`, and `modern-promises.test.js:17`, `:36` | If an API is not available, the test returns early and shows as passed. |
| TST13 | `tests/suites/01-core/core-tests.js:79`, `browser-apis.test.js:111` | Assertions in timer callbacks show only as uncaught errors or as timeouts. |
| TST14 | `tests/suites/10-performance/performance.test.js:22` | The speed baseline runs with the library. The test compares the library with itself. Speed tests fail when the computer is busy. |
| TST15 | `tests/framework/test-runner.js:363-368` | The timeout does not stop the test or its timer. A test that times out continues and changes the global context. |
| TST16 | `tests/framework/test-runner.js:371`, `:393` | `afterEach` runs two times when it throws. |
| TST17 | `tests/framework/test-runner.js:489-492` | `it.only` runs all tests in the suite. |
| TST18 | `tests/framework/test-runner.js:132`, `:178` | `toEqual` compares JSON text: all maps are equal. `toThrow` compares only messages. |
| TST19 | `package.json:40` | `test:build` ends with `\|\| true`. A transform error does not stop the build. |
| TST20 | none | No test uses `setInterval`. No test examines the Babel plugin directly. No CI exists. |

### A.4 Package and build

| ID | Location | Problem |
|---|---|---|
| PKG1 | `package.json:2`, `README.md:35` | The package name in `package.json` is different from the name in the README. |
| PKG2 | `package.json:10-15` | `exports` has no entry for the Babel plugin. The README setup cannot load the plugin. |
| PKG3 | `package.json:10-15` | The `types` condition is not first. |
| PKG4 | `package.json:16-21` | The published files contain `dist/.tsbuildinfo`. |
| PKG5 | `package.json:52-54` | The runtime package has a peer dependency on `@babel/core`. |
| PKG6 | `tsconfig.json` | `include` and `exclude` name files that do not exist (`src/context-final.ts`, `src/context-v2.ts`). |
| PKG7 | `tests/suites/**/*-transformed.js` | Generated files are in git. |

### A.5 Documentation

| ID | Location | Problem |
|---|---|---|
| DOC1 | `README.md:272`, `:340` | The constructor in the README is not the real constructor. The example does not compile (TS2559). |
| DOC2 | `README.md:281`, `:344` | `get()` gives `T \| undefined`, not `T`. The example does not compile (TS2322). |
| DOC3 | `README.md:41` | The plugin path does not resolve (`MODULE_NOT_FOUND` or `ERR_PACKAGE_PATH_NOT_EXPORTED`). |
| DOC4 | `README.md:105-108` | `setImmediate` and the observers are not patched. `COMPREHENSIVE_TEST_COVERAGE.md:325` says the opposite of the README. |
| DOC5 | `README.md:83`, `:426` | "No race conditions" is false (RC1). |
| DOC6 | `README.md:93`, `:306` | `for await` and third-party code do not operate automatically (RC5, P02). |
| DOC7 | `README.md:350-353` | The speed, size, and memory claims are false (Appendix D). |
| DOC8 | `README.md:359-364` | The browser versions are false. `dist` uses class fields and optional chaining. |
| DOC9 | `README.md:112` | The Meteor claim has no test. |
| DOC10 | `babel-plugin/README.md:41-55` | The example output calls `__restoreAsyncContext()`, which does not exist. |
| DOC11 | `TESTING.md`, `tests/docs/*.md` | The test counts are different (97, 200+, 217). The documents describe scripts, folders, hooks, and CI that do not exist. |
| DOC12 | `babel-plugin/index.js:9-11`, `src/context.ts:241-246`, `:555-560` | Code comments do not agree with the code. |
| DOC13 | All documents | The documents do not follow STE: no numbered procedures, no safety instructions, words that are not approved, passive voice, contractions, and different names for one thing. |

## Appendix B. Probe results

"Current" is the current library with the current plugin. "Prototype" is the prototype of Appendix E with the Babel transforms. An error result is marked with "(error)".

| ID | Scenario | Current | Prototype | Target |
|---|---|---|---|---|
| P01 | An unrelated task after request A ends | `request-A` (error) | `undefined` | `undefined` |
| P02 | A callback in a dependency that Babel does not transform, in request A | `B` (error) | `undefined` | `undefined` (rule C7) |
| P03a | `then` on a cached promise in request A | `A` | `A` | `A` |
| P03b | `then` on the same cached promise in request B | `A` (error) | `B` | `B` |
| P03c | `then` on a module-level promise in request C | `undefined` (error) | `C` | `C` |
| P03d | `then` outside `run()` on the result of `run()` | `inner` (error) | `undefined` | `undefined` |
| P03e | `then` on an async-function promise in request E | `E` | `E` | `E` |
| P04 | `Promise` subclass, identity, and function names (9 checks) | 9 errors | 0 errors | 0 errors |
| P05 | `for await` over an array | `TypeError` (error) | `1,2` | `1,2` |
| P06 | `for await` with destructuring | `SyntaxError` (error) | `1a,2b` | `1a,2b` |
| P07 | `break` in `for await` calls `return()` | no (error) | yes | yes |
| P08 | Closures over the `for await` variable | `3,3,3` (error) | `1,2,3` | `1,2,3` |
| P09 | Labeled `for await` with `continue` | `SyntaxError` (error) | `11,21` | `11,21` |
| P10 | Top-level `for await` | `ReferenceError` (error) | `1,2` | `1,2` |
| P11 | One `var` declared two times with `await` | `SyntaxError` (error) | `2` | `2` |
| P12 | `var` in a block, read after the block | `ReferenceError` (error) | `42` | `42` |
| P13 | Object destructuring default after `await` | build stops (error) | `3` | `3` |
| P14 | Array destructuring default after `await` | build stops (error) | `3` | `3` |
| P15 | Two declarators, one with `await` | `ReferenceError` (error) | `3` | `3` |
| P16 | Read in the same expression after `await` (4 forms) | `B` (error) | `A` | `A` |
| P17 | An async handler that an unrelated event starts | `request-A` (error) | `undefined` | `undefined` |
| P18 | Async generator made in A, `next()` in B, then in C | `B`, `C` | `created-in-A` two times | `created-in-A` (rule C5) |
| P19 | Two copies of the library | `undefined` (error) | `X` | `X` |
| P20a | README constructor `new AsyncVariable(0)` | `undefined` | `undefined` | Correct the README (DOC1) |
| P20b | `new AsyncVariable({ defaultValue: 0 })` | `0` | `0` | `0` |
| P21 | First promise of a 200,000-step `then` chain is released | no, 20.4 MB (error) | yes, 3.6 MB | yes |
| P22a | Module-level `Promise.resolve()` promise, `then` in request C | `undefined` (error) | `C` | `C` |
| P22b | Module-level async-function promise, `then` in request C | `C` | `C` | `C` |
| P23 | Sync generator made in A, `next()` in B, then at the root | `B`, `undefined` (error) | `created-in-A` two times | `created-in-A` (rule C5) |

Without the library, the heap after probe P21 is 3.5 MB.

## Appendix C. Mutation results for the current tests

Each mutant is a copy of the runtime with a known error. Each row shows the number of current tests that pass with that mutant, out of 217. All runs used headless Chromium.

| Runtime | Tests that pass |
|---|---|
| Current runtime, run 1 | 217 |
| Current runtime, run 2 (same code) | 214. Three speed tests failed. |
| m1: no Promise patches | 202 |
| m2: no timer patches | 207 |
| m3: no restore after `await` | 101 |
| m4: no async support | 82 |
| m5: one global value for each variable, never restored | 148 |
| m6: `then` uses the registration context | 214. One test failed because it asserts an error. Two speed tests failed. |

## Appendix D. Benchmark results

Each value is the median of 5 rounds. Each round is the median of 7 runs. Node.js 25.2.1 on Windows 11. Each case ran in a separate process.

| Benchmark | Plain JavaScript (ms) | Current library (ms) | Current factor | Prototype (ms) | Prototype factor |
|---|---|---|---|---|---|
| 300,000 `await` in one loop | 13.4 | 17.0 | 1.28 | 15.8 | 1.18 |
| 200,000 async function calls | 16.1 | 29.6 | 1.84 | 31.8 | 1.98 |
| 200,000 `then` calls in a chain | 8.1 | 14.8 | 1.84 | 17.6 | 2.18 |
| 10,000 tasks with 10 `await` each | 7.7 | 11.0 | 1.44 | 11.7 | 1.53 |

The README says that the runtime overhead is 2% to 5%. These results do not agree.

Sizes of `dist/context.js` (current runtime): 17.5 kB, 3.6 kB with gzip, 5.6 kB minified, 1.4 kB minified with gzip. The README says 15 KB and 7 KB with gzip.

## Appendix E. Prototype code

The prototype is a feasibility test, not production code. It handles only generator declarations. Its only tests are the probes. Phase 2 and Phase 3 can use it as a start.

### E.1 Runtime (`acx.mjs`)

```js
// Prototype runtime. Not production code.
// Frames form a chain. Each Variable keeps its values in a private WeakMap,
// with the frame as the key. The shared current frame shows no values.
// One global store (Symbol.for) lets two copies of the library share the state.
// The runtime sets a context only for one synchronous step. Then it sets the previous context.
const KEY = Symbol.for('acx.spike.store');
const store = (globalThis[KEY] ??= { current: Object.freeze({ parent: null }), patched: false });
const OrigPromise = Promise;
const origThen = OrigPromise.prototype.then;
function enter(frame) { const prev = store.current; store.current = frame; return prev; }
function bind(frame, fn) { return function (...args) { const prev = enter(frame); try { return fn.apply(this, args); } finally { store.current = prev; } }; }
export class Variable {
  #values = new WeakMap(); #name; #default;
  constructor(options = {}) { this.#name = String(options.name ?? ''); this.#default = options.defaultValue; }
  get name() { return this.#name; }
  get() { for (let f = store.current; f !== null; f = f.parent) { if (this.#values.has(f)) return this.#values.get(f); } return this.#default; }
  run(value, fn, ...args) { const frame = Object.freeze({ parent: store.current }); this.#values.set(frame, value); const prev = enter(frame); try { return fn(...args); } finally { store.current = prev; } }
}
export class Snapshot {
  #frame = store.current;
  run(fn, ...args) { const prev = enter(this.#frame); try { return fn(...args); } finally { store.current = prev; } }
  static wrap(fn) { if (typeof fn !== 'function') throw new TypeError('Snapshot.wrap: not callable'); return bind(store.current, fn); }
}
// Step function for @babel/plugin-transform-async-to-generator ({ module, method: 'coroutine' }).
export function coroutine(genFn) {
  return function () {
    const frame = store.current;
    const gen = genFn.apply(this, arguments);
    return new OrigPromise((resolve, reject) => {
      const step = (key, arg) => {
        const prev = enter(frame);
        let info;
        try { info = gen[key](arg); } catch (error) { store.current = prev; reject(error); return; }
        store.current = prev;
        if (info.done) { resolve(info.value); return; }
        origThen.call(OrigPromise.resolve(info.value), (v) => step('next', v), (e) => step('throw', e));
      };
      step('next', undefined);
    });
  };
}
// A generator keeps the context of its creation (TC39 GeneratorStart and GeneratorResume).
export function bindGenerator(gen) {
  const frame = store.current;
  const call = (key, arg) => { const prev = enter(frame); try { return gen[key](arg); } finally { store.current = prev; } };
  const w = { next: (v) => call('next', v), throw: (e) => call('throw', e), return: (v) => call('return', v) };
  if (typeof gen[Symbol.asyncIterator] === 'function') w[Symbol.asyncIterator] = function () { return this; };
  else w[Symbol.iterator] = function () { return this; };
  return w;
}
if (!store.patched) {
  store.patched = true;
  // The registration context (TC39 PerformPromiseThen). catch, finally, and the combinators call then().
  OrigPromise.prototype.then = function then(onFulfilled, onRejected) {
    const frame = store.current;
    return origThen.call(this,
      typeof onFulfilled === 'function' ? bind(frame, onFulfilled) : onFulfilled,
      typeof onRejected === 'function' ? bind(frame, onRejected) : onRejected);
  };
  for (const name of ['setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'requestIdleCallback']) {
    const orig = globalThis[name];
    if (typeof orig !== 'function') continue;
    globalThis[name] = { [name](cb, ...rest) { return orig.call(this, typeof cb === 'function' ? bind(store.current, cb) : cb, ...rest); } }[name];
  }
}
```

### E.2 Generator binder plugin (`bind-generators.cjs`)

```js
// Prototype plugin. Wraps generator declarations, so that the body keeps the context of its creation.
// It runs in Program enter, so that it changes generators before the async generator transform does.
module.exports = function ({ types: t }) {
  const visitor = {
    FunctionDeclaration(path, state) {
      const node = path.node;
      if (!node.generator || node.__acxInner) return;
      const innerId = path.scope.generateUidIdentifier(node.id.name);
      const inner = t.functionDeclaration(innerId, node.params, node.body, true, node.async);
      inner.__acxInner = true;
      const outer = t.functionDeclaration(t.identifier(node.id.name), [], t.blockStatement([
        t.returnStatement(t.callExpression(t.identifier('__acx_bindGenerator'), [
          t.callExpression(t.memberExpression(innerId, t.identifier('apply')), [t.thisExpression(), t.identifier('arguments')]),
        ])),
      ]));
      state.needsBind = true;
      path.replaceWithMultiple([outer, inner]);
    },
  };
  return {
    name: 'acx-spike-bind-generators',
    visitor: {
      Program: {
        enter(path, state) { path.traverse(visitor, state); },
        exit(path, state) {
          if (!state.needsBind) return;
          path.unshiftContainer('body', t.importDeclaration(
            [t.importSpecifier(t.identifier('__acx_bindGenerator'), t.identifier('bindGenerator'))], t.stringLiteral('./acx.mjs')));
        },
      },
    },
  };
};
```

### E.3 Babel configuration (`babel.spike.config.cjs`)

```js
const nm = require("node:path").join(__dirname, "node_modules") + "/";
module.exports = {
  babelrc: false,
  plugins: [
    require.resolve('./bind-generators.cjs'),
    nm + '@babel/plugin-transform-async-generator-functions',
    [nm + '@babel/plugin-transform-async-to-generator', { module: './acx.mjs', method: 'coroutine' }],
  ],
};
```

## Appendix F. File changes

This list assumes that the maintainer accepts all proposed options.

### F.1 Files to add

```
src/index.ts                public API: AsyncContext, Variable, Snapshot, and aliases
src/store.ts                context store and frames
src/variable.ts             Variable
src/snapshot.ts             Snapshot
src/patches/promise.ts      the then patch
src/patches/schedulers.ts   the timer patches and the other scheduler patches
src/coroutine.ts            step function and generator binder
src/node/index.ts           Node.js runtime with AsyncLocalStorage (decision D4, option B)
babel/preset.cjs            Babel preset
babel/bind-generators.cjs   generator binder plugin
tests/rules/                one test file for each rule C1 to C12
tests/regression/           probes P01 to P23
tests/transform/            fixtures and fixture tests
tests/reference/            tests that compare the library with AsyncLocalStorage
tests/memory/               memory tests
bench/                      benchmarks
docs/design.md              rules and design
docs/testing.md             test guide
docs/performance.md         benchmark results
CHANGELOG.md                change history
vitest.config.ts            Vitest configuration
.github/workflows/ci.yml    CI workflow
```

### F.2 Files to change

- `src/context.ts`: replace it with the files in `src/`.
- `package.json`: name, version, `exports`, files, dependencies, scripts, `engines`, and `sideEffects`.
- `tsconfig.json`: target, libraries, `include`, and `exclude`.
- `README.md`: write it again in STE.
- `.gitignore`: add the folders of the test tools.

### F.3 Files to remove

- `babel-plugin/index.js`, `babel-plugin/package.json`, and `babel-plugin/README.md`
- `.babelrc`
- `run-tests.sh`
- `tests/framework/`
- `tests/runner.html`
- `tests/suites/` after Phase 4 moves the tests
- `TESTING.md`, `COMPREHENSIVE_TEST_COVERAGE.md`, `tests/docs/TESTING_STRATEGY.md`, and `tests/docs/PROGRESS.md`

## Appendix G. STE checklist for this project

1. Write each procedure as numbered steps in the imperative. Use one instruction in each step, unless two actions occur at the same time.
2. Use no more than 20 words in a procedural sentence.
3. Use no more than 25 words in a descriptive sentence. Use no more than six sentences in a paragraph. Start each paragraph with its main information.
4. Use the active voice.
5. Use only these verb forms: infinitive, imperative, simple present, simple past, future, and the past participle as an adjective.
6. Do not use the -ing form of a verb, except in a technical name.
7. Do not make noun clusters of more than three nouns.
8. Do not use contractions or semicolons.
9. Use one term for one thing. Use the terms in section 10.
10. Use CAUTION for a risk to data, systems, or programs. Use WARNING only for a risk of injury. Start the instruction with a command. Then give the reason.
11. Replace these words:

    | Do not use | Use |
    |---|---|
    | ensure | make sure |
    | provide | give |
    | require | be necessary |
    | utilize | use |
    | perform | do |
    | verify | make sure, examine |
    | obtain | get |
    | maintain | keep |
    | should | must, or rewrite the sentence |
    | may, might | can, possibly |

12. Do not use words that you cannot measure, for example perfect, zero, seamless, beautiful, or comprehensive. Do not use emoji as status marks.
13. Give a test or a measurement for each claim.

## 11. Execution

The work was done on 2026-10-08. These items are different from the plan:

| Item | Plan | Execution | Reason |
|---|---|---|---|
| D11 | A branch and a pull request | Commits directly on `main` | The maintainer asked for this. |
| D12 | Review gates after Phases 1, 3 and 7 | One review at the end | The maintainer asked for this. |
| D14 | Option A: no patches of events and observers | Option B: patches of events, `on...` properties, observers, streams and callback APIs, with rule C13 for events | The maintainer asked for the library to operate in all cases. |
| Storage | One `WeakMap` for each variable | Private fields of the frames, with a cache of the last search | The `WeakMap` storage made `run()` and the garbage collector slow (docs/performance.md). |
| Package manager | npm | pnpm, with a workspace for the website and the STE linter | The other projects of the maintainer use pnpm. |
| Website | Not in the plan | A documentation website with interactive diagrams in `site/` | The maintainer asked for it. |

The results are in these documents:

- `CHANGELOG.md`: the changes of version 0.1.0.
- `docs/design.md`: the design.
- `docs/testing.md`: the test projects and layers.
- `docs/performance.md`: the benchmark results.
- `docs/legacy-test-triage.md`: the result for each legacy test.


### 11.1 Acceptance criteria

| Criterion of section 7 | Result |
|---|---|
| 1. The rule tests pass on Node.js, Chromium, Firefox and WebKit. | Pass. CI runs them on Node.js 22 and 24, and in the three browsers. Rule C13 also passes in the three browsers. |
| 2. The probe results agree with the exit criteria of Phase 3. | Pass. `test/regression/probes.test.ts` examines each probe. |
| 3. The mutation score of the runtime is 85% or more. | Pass: 98.03%. Stryker made 431 mutants. The tests found 389, 9 timed out, and 8 survived. The 8 survivors and 25 more mutants have no effect on a result: comments in the source or `docs/testing.md` give the reason for each. |
| 4. 20 test runs in a sequence pass. | Pass. In 50 runs in a sequence on Windows, each run did the same 151 files and 1,523 tests, and no test failed. In run 6 of an earlier check, only 1,500 of the 1,523 tests gave a result. The cause was the browser tests of a different project at the same time. Its browser API server listened on `127.0.0.1:63315`, and Firefox connected to it, not to the server of this project on `[::1]:63315`. A stand-in server on `127.0.0.1` reproduced the loss: Vitest showed an `Unhandled Error`, but no `FAIL` line. With the fix, the server listens on `127.0.0.1` on a free port, and a check fails each run that loses a test file (`docs/testing.md`). After the fix, two copies of the repository did the full run at the same time in 45 pairs. 89 of the 90 runs did all 152 files and 1,531 tests. One run stopped at the start, because the first version of the port search examined too few ports. This error is corrected. |
| 5. A test or a measurement supports each claim in the documentation. | Pass. The README gives the rules, the patched APIs and the benchmark results. The tests and `pnpm bench` give the evidence. |
| 6. The documentation passes the STE checklist. | Pass. `pnpm lint:ste` finds no problems in 120 files. |
| 7. The smoke test passes with the packed package. | Pass, on Windows and in CI. |
| 8. The memory tests pass. | Pass. |
