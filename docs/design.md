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

The context store is one object on `globalThis`, with a `Symbol.for` key. It contains the current frame. When a page has two copies of the library, the two copies use the same store.

### Steps

The runtime sets a frame only for one step of code that it controls. After the step, it sets the previous frame again. These are the steps:

- The callback of a `then` call, a timer, an event listener, an observer or another patched API.
- One step of a transformed async function, from its start or from one `await` to the next.
- One step of a transformed generator, from one `yield` to the next.
- The function of `run()` or `snapshot.run()`.

Thus, between tasks, the current frame is the root frame. Code that the library does not control gets the root context, not the context of a different operation. Where application code gives a callback to such code, `AsyncLocalStorage.bind()` or a snapshot keeps the context (refer to the page "Boundaries" of the website).

### The transform

The Babel preset has three plugins:

1. A plugin of this library changes each generator function. The function gives `bindGenerator(generator)`. The generator then keeps the context of its creation, as the TC39 draft specifies.
2. `@babel/plugin-transform-async-generator-functions` changes async generators and `for await` loops.
3. `@babel/plugin-transform-async-to-generator` changes each async function into a generator. The `coroutine` function of the runtime operates the generator. Before each step, `coroutine` sets the frame of the call. After the step, it sets the previous frame again.

The Babel transforms already handle destructuring, `var`, labels, closures, sync iterables and the `return()` call on `break`. Thus, the library has no custom code that changes `await` expressions.

The Vite plugin applies the preset to the modules of the application and of its dependencies.

### The patches

The runtime patches only `Promise.prototype.then` of the `Promise` API. `catch`, `finally` and the combinators use `then`, so they also get the context of the registration. The runtime does not replace the `Promise` constructor.

The other patches wrap the callbacks of timers, events, observers, streams and other callback APIs. Each wrapper records the current frame when the code registers the callback. An event listener is a special case (rule C13): when code with a context dispatches the event synchronously, the listener gets the context of that code. When the browser or code in the root context dispatches the event, the listener gets the context of its registration.

Each patch keeps the name, the length and the other properties of the native function. `Function.prototype.toString` gives the source text of the original function.

The patch of the `on...` properties reads only the globals in `src/patches/handler-interfaces.ts`. Browsers make each interface object when code reads it for the first time. Version 0.1 read all globals of the page, approximately 1,000, and this took 15 to 20 ms when the page loaded. The list has the 138 interfaces of Chromium, Firefox, WebKit, Safari and the worker scopes that have `on...` properties. A test in `test/browser/c13-events.test.ts` reads all globals in each browser of the tests, and fails for a property without the patch.

### Callback hooks

Each wrapper has the name `asyncBrowserContextWrapper`. Browsers show the static name of the function that they start, for example in the Long Animation Frames API. A change of the `name` property does not change this name. Thus, the browser cannot show the name of the callback, and `addCallbackHook()` gives the callback to a tool.

The store keeps the hooks in an array, and each change makes a new array. Each wrapper reads this property after it sets the frame. Without hooks, the property is `undefined`, and the wrapper starts the callback immediately. With hooks, the wrapper starts `before`, the callback and `after`. The coroutine does the same for each step after an `await`.

The hooks get the generator function of an async function, because the coroutine starts it. Babel gives no name to this function. Thus, the preset records the name of each async function before the async transform, and adds it as the second argument of `coroutine`. The coroutine sets the name on the generator function when a hook operates for the first time.

A hook error goes to `reportError()`, because a hook must not stop the callback. While a hook operates, callbacks do not start the hooks. Thus, a hook that dispatches an event cannot start itself again without end.

### Node.js

On Node.js, the `node` export condition selects an entry that uses the native `AsyncLocalStorage`. It needs no transform and no patch. The runtime of the transform on Node.js has a plain `coroutine` and a `bindGenerator` that uses `AsyncLocalStorage.snapshot()`.

## Relation to other designs

| Design | How it keeps the context through `await` | Difference |
| --- | --- | --- |
| TC39 AsyncContext (Stage 2, specification draft of 2026-06-16) | The engine records the context in each promise reaction and generator. | This library follows the same rules. When browsers add the proposal, the transform is not necessary. |
| Node.js `AsyncLocalStorage` | The engine keeps the context through promises natively. | The browser class of this library has the same API and the same behavior. |
| zone.js | It patches the browser APIs. Angular compiles `await` into generators so that zone.js can see it. | This library uses the same method for `await`, but with the rules of the TC39 draft. Do not use the two together. |
