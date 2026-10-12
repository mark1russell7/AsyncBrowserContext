# Change history

## 0.3.0

This version changes some behaviors, so it is a minor version. The first section gives the changes that can affect existing code.

### Changes that can affect existing code

- `Snapshot.wrap()` gives the wrapper the name `wrapped` and the name of the function, for example `wrapped save`, as the TC39 draft specifies. In the browser, `AsyncLocalStorage.bind()` gives the same name. Before, the wrapper had the name of the function.
- `Variable` and `Snapshot` have the `Symbol.toStringTag` of the TC39 draft. `Object.prototype.toString` gives `[object AsyncContext.Variable]` and `[object AsyncContext.Snapshot]`. Before, it gave `[object Object]`.
- On Node.js, `Variable.run()` starts the function with the `this` value `undefined`, as the browser class and the TC39 draft do. Before, the native `run()` gave `null`.
- A callback that a hook method schedules does not start the callback hooks, also when it operates later. Examples are a timer, a `then` callback and an event listener that a hook registers. Thus a hook cannot start itself without end. Before, only a callback that started synchronously in a hook did not start the hooks.
- `addEventListener()` and `removeEventListener()` read the options as the DOM does. `null` and `undefined` give the default options, and another primitive value is the capture flag. `capture` and `once` use `ToBoolean`. Before, the patch read only `true` and `capture: true`. With another value, for example `{ capture: 1 }`, a second registration or a removal with `true` did not find the listener.
- The patched functions have the form of native methods. They have no `prototype` property, they are not constructors, and they give the native function the same number of arguments. Thus `setTimeout()` without arguments and `addEventListener(type)` without a listener throw the native `TypeError`. Before, they did not throw.
- OpenTelemetry: `bind(context, emitter)` and `bind(context, eventTarget)` patch the methods that add and remove listeners, as the context managers of OpenTelemetry do. Each listener that the program adds later operates with the context. Before, `bind()` gave such an object without a change. `bind(undefined, fn)` uses the active context. Before, it used the root context.
- The Babel preset imports all four async generator helpers from the runtime: `asyncGenerator`, `OverloadYield`, `awaitAsyncGenerator` and `asyncGeneratorDelegate`. A module that the `runtime` option names must export them. Use the preset and the runtime of the same version. Before, Babel put `awaitAsyncGenerator` and `asyncGeneratorDelegate` into each module.
- The Babel preset has eight plugins. A new plugin moves static class fields and static blocks with async arrow functions into static private methods. Thus `this` and `super` stay correct. Before, `this` was `undefined` in such a function, and `super` gave a `SyntaxError`.
- The Babel preset changes `using` and `await using` declarations with `@babel/plugin-transform-explicit-resource-management`, a new dependency, before the async transform. This plugin operates with Babel 7.23.9 and later. Before, `await using` gave a `SyntaxError` in the generator of the transform.
- The Vite plugin reads a module without a static `import` or `export`, for example a worker, as an ES module. Only `.cjs` and `.cts` files, and files with CommonJS marks and no static `import` or `export`, can be scripts. Before, Babel read such a module as a script and added a `require()` of the runtime, which a browser does not have.
- The Vite plugin also transforms the JavaScript of Vue, Svelte, Astro and MDX components. It does not transform their styles. The `include` and `exclude` options also apply to these modules.
- `package.json` has `main`, `types` and `typesVersions`. Thus TypeScript with the `moduleResolution` `node10` finds the types of each entry. This setting is the default for `module: commonjs`. Before, TypeScript found no types, so a project can get new type errors.

### Changes

- On Node.js, all `Variable` objects share one native `AsyncLocalStorage`. Node.js 22 keeps each storage that operated in a global list of `async_hooks`, and each new async resource examines that list. Thus a `Variable` for each request made each async operation slower. `AsyncLocalStorage` is the native class, as before.
- On Node.js, `Snapshot`, `Snapshot.wrap()` and the generator drivers of the transform (`bindGenerator` and `asyncGenerator`) record the context with an `AsyncResource`. Before, they used `AsyncLocalStorage.snapshot()`. The hooks of `async_hooks` see these resources with the types `AsyncContext.Snapshot` and `async-browser-context:generator`.
- `addCallbackHook()` writes a warning on the console one time when a copy of version 0.1 installed some patches first. The callbacks of those patches do not start the hooks.
- The steps of an async generator after an `await` give the name of the async generator to the callback hooks (`callback.name`), as async functions do.

### Corrections

- The patch of `Promise.prototype.then` starts the `then` that it replaces, as the other patches do. Thus a patch of `then` that another tool installed before the library stays in effect. Before, the patch started the native `then`.
- The preset does not change the native async generator of the runtime, also when a bundler applies the preset to `node_modules`. The plugin of Babel for async generators changes async generators and `for await` loops in its own traversal. The preset makes that traversal skip the functions with the directive of the runtime too. Before, the runtime then imported itself, and its async generator objects did not inherit `Symbol.asyncDispose`.
- Events:
  - After a top-level `enterWith()`, an event that the browser dispatches gives the registration context to each listener (rule C13). Before, each listener got the default store of the `enterWith()`. The event patch handles the default store as the root context.
  - A listener with a `signal` does not stay in memory. The map of the listeners is weak, and the abort listener of a registration keeps only weak references. Before, a signal that lived long kept the target, the listener and its context in memory, also on Node.js.
  - A removed registration and a `once` listener that operated remove their abort listener. A failed native `addEventListener()` keeps no registration.
  - A registration with an aborted signal, or a `once` listener that operated, gets a new registration at the next add.
  - The `on...` getters give the handler also from another property that reflects it, for example `window.onload` for the handler of `body.onload`.
  - `MediaQueryList.addListener()` and `removeListener()` accept listener objects with a `handleEvent` method, as the native methods do.
- Streams, and the options of `startViewTransition()` and `NavigateEvent.intercept()`: the patch gives the browser a Proxy in place of a copy of the object. Thus frozen objects, getters, private fields and inherited members operate. The Proxy also answers the `in` operator, which the streams of WebKit use.
- `Element.startViewTransition()` and the `precommitHandler` of `NavigateEvent.intercept()` keep the context.
- `Array.fromAsync()` wraps only its map function. Before, it also wrapped `items` and `thisArg` when they were functions.
- Callback hooks: an error of a getter of a hook method, or an error of `reportError()`, does not stop the callback.
- The wrappers start each callback with `Reflect.apply`. Thus a callback with its own `call` or `apply` property operates.
- A frame of the same variable replaces its parent. Thus many uses of `enterWith()` in one context do not make a long chain, and do not keep old stores in memory.
- Node.js: the probe of the native options also examines `exit()`, and it disables itself after the probe. With `--no-async-context-frame` on Node.js 24, `exit()` thus gives `undefined`, as in the browser.
- Babel preset:
  - A generator parameter that the body declares again with `var` keeps its value.
  - The generator of a Babel helper in a compiled dependency gets a binding (rule C5). The generators that `coroutine` and `asyncGenerator` operate do not get a second binding.
  - A generator declaration in a block of a script stays in the block.
  - The plugin of the async generator helpers sets its helpers in `Program` enter. Thus `@babel/plugin-transform-runtime` and the presets earlier in the list do not break the markers of the driver.
  - The traversals of the preset skip the functions with the directive of the runtime. The preset finds the runtime functions also in CommonJS output. A file counts as changed only when the preset changes it.
  - TypeScript wrappers, for example `as` and `satisfies`, and accessor fields keep the name of an async function for the hooks. A function that Babel gives no named wrapper, for example in a class field, keeps its name and its length.
- Vite plugin: no input source map, because the map of Vite describes the code that the plugin gets. The option `compact: false` keeps the format of large modules. One presets array for all modules lets the configuration cache of Babel operate.

### Performance

- Node.js: an `AsyncResource` records the context in 30 to 40 ns, and `AsyncLocalStorage.snapshot()` takes approximately 3 µs. The drivers record the context after each step. Thus a step of `bindGenerator` takes 0.11 µs in place of 2.3 µs, and a step of `asyncGenerator` 0.45 µs in place of 2.6 µs (Node.js 24).
- `pnpm bench:size` measures a minified bundle with all exports of the runtime. The runtime is 17.5 kB minified, 6.0 kB with gzip and 5.4 kB with brotli. The earlier values (19.0, 5.9 and 5.1 kB) came from a library build that kept the white space, and that did not contain `asyncGenerator` and `OverloadYield`.
- `pnpm bench:browsers` repeats each workload until at least 100 ms have passed, and divides the time by the repetitions. Before, one pair of `performance.now()` calls measured 50,000 steps, with a resolution of 0.1 ms to 1 ms.

### Tests

- New tests for the cases that the review found without a test. An `await` in a `finally` block keeps the context after a `return` and after a `throw` (rule C3). A string callback of `setTimeout` goes to the native function as it is (rule C6). Two copies of the library read and keep the variables of each other (rule C10). A capture listener and a listener without capture stay apart (rule C13).
- Memory tests for event listeners: after `removeEventListener()`, after a `once` listener operated, and with a signal that lives long. The memory tests fail without `--expose-gc`.
- Browser tests for each correction of the events, the streams and the callback APIs.
- CI also starts the Node.js tests on Node.js 22.18.0 and 24.11.0, the minimum versions, and starts the tests of the STE linter (`pnpm test:ste-lint`).

### Documentation

- The documents tell the eight plugins of the preset and the six exports of the runtime.
- New limits: a transformed generator function is a plain function for libraries that examine it, and a top-level `enterWith()` stays as a default store. A minifier can remove the directive of the runtime.
- The webpack examples add `@babel/preset-typescript` and `@babel/preset-react` for TypeScript and JSX files.
- The pages tell where the tests examine each rule and each boundary.

## 0.2.4

### Corrections

- `yield*` in a transformed async generator gave a promise in place of each object of the delegate. Version 0.2.3 had this error. The driver does not change the result of a `yield*` step at this time.
- Transformed code can await a thenable that is not a native promise, or give it as the result of a function. Its `then` method operates in the context of the body at this time. Before, only the read of `then` had the context, and the call had the root context. A query builder that starts its request in `then`, for example of supabase-js, gets the context, as on Node.js.
- An `enterWith()` in the synchronous part of a transformed async function stays for the caller, as on Node.js.
- An async generator of transformed code is closer to a native async generator:
  - `return(value)` at a `yield` awaits the value before the `finally` blocks. A rejection goes into the body at the `yield`.
  - `next()` of a complete generator settles before a later microtask.
  - Its methods give a rejected promise for an object that is not an async generator.
  - The object inherits from `%AsyncIteratorPrototype%`, so `Symbol.asyncDispose` and the async iterator helpers are available, and its methods are not enumerable.
- An error of the `then` getter of an awaited object goes into the body at the `await`.

## 0.2.3

### Corrections

- Async generators are faster. The runtime has a driver for async generators (`asyncGenerator`), which continues each step with a native `await`. Before, the helper of Babel was in each module, and each step was a `then` callback. A `for await` loop over an async generator with 50,000 steps took 11.2 ms in Chromium, 560 ms in Firefox and 16 ms in WebKit. It takes 9.0 ms, 370 ms and 13 ms at this time (`pnpm bench:browsers`).
- The modules with async generators are smaller, because they do not contain the async generator helper of Babel. In the size measurement, idb changed from +31.9 to +8.1 percent and openai from +9.1 to +7.5 percent.
- The preset does not wrap async generators with `bindGenerator`. The driver keeps the context of the creation itself (rule C5).

### Tests

- The tests examine the behavior of async generators: the queue of requests, `throw()`, `return()` with `await` and `yield` in a `finally` block, and `yield*`. The project without a transform starts the same tests on native async generators.

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
