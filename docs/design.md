# Design

This document tells how `async-browser-context` keeps a context through asynchronous code in a browser. It also tells why the first design failed.

## The problem

A context is a set of values that belong to one operation, for example the ID of one request. Code that runs later for the same operation must get the same values. On Node.js, `AsyncLocalStorage` does this work. Browsers have no equivalent API.

A library can patch the functions that schedule callbacks, for example `setTimeout` and `Promise.prototype.then`. But a native `await` does not use a function that a library can patch. When an async function continues after `await`, no library code operates. Thus, a library alone cannot set the context after `await`.

## The first design and its errors

The first design (before 2026-10-08) kept the context in one global variable. A Babel plugin set the variable after each `await` statement. The review found five root causes of errors:

| ID | Error | Result |
| --- | --- | --- |
| RC1 | The runtime set the context when a function continued. It did not set the previous context again when the function stopped. | Other code got the context of a different operation. |
| RC2 | A `then` callback got the context of the promise creation. | Shared and cached promises gave incorrect values. |
| RC3 | Each promise kept a reference to its parent promise. | Memory use increased with each `then` call. |
| RC4 | The runtime replaced the `Promise` constructor. | `Promise` subclasses failed. |
| RC5 | The plugin changed each statement that contained `await`, with custom code. | The plugin stopped the build, or it changed the result of correct code. |

`remediation-plan.md` gives the evidence and the plan of the correction.

## The current design

### Frames

A frame identifies one context. Each `run()` call makes a frame that sets one variable to one value. The parent of the new frame is the current frame. The root frame has no parent and sets no value.

The frame keeps its variable and its value in private class fields. Code that gets a frame cannot read the value. `get()` starts at the current frame and goes to the parents until it finds a frame that sets the variable. Each frame remembers the result of its last search, so a second read in the same frame is fast.

When the current frame sets the same variable, the new frame replaces it. The parent of the new frame is then the parent of the current frame. A search gives the same values. Thus many uses of `enterWith()` in one context do not make a long chain.

The context store is one object on `globalThis`, with a `Symbol.for` key. It contains the current frame. When a page has two copies of the library, the two copies use the same store.

### Steps

The runtime sets a frame only for one step of code that it controls. After the step, it sets the previous frame again. These are the steps:

- The callback of a `then` call, a timer, an event listener, an observer or another patched API.
- One step of a transformed async function, from its start or from one `await` to the next.
- One step of a transformed generator, from one `yield` to the next.
- The function of `run()` or `snapshot.run()`.

Thus, between tasks, the current frame is the root frame. Code that the library does not control gets the root context, not the context of a different operation. Where application code gives a callback to such code, `AsyncLocalStorage.bind()` or a snapshot keeps the context (refer to the page "Boundaries" of the website).

`AsyncLocalStorage.enterWith()` makes a new frame current until the code that controls the step sets the previous frame again. The first step of an async function operates in the step of its caller. Thus an `enterWith()` of that step stays for the caller, as on Node.js.

An `enterWith()` outside all steps, for example at the top level of a module, stays current after the task. No code sets the root frame again, as on Node.js, so the store also stays after a top-level `await`. This store is then the default store of all code that the library does not control. The store records this frame (`store.idle`) in a microtask after each `enterWith()`, when no step operates. The event patch handles it as the root frame (rule C13).

### The transform

The Babel preset has eight plugins, in this order:

1. A plugin of this library skips the native async functions of the runtime. The directive `"async-browser-context runtime"` marks them.
2. A plugin of this library changes each sync generator function. The function gives `bindGenerator(generator)`. The generator then keeps the context of its creation, as the TC39 draft specifies.
3. A plugin of this library gives the name of each async function and each async generator to `coroutine` or `asyncGenerator`, for the callback hooks. The option `names: false` removes this plugin.
4. A plugin of this library moves each static class field and static block with an async arrow function into a static private method. The async transform keeps `this` and `super` of an arrow function in the nearest function, but it does not stop at a static member. The method has the `this` and the `super` of the static member.
5. A plugin of this library takes the four async generator helpers of the next plugins from the runtime. These are `asyncGenerator` in place of `wrapAsyncGenerator`, `OverloadYield`, `awaitAsyncGenerator` and `asyncGeneratorDelegate`. It sets the helpers in `Program` enter, so `@babel/plugin-transform-runtime` does not replace them.
6. `@babel/plugin-transform-explicit-resource-management` changes `using` and `await using` declarations. An `await using` declaration in a generator is a `SyntaxError`, so this plugin must operate before the async transform. The preset adds it only with Babel 7.23.9 and later.
7. `@babel/plugin-transform-async-generator-functions` changes async generators and `for await` loops.
8. `@babel/plugin-transform-async-to-generator` changes each async function into a generator. The `coroutine` function of the runtime operates the generator. Before each step, `coroutine` sets the frame of the call. After the step, it sets the previous frame again.

The runtime exports the six names that the output imports: `coroutine`, `bindGenerator`, `asyncGenerator`, `OverloadYield`, `awaitAsyncGenerator` and `asyncGeneratorDelegate`.

The coroutine is a native async function, which awaits the value of each step. Version 0.2.1 used a `then` callback for each step. In Firefox 157, a native `await` is much faster. 50,000 awaits of `null` took 292 ms with the `then` callbacks of version 0.2.1, and 4 ms with the native `await` of version 0.2.2. `performance.md` gives the current values.

The driver of the async generators (`asyncGenerator`) does the same for each async generator. It keeps the frame of the creation, and continues each step with a native `await`. It replaces the helper of Babel, which was in each module and continued each step in a `then` callback.

The runtime has native async functions, so the preset must not change it. If a bundler applied the preset to the runtime, the coroutine could operate itself without end. Thus, the first plugin skips each function with the directive, and the plugins with their own traversal skip it too. A comment is not sufficient: esbuild removes comments, for example in the dependency bundles of the Vite dev server. The Vite plugin also skips the files in the `dist` folder of the package by their path.

Terser and other minifiers can remove directives. Thus the preset must not get a copy of the runtime that a minifier changed, for example a dependency that bundles and minifies this library. Bundlers minify after the transform of each module, so the usual setups are correct.

The Babel transforms already handle destructuring, `var`, labels, closures, sync iterables and the `return()` call on `break`. Thus, the library has no custom code that changes `await` expressions.

The Vite plugin applies the preset to the modules of the application and of its dependencies. It also applies the preset to the JavaScript of Vue, Svelte, Astro and MDX components. Vite serves each module as an ES module. Thus the plugin gives Babel the source type "module". The exceptions are `.cjs` and `.cts` files, and files with CommonJS marks and no static `import` or `export`.

Other compilers can also change async functions into generators, for example SWC and esbuild with the target ES2016. Their helpers continue each step in a `then` callback, and the patch of `then` gives the callback the context of the step. Thus, all rules except rule C5 stay correct. These compilers do not bind generators, and they do not give the names of the async functions. The test projects `rules (browser runtime, SWC ES2016)` and `rules (browser runtime, esbuild ES2016)` examine this method.

### The patches

The runtime patches only `Promise.prototype.then` of the `Promise` API. `catch`, `finally` and the combinators use `then`, so they also get the context of the registration. The runtime does not replace the `Promise` constructor.

The other patches wrap the callbacks of timers, events, observers, streams and other callback APIs. Each wrapper records the current frame when the code registers the callback. An event listener is a special case (rule C13): when code with a context dispatches the event synchronously, the listener gets the context of that code. When the browser or code in the root context dispatches the event, the listener gets the context of its registration.

Each patch keeps the name, the length and the other properties of the native function. `Function.prototype.toString` gives the source text of the original function. Each replacement is a method, as the native function: it has no `prototype` property and it is not a constructor. It gives the native function the same number of arguments, so a call without a callback throws the native error.

The event patch reads the options of `addEventListener()` as the DOM does. It keeps one registration for each target, type, capture flag and listener, so a second registration of the same listener has no effect. The maps of the listeners are weak, and the abort listener of a `signal` keeps only weak references. Thus a signal that lives long does not keep the target, the listener or the context in memory.

The streams, `startViewTransition()` and `NavigateEvent.intercept()` get an object with callbacks. The patch gives the browser a Proxy of that object, which wraps only the callbacks. The other members come from the object, so frozen objects, getters, private fields and inherited members operate.

The patch of the `on...` properties reads only the globals in `src/patches/handler-interfaces.ts`. Browsers make each interface object when code reads it for the first time. Version 0.1 read all globals of the page, approximately 1,000. With this read, the patches took 16 to 22 ms when the page loaded, and with the list 7 to 8 ms (the medians in `CHANGELOG.md`, version 0.2.0). <!-- TODO(bench) --> The list has the 138 interfaces of Chromium, Firefox, WebKit, Safari and the worker scopes that have `on...` properties. A test in `test/browser/c13-events.test.ts` reads all globals in each browser of the tests, and fails for a property without the patch.

### Callback hooks

Each wrapper has the name `asyncBrowserContextWrapper`. Browsers show the static name of the function that they start, for example in the Long Animation Frames API. A change of the `name` property does not change this name. Thus, the browser cannot show the name of the callback, and `addCallbackHook()` gives the callback to a tool.

The store keeps the hooks in an array, and each change makes a new array. Each wrapper reads this property after it sets the frame. Without hooks, the property is `undefined`, and the wrapper starts the callback immediately. With hooks, the wrapper starts `before`, the callback and `after`. The coroutine does the same for each step after an `await`.

The hooks get the generator function of an async function, because the coroutine starts it. Babel gives no name to this function. Thus, the preset records the name of each async function and each async generator before the async transform. It adds the name as the second argument of `coroutine` or `asyncGenerator`. The driver sets the name on the generator function when a hook operates for the first time.

A hook error goes to `reportError()`, because a hook must not stop the callback. An error of a getter of a hook method, or of `reportError()` itself, also does not stop the callback. While a hook operates, callbacks do not start the hooks. A callback that a hook registers, for example a timer or an event listener, also does not start the hooks later. Thus, a hook cannot start itself again without end.

The patches of version 0.1 have no hooks. The store records the patches of the copies with hooks. When a copy of version 0.1 installed some patches first, `addCallbackHook()` writes a warning on the console one time.

### Node.js

On Node.js, the `node` export condition selects an entry that uses the native `AsyncLocalStorage`. It needs no patch. It needs the transform only for rule C5 of generators.

`AsyncLocalStorage` is the native class. All `Variable` objects share one native `AsyncLocalStorage`, and its store is a chain of the values of the context. Node.js 22 keeps each storage that operated in a global list of `async_hooks`, and each new async resource examines the list. Thus one storage for all variables keeps the async operations fast.

`Snapshot`, `Snapshot.wrap()` and the runtime of the transform record the context with an `AsyncResource`, and start the code with `runInAsyncScope()`. The runtime has a plain `coroutine`, and drivers of generators that record the context again after each step. `AsyncLocalStorage.snapshot()` records the same context, but it is approximately 100 times slower.

## Relation to other designs

| Design | How it keeps the context through `await` | Difference |
| --- | --- | --- |
| TC39 AsyncContext (Stage 2, specification draft of 2026-06-16) | The engine records the context in each promise reaction and generator. | This library follows the same rules. When browsers add the proposal, the transform is not necessary. |
| Node.js `AsyncLocalStorage` | The engine keeps the context through promises natively. | The browser class of this library has the same API and the same behavior. |
| zone.js | It patches the browser APIs. Angular compiles `await` into generators so that zone.js can see it. | This library uses the same method for `await`, but with the rules of the TC39 draft. Do not use the two together. |
