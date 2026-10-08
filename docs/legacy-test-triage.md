# Legacy test triage

This document records the result of each test of the old test suite. The old suite had 217 tests in 16 JavaScript files. Phase 4 of the remediation plan sorted these tests. The repository does not contain the old files. Git keeps them at commit `1cf6708`, in `test/legacy/suites/`.

Each old test has one of these results:

- **Move**: The old test is correct. The new test does the same check in Vitest.
- **Make stronger**: The new test adds a check that the old test did not have. The check is a second context, a read at a point of risk, or an assertion.
- **Change**: The old test expected an incorrect result, or its name did not agree with its assertions. The new test expects the result that the context rules specify.
- **Remove**: The old test cannot fail, does the same check as a different test, or measures speed. The benchmarks measure speed, and the tests in `test/memory/` examine memory.

| Result | Count |
| --- | --- |
| Move | 65 |
| Make stronger | 82 |
| Change | 5 |
| Remove | 65 |
| Total | 217 |

The new tests are in `test/legacy/`. There are 155 new tests in 15 files. Each Vitest project includes them. On Node.js, the 12 tests that need a browser do not operate, and the report shows them as skipped tests.

In the tables, a name in the "New test or reason" column is a test of the new file. A reason that names `c01` to `c06` refers to the rule tests in `test/rules/`.

## 01-core/core-tests.js

New file: `test/legacy/01-core.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should maintain context through concurrent async operations` | 25 | Remove | Same check as `c03`: `gives each of 100 concurrent calls its own context after each await`. |
| `should handle nested contexts correctly` | 51 | Remove | Same check as `c01`: `gives the context of the caller after the caller awaits a function in another context`. |
| `should propagate context through setTimeout` | 74 | Remove | Same check as `c06`: `applies the rule to setTimeout with two contexts`. The old assertion was in a timer callback. |
| `should propagate context through Promise.then chains` | 88 | Remove | Same check as `c04`: `applies the rule to each callback of a then chain`. |
| `should support multiple AsyncVariable instances` | 102 | Make stronger | `keeps the values of two variables after an await, while other contexts resume first` |
| `should handle nested context inside .then() callback (bug regression)` | 122 | Move | `keeps the context in an async then callback that nests run() (regression of the old runtime)` |
| `should prioritize currentSyncContext over currentActivePromise` | 147 | Remove | It examined internal parts of the old runtime. `c06` examines a timer in a nested run. |
| `should validate that await bypasses .then() (architecture test)` | 174 | Remove | It examined the JavaScript engine, not the library. |

## 02-error-handling/error-handling.test.js

New file: `test/legacy/02-error-handling.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should maintain context in .catch() handler` | 24 | Remove | Same check as `c04`: `applies the rule to catch and finally`. |
| `should maintain context after caught error` | 38 | Make stronger | `gives the outer context in a catch block after an inner run() rejects, while another context resumes first` |
| `should handle nested .run() inside catch block` | 55 | Move | `keeps the contexts of a run() nested in a catch block` |
| `should maintain context in .finally() handler` | 81 | Remove | Same check as `c04`: `applies the rule to catch and finally`. |
| `should maintain context in .finally() after rejection` | 96 | Make stronger | `runs a finally callback on a rejected promise in the context of the finally call` |
| `should maintain context when .finally() throws` | 115 | Make stronger | `rejects with the error of a finally callback that throws, and runs it in the context of the finally call` |
| `should maintain context when async function throws immediately` | 138 | Remove | Same check as `c03`: `rejects the promise of the call when the body throws before the first await`. |
| `should maintain context when async function throws after await` | 150 | Make stronger | `keeps the context before a throw that follows an await, while another context resumes first` |
| `should maintain context through multiple awaits before throw` | 164 | Remove | Same check as the new test of line 150. |
| `should maintain context in calling code after async function throws` | 180 | Remove | Same check as the new test of line 38. |
| `should propagate context through Promise.all rejection` | 207 | Make stronger | `runs a catch callback on a rejected Promise.all in the context of the catch call` |
| `should maintain context through nested .run() with errors` | 225 | Move | `gives each level its context when errors pass through three nested runs` |
| `should handle errors in Promise.then chains` | 253 | Move | `keeps the context in each callback of a then chain that rejects` |
| `should maintain context when error bubbles through multiple contexts` | 275 | Move | `records the context of each level when an error passes out of three nested runs` |
| `should handle concurrent errors in Promise.all` | 298 | Change | `runs each catch callback in the context of its catch call, while the promises reject in other contexts`. The old test expected the context of the rejected promise (rule C4 gives the context of the `catch` call). |

## 03-promise-combinators/promise-combinators.test.js

New file: `test/legacy/03-promise-combinators.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should maintain separate contexts for each promise in Promise.all` | 23 | Move | `gives each input of Promise.all its own context` |
| `should maintain context after Promise.all resolves` | 42 | Move | `keeps the outer context after an await of Promise.all` |
| `should handle nested Promise.all with different contexts` | 62 | Move | `keeps the contexts of nested Promise.all calls` |
| `should maintain context of winning promise in Promise.race` | 99 | Make stronger | `gives the winner of Promise.race its own context` |
| `should maintain outer context after Promise.race` | 118 | Move | `keeps the outer context after an await of Promise.race` |
| `should handle Promise.race with rejection` | 138 | Make stronger | `rejects Promise.race with the error of the first rejection, and keeps the outer context in the catch block` |
| `should maintain context for all promises in Promise.allSettled` | 166 | Move | `gives each input of Promise.allSettled its own context` |
| `should handle mixed success and failure in Promise.allSettled` | 184 | Move | `gives the context of each input to the values and reasons of Promise.allSettled` |
| `should maintain outer context after Promise.allSettled` | 210 | Move | `keeps the outer context after an await of Promise.allSettled` |
| `should maintain context of first resolved promise in Promise.any` | 235 | Move | `gives the first fulfilled input of Promise.any its own context` |
| `should handle all-rejected scenario in Promise.any` | 254 | Make stronger | `rejects Promise.any with an AggregateError of the errors in each context` |
| `should maintain outer context after Promise.any resolution` | 278 | Move | `keeps the outer context after an await of Promise.any` |

## 04-deep-nesting/deep-nesting.test.js

New file: `test/legacy/04-deep-nesting.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle 3-level nesting` | 16 | Move | `keeps the context at each of three nested levels, before and after an await` |
| `should handle 5-level nesting` | 44 | Remove | Same check as the new tests of lines 16 and 82. |
| `should handle 10-level deep nesting` | 82 | Make stronger | `keeps the context at each of ten recursive levels` |
| `should handle .run() → .then() → .run() pattern` | 107 | Move | `keeps the contexts in the pattern run(), then(), run()` |
| `should handle .run() → async/await → .run() pattern` | 135 | Move | `keeps the contexts in the pattern run(), async function, run()` |
| `should handle .then() → .run() → .then() pattern` | 160 | Move | `keeps the contexts in the pattern then(), run(), then()` |
| `should handle complex mixed nesting with multiple branches` | 187 | Move | `keeps the contexts of two branches that mix then() and run()` |
| `should handle sync .run() → async .run() alternation` | 225 | Move | `keeps the contexts when synchronous and async runs alternate` |
| `should handle deeply nested with mixed sync/async timing` | 262 | Move | `keeps the contexts of a synchronous run() inside each of five nested async levels` |
| `should maintain context through rapid sync-async transitions` | 295 | Make stronger | `records each context of rapid synchronous and async transitions` |

## 05-context-isolation/context-isolation.test.js

New file: `test/legacy/05-context-isolation.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should prevent context mutations from leaking between operations` | 16 | Remove | It did no mutation. Same check as `gives each input of Promise.all its own context` (suite 03). |
| `should ensure each .run() gets an independent context clone` | 33 | Remove | It examined no clone. Same check as the first new test of suite 01. |
| `should handle rapid sequential context switches` | 51 | Move | `gives each of 20 sequential runs its own context after an await` |
| `should handle 10 concurrent operations` | 70 | Remove | Same check as the new test of line 104. |
| `should handle 100 concurrent operations` | 87 | Remove | It examined only the count of unique values. `c03` examines 100 concurrent calls. |
| `should handle 1000 concurrent operations (stress test)` | 104 | Move | `gives each of 1000 concurrent runs its own context` |
| `should isolate contexts in nested concurrent operations` | 132 | Move | `keeps the contexts apart in two concurrent groups of nested runs` |
| `should maintain isolation with interleaved async operations` | 170 | Move | `gives each interleaved operation its own context at its start and its end` |

## 06-default-values/default-values.test.js

New file: `test/legacy/06-default-values.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should return default value when no context is set` | 16 | Remove | Same check as `c01`: `gives undefined without a default value, and the default value with one`. |
| `should return undefined when no default and no context` | 21 | Remove | Same check as `c01`: `gives undefined without a default value, and the default value with one`. |
| `should override default value within .run()` | 26 | Move | `replaces the default value in run(), also after an await, and gives the default value after run()` |
| `should handle multiple variables with different defaults` | 40 | Make stronger | `keeps the default values of the other variables in run() of one variable` |
| `should fall back to default after nested context ends` | 56 | Move | `gives the outer value after a nested run() ends, and the default value after the outer run() ends` |
| `should handle default values in concurrent operations` | 72 | Move | `gives the default value to an async function in the root context while runs are concurrent` |

## 07-async-snapshot/async-snapshot.test.js

New file: `test/legacy/07-async-snapshot.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should capture current context` | 18 | Make stronger | `restores the recorded context outside run(), also from inside another context` |
| `should capture from nested context` | 42 | Move | `restores a context that a nested run() recorded` |
| `should support multiple snapshots` | 63 | Move | `keeps each of three snapshots apart` |
| `should restore context in different execution` | 88 | Move | `restores the recorded context in an async function that snapshot.run() starts later` |
| `should handle nested snapshot restores` | 109 | Move | `restores nested snapshots and sets the outer context again after the inner one` |
| `should support async operations in snapshot.run()` | 133 | Move | `keeps the recorded context through awaits and a nested run() in snapshot.run()` |
| `should handle multiple restores of same snapshot` | 157 | Move | `restores the same snapshot five times` |
| `should capture multiple AsyncVariable contexts` | 178 | Move | `records the values of two variables` |
| `should restore partial context from snapshot` | 197 | Make stronger | `records no value for a variable that the context does not set` |
| `should handle snapshot with default values` | 214 | Move | `gives the default value of a variable that the recorded context does not set` |

## 08-long-running/long-running.test.js

New file: `test/legacy/08-long-running.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle 10 sequential awaits` | 16 | Remove | Same check as `c03`: `the code after 50 awaits` and `the code after await of a timer`. |
| `should handle 50 sequential awaits` | 27 | Remove | Same check as `c03`: `the code after 50 awaits`. |
| `should handle 100 sequential awaits` | 38 | Remove | Same check as `c03`: `the code after 50 awaits`. |
| `should maintain context across for loop with awaits` | 51 | Remove | Same check as `c03`: `the code after 50 awaits`. |
| `should maintain context across while loop with awaits` | 66 | Remove | Same check as `c03`: `a while condition`. |
| `should maintain context across iterations with varying delays` | 83 | Make stronger | `keeps the context in two concurrent loops that await single delays and Promise.all of delays` |
| `should handle recursive async functions (10 levels)` | 104 | Remove | Same check as `c03`: `a recursive async function`. |
| `should handle deep recursion (100 levels)` | 127 | Move | `keeps the context through 100 levels of async recursion` |
| `should handle recursive operations with nested contexts` | 145 | Make stronger | `keeps the context of each level in a recursion that nests runs` |
| `should handle sustained concurrent load` | 164 | Remove | It examined only counts. The waves test of suite 16 examines each value. |
| `should not leak memory during many operations` | 186 | Remove | It cannot fail (`expect(true)`). The tests in `test/memory/` examine memory. |

## 09-real-world/real-world.test.js

New file: `test/legacy/09-real-world.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should maintain request context through HTTP handler chain` | 17 | Make stronger | `keeps the request and user values through a handler chain, for two concurrent requests` |
| `should handle concurrent HTTP requests with isolated contexts` | 60 | Make stronger | `gives each of five concurrent requests its own value in each middleware`. The old assertion accepted the value of a different request. |
| `should maintain context through request retry logic` | 102 | Move | `keeps the request value through retries that fail` |
| `should maintain transaction context across queries` | 137 | Make stronger | `gives each query the transaction of its caller, for two concurrent transactions` |
| `should handle nested transactions with savepoints` | 173 | Move | `keeps the values of nested transactions with savepoints` |
| `should rollback transaction context on error` | 211 | Move | `keeps the transaction value in the rollback after an error` |
| `should maintain context through middleware chain` | 250 | Move | `keeps the request value before and after next() in each middleware of a chain` |
| `should handle middleware error propagation with context` | 311 | Move | `keeps the request value in a middleware that catches the error of the next middleware` |
| `should maintain trace context across async boundaries` | 343 | Move | `gives each log line the trace and the span of its code` |
| `should handle distributed tracing across service boundaries` | 384 | Move | `keeps the trace and changes the service name through three nested services` |
| `should maintain log context through parallel operations` | 437 | Make stronger | `gives each log line of parallel operations the request of its group, for two concurrent groups` |

## 10-performance/performance.test.js

The new test of this suite is in `test/legacy/04-deep-nesting.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should have minimal overhead for context operations` | 17 | Remove | It measured speed. Its baseline also used the library. |
| `should have constant-time context lookup` | 47 | Remove | It measured speed. |
| `should handle high throughput concurrent operations` | 84 | Remove | It measured speed with a limit on the wall clock. |
| `should maintain performance under sustained load` | 113 | Remove | It measured speed. |
| `should not leak memory during many sequential operations` | 147 | Remove | `performance.memory` is only in Chrome, and it is not precise. The tests in `test/memory/` examine memory. |
| `should cleanup contexts after completion` | 188 | Remove | It cannot fail: `ctx._contexts` does not exist. |
| `should handle memory pressure gracefully` | 226 | Remove | Same check as `gives each of 1000 concurrent runs its own context` (suite 05). |
| `should handle extreme concurrency (1000+ simultaneous operations)` | 257 | Remove | Same check as `gives each of 1000 concurrent runs its own context` (suite 05). |
| `should handle rapid context switching` | 284 | Remove | It measured speed. Same check as `gives the correct value in each of 10000 rapid synchronous runs` (suite 16). |
| `should handle deeply nested stress test` | 308 | Move | `keeps the context at 100 nested levels with ten parallel tasks at each level` (suite 04 file) |

## 11-browser-apis/browser-apis.test.js

New file: `test/legacy/11-browser-apis.test.ts`. The tests with "(browser only)" in their names do not operate on Node.js.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should propagate context through queueMicrotask` | 18 | Remove | Same check as `c06`: `applies the rule to queueMicrotask`. |
| `should handle nested queueMicrotask calls` | 38 | Make stronger | `runs nested queueMicrotask callbacks in the context of the first call, while another context schedules its own` |
| `should isolate contexts in concurrent queueMicrotask calls` | 62 | Remove | Same check as `c06`: `applies the rule to queueMicrotask`. |
| `should propagate context through requestAnimationFrame` | 89 | Make stronger | `runs a requestAnimationFrame callback in the context of its call (browser only)` |
| `should handle nested requestAnimationFrame` | 104 | Make stronger | `runs a nested requestAnimationFrame callback in the context of the first call (browser only)`. The old assertions were in callbacks. |
| `should propagate context through requestIdleCallback if available` | 125 | Make stronger | `runs a requestIdleCallback callback in the context of its call (browser with requestIdleCallback only)`. The old test stopped early without a report. |
| `should propagate context to synchronous event listeners` | 147 | Make stronger | `runs an event listener in the context of the code that dispatches the event synchronously (browser only)` |
| `should propagate context when using AsyncSnapshot for events` | 166 | Make stronger | `lets a listener use a snapshot for a context that is not the registration or the dispatch context (browser only)` |
| `should handle multiple event types with different contexts` | 188 | Change | `runs each listener in its registration context when the root context dispatches the events (browser only)`. The old test used one context only. |
| `should handle MutationObserver callbacks` | 214 | Change | `runs a MutationObserver callback in the context of the construction, not of the mutation (browser only)`. The old test examined only the count. |
| `should handle IntersectionObserver if available` | 238 | Make stronger | `runs an IntersectionObserver callback in the context of the construction (browser only)` |
| `should handle ResizeObserver if available` | 265 | Make stronger | `runs a ResizeObserver callback in the context of the construction (browser only)` |
| `should handle MessageChannel postMessage` | 295 | Change | `runs a MessagePort onmessage handler in the context of the assignment (browser only)`. The old comment said that the context does not go to the handler. Rule C13 gives the context of the assignment. |
| `should handle MessageChannel with AsyncSnapshot` | 314 | Make stronger | `lets a MessagePort handler use a snapshot of the sender (browser only)` |
| `should handle concurrent MessageChannel communications` | 336 | Make stronger | `keeps the registration contexts of two concurrent MessageChannel handlers apart (browser only)` |
| `should propagate context through fetch calls (mocked)` | 361 | Make stronger | `keeps the context after an await of fetch and of the response body, while another context resumes first`. The new test uses the real `fetch` with a data URL. |
| `should handle concurrent fetch requests with isolated contexts` | 386 | Make stronger | `gives each of three concurrent fetch calls its own context` |

## 12-async-iteration/async-iteration.test.js

New file: `test/legacy/12-async-iteration.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should propagate context through for await...of loop` | 24 | Remove | Same check as `c03`: `a for await loop over an async generator`. |
| `should maintain context across multiple iterations` | 39 | Move | `keeps the context in a for await body that awaits, before and after its await` |
| `should handle nested for await...of loops` | 55 | Move | `keeps the context in nested for await loops` |
| `should handle concurrent for await...of loops` | 81 | Move | `gives each of two concurrent for await loops its own context` |
| `should maintain context inside async generator function` | 113 | Make stronger | `gives the body of an async generator the context of the loop that makes and reads it`. `c05` examines a generator that a different context reads. |
| `should handle async generator with error` | 138 | Make stronger | `rejects the loop with the error of the generator, and keeps the contexts` |
| `should handle async generator with return` | 163 | Move | `ends a for await loop on the return of the generator, and keeps the context` |
| `should handle async generator with yield*` | 184 | Move | `keeps the context in a loop over an async generator that delegates with yield*` |
| `should handle custom async iterator` | 212 | Move | `keeps the context in a loop over an object with an async generator method` |
| `should handle async iterator with next/return/throw` | 236 | Make stronger | `calls return() of a custom async iterator one time when the loop breaks, and keeps the context` |
| `should handle async iteration with Promise.all` | 273 | Remove | Same check as the new test of line 81. |
| `should handle infinite async iterator with break` | 303 | Make stronger | `runs the finally block of an endless async generator when the loop breaks` |
| `should handle empty async generator` | 330 | Move | `runs no loop body for an async generator that yields nothing` |
| `should handle async generator that never yields` | 347 | Move | `runs no loop body for an async generator that only awaits and returns` |
| `should handle async generator with multiple contexts in pipeline` | 366 | Move | `keeps the context in a pipeline of two async generators` |

## 13-modern-promises/modern-promises.test.js

New file: `test/legacy/13-modern-promises.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle Promise.withResolvers if available` | 16 | Make stronger | `keeps the context after an await of Promise.withResolvers() that another context resolves (engines with withResolvers only)` |
| `should handle Promise.withResolvers reject` | 35 | Make stronger | `keeps the context in a catch block after Promise.withResolvers() rejects (engines with withResolvers only)`. The old assertion was only in a `catch` block. |
| `should maintain context during Promise constructor execution` | 56 | Move | `runs a Promise executor in the current context, and a timer of the executor in the same context` |
| `should handle Promise created before context, resolved after` | 78 | Move | `keeps the context after an await of a promise that the root context made` |
| `should handle context changes during Promise constructor` | 98 | Move | `keeps the contexts of a run() inside a Promise executor` |
| `should handle multiple .then() on same promise` | 129 | Move | `runs three then callbacks on one promise in the context of the then calls` |
| `should handle multiple .catch() on same promise` | 147 | Make stronger | `runs three catch callbacks on one promise in the context of each catch call`. The old test examined only the count. |
| `should handle mixed .then() and .catch() on same promise` | 164 | Make stronger | `runs the then and finally callbacks of a fulfilled promise in their contexts, and no catch callback` |
| `should isolate contexts for handlers attached in different contexts` | 184 | Change | `runs each handler of a shared promise in the context in which the code attached it`. The old test examined only the count. |
| `should handle Promise resolved before await` | 211 | Make stronger | `keeps the context after an await of a promise that resolved before the await` |
| `should handle Promise rejected before catch` | 223 | Make stronger | `keeps the context in a catch block after an await of a promise that rejected before the await` |
| `should handle long-delayed promise resolution` | 241 | Remove | Same check as `c03`: `the code after await of a timer`. |
| `should handle promise that never resolves (with timeout)` | 257 | Make stronger | `lets a run() wait on a promise that never settles, while other code keeps its context` |
| `should handle promise resolved multiple times (only first counts)` | 272 | Remove | It examined the JavaScript engine, not the library. |
| `should handle promise with both resolve and reject called` | 290 | Remove | It examined the JavaScript engine, not the library. |
| `should handle thenable (duck-typed promise)` | 310 | Make stronger | `keeps the context after an await of a thenable that a timer settles, while another context resumes first` |

## 14-edge-cases/edge-cases.test.js

New file: `test/legacy/14-edge-cases.test.ts`. Each "keeps ... as the same value" test reads the value before an await, immediately after the await while another context resumes first, and after a timer.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle null as context value` | 19 | Make stronger | `keeps null as the same value after an await, while another context resumes first` |
| `should handle undefined as explicit context value` | 29 | Remove | Same check as `c02`: `tells an explicit undefined apart from no value`. |
| `should distinguish between unset and undefined` | 38 | Remove | It could not tell the two cases apart. `c02` does: `tells an explicit undefined apart from no value`. |
| `should handle context value changing from null to defined` | 51 | Move | `gives null in the outer run() after a nested run() with a string ends` |
| `should handle Symbol as context value` | 67 | Make stronger | `keeps a Symbol as the same value after an await, while another context resumes first` |
| `should handle different symbols as different values` | 78 | Remove | It examined the identity of JavaScript symbols, not the library. |
| `should handle Symbol.for as context value` | 89 | Make stronger | `keeps a Symbol.for symbol as the same value after an await, while another context resumes first` |
| `should handle object with circular reference as context value` | 101 | Make stronger | `keeps an object with a circular reference as the same value after an await, while another context resumes first` |
| `should handle deeply nested circular references` | 115 | Remove | Same check as the new test of line 101. |
| `should handle array with circular reference` | 129 | Make stronger | `keeps an array with a circular reference as the same value after an await, while another context resumes first` |
| `should handle very large object as context value` | 144 | Make stronger | `keeps an object with 10000 properties as the same value after an await, while another context resumes first` |
| `should handle very large array as context value` | 162 | Make stronger | `keeps an array with 10000 elements as the same value after an await, while another context resumes first` |
| `should handle deeply nested object as context value` | 174 | Make stronger | `keeps an object nested 100 levels deep as the same value after an await, while another context resumes first` |
| `should handle multiple variables with same default value` | 195 | Make stronger | `gives the same default object to three variables until run() of one variable sets a value` |
| `should handle multiple variables with undefined default` | 212 | Remove | Same check as `keeps the default values of the other variables in run() of one variable` (suite 06). |
| `should handle rapid context creation and destruction` | 227 | Move | `gives the correct value in each of 1000 sequential async runs` |
| `should handle extremely short-lived contexts` | 238 | Remove | Same check as `gives the correct value in each of 10000 rapid synchronous runs` (suite 16). |
| `should handle context with zero-delay promises` | 254 | Remove | Same check as `c03`: `the code after await of a timer` and `the next statement`. |
| `should handle Date object as context value` | 271 | Make stronger | `keeps a Date as the same value after an await, while another context resumes first` |
| `should handle RegExp object as context value` | 282 | Make stronger | `keeps a RegExp as the same value after an await, while another context resumes first` |
| `should handle Map as context value` | 293 | Make stronger | `keeps a Map as the same value after an await, while another context resumes first` |
| `should handle Set as context value` | 306 | Make stronger | `keeps a Set as the same value after an await, while another context resumes first` |
| `should handle WeakMap as context value` | 317 | Make stronger | `keeps a WeakMap as the same value after an await, while another context resumes first` |
| `should handle Proxy as context value` | 330 | Make stronger | `keeps a Proxy as the same value after an await, while another context resumes first` |
| `should handle frozen object as context value` | 346 | Make stronger | `keeps a frozen object as the same value after an await, while another context resumes first` |
| `should handle sealed object as context value` | 359 | Make stronger | `keeps a sealed object as the same value after an await, while another context resumes first` |
| `should handle NaN as context value` | 372 | Make stronger | `keeps NaN as the same value after an await, while another context resumes first` |
| `should handle Infinity as context value` | 381 | Make stronger | `keeps Infinity ...` and `keeps -Infinity ...` (two new tests) |
| `should handle very large string as context value` | 393 | Make stronger | `keeps a string of 1000000 characters as the same value after an await, while another context resumes first` |
| `should handle BigInt as context value` | 404 | Make stronger | `keeps a BigInt as the same value after an await, while another context resumes first` |

## 15-advanced-errors/advanced-errors.test.js

New file: `test/legacy/15-advanced-errors.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle error thrown in .finally() block` | 23 | Make stronger | `rejects with the error of a finally callback, and runs it in the context of the finally call`. The old assertions were only in a `catch` block. |
| `should handle error in .finally() overriding successful result` | 39 | Remove | It examined the JavaScript engine, not the library. The new test of line 23 examines the context. |
| `should handle error in .finally() when promise already rejected` | 56 | Remove | It examined the JavaScript engine, not the library. |
| `should maintain context through nested .finally() with errors` | 71 | Make stronger | `runs three chained finally callbacks in the context of their calls when the second throws` |
| `should handle error in nested async function` | 104 | Make stronger | `gives the context of the run() to a catch block after an error of three nested async functions` |
| `should handle error in parallel async operations` | 129 | Make stronger | `rejects Promise.all with the first error of parallel operations, and keeps the context in the catch block` |
| `should handle error after multiple successful awaits` | 155 | Remove | Same check as `c03`: `a catch block after a rejection`. |
| `should handle promise rejected but never awaited` | 181 | Remove | It had no assertion. It examined the report of unhandled rejections, not the library. |
| `should handle promise rejected after function returns` | 199 | Remove | It had no assertion. |
| `should handle error in .run() callback` | 220 | Remove | Same check as `c01`: `gives the default value after a synchronous run() returns or throws`. |
| `should handle async error in .run() callback` | 235 | Move | `gives the default value after an async run() rejects` |
| `should handle error in nested .run() callbacks` | 250 | Remove | Same check as `records the context of each level when an error passes out of three nested runs` (suite 02). |
| `should recover context after error in try/catch` | 281 | Remove | Same check as `c03`: `a catch block after a rejection`. |
| `should handle multiple errors and recoveries` | 297 | Make stronger | `keeps the context after each of five caught rejections` |
| `should handle error recovery in Promise.allSettled` | 316 | Move | `keeps the context after an await of Promise.allSettled with rejections` |
| `should handle TypeError` | 341 | Make stronger | `gives a TypeError of the engine unchanged to the caller of an async run(), and keeps the context in its catch block` |
| `should handle RangeError` | 352 | Make stronger | `gives a RangeError of the engine unchanged to the caller of an async run(), and keeps the context in its catch block` |
| `should handle ReferenceError` | 363 | Make stronger | `gives a ReferenceError unchanged to the caller of an async run(), and keeps the context in its catch block` |
| `should handle custom error types` | 374 | Make stronger | `gives a custom error class unchanged to the caller of an async run(), and keeps the context in its catch block` |
| `should handle non-Error thrown values` | 393 | Make stronger | Three new tests: `gives a string ...`, `gives a number ...` and `gives a plain object unchanged to the caller of an async run(), and keeps the context in its catch block` |
| `should handle immediate error (synchronous)` | 428 | Remove | Same check as `c03`: `rejects the promise of the call when the body throws before the first await`. |
| `should handle delayed error` | 438 | Remove | Same check as the new test of line 235. |
| `should handle error after many async operations` | 449 | Remove | Same check as `keeps the context before a throw that follows an await, while another context resumes first` (suite 02). |

## 16-extreme-concurrency/extreme-concurrency.test.js

New file: `test/legacy/16-extreme-concurrency.test.ts`.

| Legacy test | Line | Result | New test or reason |
| --- | --- | --- | --- |
| `should handle 5000 concurrent operations` | 17 | Move | `gives each of 5000 concurrent runs its own context` |
| `should handle 10000 operations with varying delays` | 39 | Remove | Same check as the new test of line 17. |
| `should handle deeply nested concurrent operations` | 65 | Make stronger | `gives the context of each level to 64 concurrent leaves of a binary recursion` |
| `should handle 10000 rapid synchronous context switches` | 92 | Move | `gives the correct value in each of 10000 rapid synchronous runs` |
| `should handle rapid async context switches` | 108 | Make stronger | `gives each of 1000 rapid async runs its context before and after a timer`. The old test did not wait for the runs and examined only the count. |
| `should handle alternating contexts at high frequency` | 126 | Make stronger | `keeps two variables apart in 1000 alternating runs`. The old test examined only the count. |
| `should not have race conditions in context isolation` | 153 | Remove | Same check as `gives each of 1000 concurrent runs its own context` (suite 05). |
| `should handle race between context set and get` | 183 | Make stronger | `gives the correct value to reads between awaits of 100 interleaved runs`. All old reads occurred before the first await. |
| `should handle race in Promise.race with contexts` | 203 | Remove | Same check as `gives the winner of Promise.race its own context` (suite 03). |
| `should handle all operations competing for completion` | 235 | Remove | Same check as `gives each of 1000 concurrent runs its own context` (suite 05). |
| `should handle wave pattern of operations` | 263 | Move | `gives each operation of ten waves of 100 operations its own context` |
| `should handle continuous context creation and destruction` | 294 | Remove | It used a limit on the wall clock. Same check as `gives the correct value in each of 1000 sequential async runs` (suite 14). |
| `should handle mixed short and long-lived contexts` | 312 | Make stronger | `gives each of 500 short and 50 long concurrent runs its own context`. The old test examined only the counts. |
| `should handle nested Promise.all at multiple levels` | 350 | Make stronger | `gives each node of three levels of nested Promise.all its own context` |
| `should handle pyramid pattern of concurrency` | 388 | Make stronger | `gives the leaves of a pyramid the context of their parent level, 120 leaves in total`. The old test accepted any count above 0. |
