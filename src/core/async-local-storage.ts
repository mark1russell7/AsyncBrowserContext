import { Snapshot } from "./snapshot.js";
import { enterValue, Variable } from "./variable.js";

/** The options of an `AsyncLocalStorage`. They are the same as the options of Node.js 24. */
export interface AsyncLocalStorageOptions<T> {
    /** The value that `getStore()` gives outside `run()`. */
    readonly defaultValue? : T | undefined;
    /** The name of the storage. It is for debug tools only. */
    readonly name? : string | undefined;
}

/**
 * The `AsyncLocalStorage` class of Node.js, for browsers. It has the same API
 * and the same behavior as the class of `node:async_hooks`. On Node.js, the
 * package gives the native class.
 *
 * @example
 * ```ts
 * const storage = new AsyncLocalStorage<{ requestId : string }>();
 * storage.run({ requestId : "r-1" }, async () => {
 *     await fetch("/data");
 *     console.log(storage.getStore()?.requestId); // "r-1"
 * });
 * ```
 */
export class AsyncLocalStorage<T> {
    readonly #variable : Variable<T>;
    #enabled = true;

    constructor(options : AsyncLocalStorageOptions<T> = {}) {
        this.#variable = new Variable<T>({ name : options.name, defaultValue : options.defaultValue });
    }

    /** The name of the storage. */
    get name() : string {
        return this.#variable.name;
    }

    /**
     * Gives the store of the current context. Outside `run()`, the method gives
     * the default value. After `disable()`, the method gives `undefined`.
     */
    getStore() : T | undefined {
        return this.#enabled ? this.#variable.get() : undefined;
    }

    /**
     * Runs `callback` with `args` in a new context in which `getStore()` gives
     * `store`. After the callback, the previous context is current again.
     */
    run<R, A extends unknown[]>(store : T, callback : (...args : A) => R, ...args : A) : R {
        this.#enabled = true;
        return this.#variable.run(store, callback, ...args);
    }

    /** Runs `callback` with `args` in a new context in which `getStore()` gives `undefined`. */
    exit<R, A extends unknown[]>(callback : (...args : A) => R, ...args : A) : R {
        return this.#variable.run(undefined as T, callback, ...args);
    }

    /**
     * Sets `store` for the rest of the current synchronous step, and for the
     * code that this step starts later. Prefer `run()`: `enterWith()` can also
     * change the store of the code that called the current function.
     */
    enterWith(store : T) : void {
        this.#enabled = true;
        enterValue(this.#variable, store);
    }

    /** Disables the storage. `getStore()` gives `undefined` until the next `run()` or `enterWith()`. */
    disable() : void {
        this.#enabled = false;
    }

    /** Records the current context and gives a wrapper of `fn` that runs in that context. */
    static bind<T, A extends unknown[], R>(fn : (this : T, ...args : A) => R) : (this : T, ...args : A) => R {
        return Snapshot.wrap(fn);
    }

    /** Records the current context and gives a function that runs a function in that context. */
    static snapshot() : <R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) => R {
        const snapshot = new Snapshot();
        return <R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) : R => snapshot.run(fn, ...args);
    }
}
