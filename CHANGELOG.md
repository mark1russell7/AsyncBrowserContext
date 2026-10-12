# Change history

## 0.2.2

### Corrections

- Transformed async functions are much faster in Firefox. The coroutine operates each async function with a native `await` in place of a `then` callback. In Firefox 157, 50,000 awaits of `null` took 292 ms and take 4 ms at this time. 50,000 awaits of promises took 228 ms and take 51 ms. Chromium and WebKit are also a little faster (`pnpm bench:browsers`).
- An error in a parameter default or in a parameter destructuring of a transformed async function rejects the promise, as with a native async function. Before, the call threw the error. The Node.js runtime has the same correction.
- The Babel preset does not change the runtime of the library, also when a bundler applies the preset to `node_modules`. The native async functions of the runtime have the directive `"async-browser-context runtime"`, and the preset skips them.

### Documentation

- In Firefox, a patch of `Promise.prototype.then` makes each `await` of a promise slower, also in code without the transform. The performance page tells the cost.
- The command `pnpm bench:browsers` measures `await` and `then` in Chromium, Firefox and WebKit.

## 0.2.1

### New functions

- The option `names` of the Babel preset and of the Vite plugin. With `names: false`, the preset does not give the names of the async functions to `coroutine`. The code is then smaller by 0.1 to 1.6 percent.

### Documentation and tests

- The guide "Build tools" gives the setup for webpack, Rspack, Rollup, esbuild, Next.js and SWC. The test `pnpm test:bundlers` builds a page with each setup and examines it in Chromium.
- SWC and esbuild with the target ES2016 keep all rules except rule C5. Two new test projects start all rule tests with these compilers in place of the preset.
- The command `pnpm bench:size` measures the size of the runtime and the size that the transform adds to real npm packages. The runtime is 5.9 kB with gzip. The transform adds 2.9 percent to an example application.

## 0.2.0

### New functions

- `addCallbackHook(hook)` adds a hook. The library starts `hook.before` and `hook.after` around each callback of a patched API and each step of an async function after an `await`. The hook methods get the callback and its source, for example `"setTimeout"` or `"addEventListener:click"`, and operate in the context of the callback. Thus, a tool can find the operation and the function of a long task in all browsers. On Node.js, the function does nothing.
- The Babel preset gives the name of each async function to `coroutine`. The callback hooks show this name for the steps after an `await`.

### Changes

- Each wrapper of the library has the name `asyncBrowserContextWrapper`. Before, the wrappers had the name `boundToFrame` or no name. Stack traces, profilers and the Long Animation Frames API show this name between the browser and the callback.
- The event patch reads only the 138 interfaces that have `on...` properties. Before, it read all globals of the page, approximately 1,000. For each global that code reads for the first time, the browser makes an interface object. Thus, the patches take less time when the page loads. The median changed from 18 to 8 ms in Chromium, from 22 to 8 ms in Firefox and from 16 to 7 ms in WebKit. A browser test makes sure that the list contains each interface with `on...` properties.
- The documents tell one more case of rule C13. When code in the root context dispatches an event, the listener gets the context of its registration.

## 0.1.1

This version changes only the documentation. The code is the same as in 0.1.0.

- The README describes the boundaries with code without the transform: the guarantee of rule C7, and the function that keeps the context at each boundary.

## 0.1.0

This version replaces all of the first design. `docs/remediation-plan.md` gives the reasons, and `docs/design.md` describes the new design.

### Breaking changes

- The package name is `async-browser-context`.
- The API is the TC39 AsyncContext API (`AsyncContext.Variable`, `AsyncContext.Snapshot`) and the `AsyncLocalStorage` class of Node.js. `AsyncVariable` and `AsyncSnapshot` are other names for `Variable` and `Snapshot`.
- `new Variable(options)` gets an options object with `name` and `defaultValue`.
- A `then` callback gets the context of the `then` call, not of the promise creation.
- A generator body gets the context of the call that made the generator.
- The Babel plugin is replaced by the Babel preset `async-browser-context/babel-preset`.
- `AsyncSnapshot.contexts`, `init()`, `__getAsyncContext` and `__setAsyncContext` are removed.

### New functions

- The Vite plugin `async-browser-context/vite`. It also transforms the dependencies.
- The Node.js entry, with the native `AsyncLocalStorage`.
- Patches of event listeners, `on...` properties, observers, streams and other callback APIs.
- The OpenTelemetry context manager `async-browser-context/opentelemetry`. It replaces the `ZoneContextManager`, which uses zone.js.

### Corrections

- After `await`, code does not get the context of a different operation.
- The context is correct in the same expression as `await`, and after a rejection.
- The transform operates with destructuring, `var`, labels, closures, sync iterables, top-level `for await`, and `break` in `for await`.
- `Promise` subclasses operate as without the library.
- A chain of `then` calls does not keep its promises in memory.
- Two copies of the library on one page use one context store.
