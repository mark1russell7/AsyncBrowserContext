# Change history

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
