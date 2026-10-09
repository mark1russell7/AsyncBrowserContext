# async-browser-context

[![npm version](https://img.shields.io/npm/v/async-browser-context)](https://www.npmjs.com/package/async-browser-context)
[![CI](https://github.com/mark1russell7/AsyncBrowserContext/actions/workflows/ci.yml/badge.svg)](https://github.com/mark1russell7/AsyncBrowserContext/actions/workflows/ci.yml)
[![Mutation score: 98%](https://img.shields.io/badge/mutation%20score-98%25-brightgreen)](docs/testing.md)
[![Types: included](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/async-browser-context)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

`async-browser-context` gives the `AsyncLocalStorage` class of Node.js and the TC39 `AsyncContext` API to browsers. A value that you set for one operation stays available in all the asynchronous code of that operation. This includes the code after `await`, `then` callbacks, timers, event listeners and generators.

```ts
import { AsyncLocalStorage } from "async-browser-context";

const request = new AsyncLocalStorage<{ id : string }>();

await request.run({ id : "r-1" }, async () => {
    const response = await fetch("/data");
    log(`loaded ${response.status}`);
});

function log(message : string) : void {
    console.log(`[${request.getStore()?.id ?? "none"}] ${message}`); // [r-1] loaded 200
}
```

The documentation website has guides, the API reference and interactive diagrams: <https://mark1russell7.github.io/AsyncBrowserContext/>. Its [context debugger](https://mark1russell7.github.io/AsyncBrowserContext/explore/debugger) starts code with the real library and shows each step. In the [playground](https://mark1russell7.github.io/AsyncBrowserContext/explore/playground), you can start your own code.

[![The context debugger: two requests at the same time. Each step shows the line that runs, the frame tree of the contexts and the console.](https://raw.githubusercontent.com/mark1russell7/AsyncBrowserContext/main/docs/images/debugger.gif)](https://mark1russell7.github.io/AsyncBrowserContext/explore/debugger)

## How the library operates

Browsers do not have `AsyncLocalStorage`. A native `await` does not use code that a library can change, so a library alone cannot keep a value through `await`. This library has two parts:

1. **A runtime.** It keeps the current context. It patches `Promise.prototype.then`, the timers, the event listeners, the observers and other callback APIs. Thus, each callback gets the context of the code that registered it.
2. **A Babel preset and a Vite plugin.** They change each async function into a generator that the runtime operates. Before each step of the function, the runtime sets the context of the function. After the step, the runtime sets the previous context again.

On Node.js, the package uses the native `AsyncLocalStorage` of `node:async_hooks`. No transform and no patch is necessary on Node.js.

## Compared with other tools

| Tool | Where it operates | Context after a native `await` | API |
| --- | --- | --- | --- |
| `AsyncLocalStorage` of Node.js | Node.js and other server runtimes | Yes | `AsyncLocalStorage` |
| TC39 `AsyncContext` proposal | No browser has it at this time (Stage 2) | Yes, when browsers have it | `AsyncContext.Variable`, `AsyncContext.Snapshot` |
| zone.js | Browsers | No. A compiler must change async functions before zone.js can see them. | `Zone` |
| `async-browser-context` | Browsers and Node.js | Yes, through the Babel preset or the Vite plugin | `AsyncLocalStorage` and `AsyncContext` |

Thus, code that uses `AsyncLocalStorage` on the server can use the same API in the browser. The `AsyncContext` API of the library is the API of the proposal. When browsers have `AsyncContext`, a change to the native API is small: change the import.

## Install

```sh
npm install async-browser-context
```

The package needs Node.js 22.18 or later, or 24.11 or later, for the build tools. The runtime operates in the current versions of Chrome, Edge, Firefox and Safari.

## Set up the transform

> **CAUTION:** Transform all the code that awaits in a context, also the code in `node_modules`. In code that the transform does not change, the browser runtime cannot set the context after `await`. That code gets the root context: `getStore()` gives `undefined`. It does not get the context of a different operation at any time.

### Vite

1. Add the plugin to `vite.config.ts`:

   ```ts
   import { defineConfig } from "vite";
   import { asyncContext } from "async-browser-context/vite";

   export default defineConfig({
       plugins : [asyncContext()],
   });
   ```

2. Build or start the application as usual.

The plugin transforms the modules of the application and of its dependencies, also in the dev server. It operates after the other plugins, so it gets JavaScript after TypeScript and JSX are compiled. The plugin does not transform the modules of server-side rendering, because Node.js has the native `AsyncLocalStorage`.

| Option | Default | Function |
| --- | --- | --- |
| `include` | All JavaScript and TypeScript modules | A regular expression or a function that selects the modules to transform. |
| `exclude` | None | A regular expression or a function that selects the modules not to transform. |
| `runtime` | `async-browser-context/runtime` | The module that the transformed code imports. |
| `ssr` | `false` | Set `true` to also transform the modules of server-side rendering, for example for Vitest in Node.js. |

### Babel

1. Add the preset to the Babel configuration. Put it last in the `presets` list, because Babel uses the presets in reverse order:

   ```json
   {
       "presets": ["@babel/preset-env", "async-browser-context/babel-preset"]
   }
   ```

2. Make sure that Babel transforms the dependencies too. With webpack, do not exclude `node_modules` from `babel-loader`.

The preset operates with Babel 7.22 and later, and with Babel 8.

### Node.js

Do not set up a transform. The `node` export condition selects the Node.js entry, which uses the native `AsyncLocalStorage`.

## Use the API

The package gives two equivalent APIs.

**`AsyncLocalStorage`**, the class of Node.js:

```ts
import { AsyncLocalStorage } from "async-browser-context";

const storage = new AsyncLocalStorage<string>({ defaultValue : "none" });
storage.run("value", () => storage.getStore()); // "value"
storage.getStore(); // "none"
```

The class has `getStore()`, `run()`, `exit()`, `enterWith()`, `disable()`, the static `bind()` and `snapshot()`, and the `name` and `defaultValue` options of Node.js 24.

**`AsyncContext.Variable` and `AsyncContext.Snapshot`**, the API of the TC39 proposal:

```ts
import { AsyncContext } from "async-browser-context";

const userId = new AsyncContext.Variable<string>({ name : "userId" });
const snapshot = userId.run("u-1", () => new AsyncContext.Snapshot());

button.addEventListener("click", AsyncContext.Snapshot.wrap(() => {
    console.log(userId.get());
}));
snapshot.run(() => userId.get()); // "u-1"
```

The package also exports `Variable`, `Snapshot`, and the other names `AsyncVariable` and `AsyncSnapshot`.

## Entry points

| Import | Function |
| --- | --- |
| `async-browser-context` | The API. The `node` export condition selects the Node.js entry. Other environments get the browser entry. |
| `async-browser-context/browser` | The browser entry, also on Node.js. |
| `async-browser-context/runtime` | The runtime functions that the transformed code imports. |
| `async-browser-context/browser/runtime` | The browser runtime functions, also on Node.js. Use it as the `runtime` option together with `async-browser-context/browser`. |
| `async-browser-context/vite` | The Vite plugin. |
| `async-browser-context/babel-preset` | The Babel preset. |

## Context rules

The tests examine each rule on the browser runtime, on the Node.js runtime and in Chromium, Firefox and WebKit.

| Rule | The library keeps this rule |
| --- | --- |
| C1 | Outside a context, `get()` gives the default value. Between tasks, the current context is the root context. |
| C2 | While `run(value, fn)` starts `fn`, `get()` gives `value`. After `fn`, the previous context is current again. |
| C3 | An async function keeps the context of its call after each `await`, also in the same expression and after a rejection. |
| C4 | A `then`, `catch` or `finally` callback gets the context of the `then`, `catch` or `finally` call. |
| C5 | A generator body gets the context of the call that made the generator. After each step, the context of the caller is current again. |
| C6 | A timer callback gets the context of the call that scheduled it. |
| C7 | Code that the transform does not change does not get the context of a different operation at any time. |
| C8 | `snapshot.run()` and `Snapshot.wrap()` start functions in the recorded context. |
| C9 | Only code that has a `Variable` can read its values. The library puts no values on `globalThis`. |
| C10 | Two copies of the library on one page use one context store. |
| C11 | The library does not replace the `Promise` constructor. `Promise` subclasses operate as without the library. |
| C12 | The library does not keep promises or values in memory after the program has no reference to them. |
| C13 | An event listener gets the context of the code that dispatches the event. When the browser dispatches the event, the listener gets the context of the `addEventListener()` call or of the assignment to the `on...` property. |

## Patched APIs

> **CAUTION:** Import `async-browser-context` before all other modules in the entry file of the application. The library patches global functions when it loads. Code that keeps a reference to `setTimeout` or to another patched function before the library loads does not get the context.

| Group | APIs |
| --- | --- |
| Promises | `Promise.prototype.then`, thus also `catch`, `finally` and the combinators |
| Timers | `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask`, `requestAnimationFrame`, `requestIdleCallback`, `scheduler.postTask`, `requestVideoFrameCallback`, `XRSession.requestAnimationFrame` |
| Events | `addEventListener`, `removeEventListener`, all `on...` properties, `MediaQueryList.addListener` |
| Observers | `MutationObserver`, `ResizeObserver`, `IntersectionObserver`, `PerformanceObserver`, `ReportingObserver`, `PressureObserver`, `FinalizationRegistry` |
| Streams | The methods of the underlying objects of `ReadableStream`, `WritableStream` and `TransformStream` |
| Callback APIs | `navigator.locks.request`, `HTMLCanvasElement.toBlob`, `Array.fromAsync`, geolocation, `DataTransferItem.getAsString`, the APIs of file system entries, `decodeAudioData`, `MediaSession.setActionHandler`, `Notification.requestPermission`, the callbacks of `RTCPeerConnection`, `startViewTransition`, `NavigateEvent.intercept` |

The patches keep the names, the lengths and the source text of the native functions. `Function.prototype.toString` gives the source text of the original function.

## Limits

- **Code that the transform does not change.** On the browser runtime, this code gets the root context after `await` (rule C7). Use the Vite plugin, which transforms the dependencies, or use `Snapshot.wrap()` for a callback.
- **Other patches of `Promise.prototype.then`.** Do not use the library together with zone.js or with another library that patches `then`.
- **Transformed generator functions.** A transformed generator function is an ordinary function that gives a generator. `fn.prototype` and `instanceof fn` do not operate as for a native generator function. The generator objects operate as native generator objects.
- **Stack traces.** In transformed code, a stack trace shows the generator and the `coroutine` function of the runtime.
- **Other realms.** The context does not go to web workers, iframes or code in `eval()` and `new Function()`.

## Performance

These results are from `pnpm bench`: the mean time of each scenario, on Node.js 25.2.1 and Windows 11. Each case operates in its own process. The values are the median of 5 rounds.

| Scenario | Plain JavaScript | Library | Factor |
| --- | --- | --- | --- |
| 10,000 awaits in one async function | 0.26 ms | 0.40 ms | 1.56 |
| 10,000 calls of an async function | 0.61 ms | 1.22 ms | 1.99 |
| A chain of 10,000 `then` calls | 0.19 ms | 0.33 ms | 1.77 |
| 1,000 tasks with 10 awaits each | 0.39 ms | 0.68 ms | 1.75 |
| 1,000 request handlers in 1,000 contexts | 0.31 ms | 0.60 ms | 1.90 |
| 100,000 reads with `get()`, 5 contexts deep | 0.105 ms | 0.39 ms | 3.74 |

One read with `get()` takes approximately 4 ns. The [documentation website](https://mark1russell7.github.io/AsyncBrowserContext/) shows the full results.

## Tests

| Command | Function |
| --- | --- |
| `pnpm test` | All test projects: unit tests, the rules on the browser runtime and on the Node.js runtime, memory tests, and the browser tests |
| `pnpm test:node` | The tests in Node.js only |
| `pnpm test:browser` | The tests in Chromium, Firefox and WebKit |
| `pnpm smoke` | Packs the package, installs it in a new Vite application, and examines the application in Chromium |
| `pnpm mutation` | Mutation testing with Stryker |
| `pnpm bench` | The benchmarks |
| `pnpm lint:ste` | The STE linter of the documentation and the TSDoc comments |

Set `BROWSERS=chromium,firefox,webkit` to select the browsers. Playwright WebKit does not start on all Windows computers, so the default on Windows is Chromium and Firefox. `docs/testing.md` tells more.

## Documentation

- [Documentation website](https://mark1russell7.github.io/AsyncBrowserContext/)
- [Design](docs/design.md)
- [Testing](docs/testing.md)
- [Performance](docs/performance.md)
- [Change history](CHANGELOG.md)

The documentation follows ASD-STE100 Simplified Technical English. `pnpm lint:ste` examines it.

## License

MIT
