/**
 * The browser entry of `async-browser-context`. It gives the TC39
 * AsyncContext API (`AsyncContext.Variable` and `AsyncContext.Snapshot`) and
 * the `AsyncLocalStorage` class of Node.js. When it loads, it installs the
 * patches of the runtime.
 *
 * The context stays through `await` only in code that the Babel preset or the
 * Vite plugin transforms. On Node.js, the `node` export condition selects the
 * Node.js entry, which uses the native `AsyncLocalStorage`.
 *
 * @packageDocumentation
 */
import "./install.js";
import { Snapshot } from "./core/snapshot.js";
import { Variable } from "./core/variable.js";

export { AsyncLocalStorage, type AsyncLocalStorageOptions } from "./core/async-local-storage.js";
export { Snapshot } from "./core/snapshot.js";
export { Variable, type VariableOptions } from "./core/variable.js";

/** The namespace object of the TC39 AsyncContext proposal. */
export const AsyncContext : { readonly Variable : typeof Variable; readonly Snapshot : typeof Snapshot } = Object.freeze({ Variable, Snapshot });

/** Another name for `Variable`. */
export const AsyncVariable : typeof Variable = Variable;
/** Another name for `Variable`. */
export type AsyncVariable<T> = Variable<T>;
/** Another name for `Snapshot`. */
export const AsyncSnapshot : typeof Snapshot = Snapshot;
/** Another name for `Snapshot`. */
export type AsyncSnapshot = Snapshot;
