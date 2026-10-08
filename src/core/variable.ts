import { createFrame, findValue, NOT_FOUND, store } from "./store.js";

/** The options of a `Variable`. */
export interface VariableOptions<T> {
    /** The name of the variable. It is for debug tools only. The default is the empty string. */
    readonly name? : string | undefined;
    /** The value that `get()` gives when no context sets a value. */
    readonly defaultValue? : T | undefined;
}

/**
 * A value that is different in each context. This class is the
 * `AsyncContext.Variable` of the TC39 AsyncContext proposal.
 *
 * `run(value, fn)` starts `fn` in a new context in which `get()` gives
 * `value`. The code that `fn` starts later, for example a `then` callback or
 * the rest of an async function after `await`, gets the same context.
 *
 * @example
 * ```ts
 * const requestId = new Variable<string>({ name : "requestId" });
 * await requestId.run("r-1", async () => {
 *     await fetch("/data");
 *     console.log(requestId.get()); // "r-1"
 * });
 * ```
 */
export class Variable<T> {
    readonly #name : string;
    readonly #defaultValue : T | undefined;

    constructor(options : VariableOptions<T> = {}) {
        this.#name = options.name === undefined ? "" : String(options.name);
        this.#defaultValue = options.defaultValue;
    }

    /** The name of the variable. */
    get name() : string {
        return this.#name;
    }

    /**
     * This method gives the value of this variable in the current context. If
     * no context sets a value, the method gives the default value.
     */
    get() : T | undefined {
        const value = findValue(store.current, this);
        return value === NOT_FOUND ? this.#defaultValue : value as T;
    }

    /**
     * This method starts `fn` with `args` in a new context in which `get()`
     * gives `value`. After `fn` returns or throws, the previous context is
     * current again. The method gives the result of `fn`.
     */
    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        const previous = store.current;
        store.current = createFrame(previous, this, value);
        try {
            return fn(...args);
        } finally {
            store.current = previous;
        }
    }
}

/**
 * This function makes a new current frame in which `variable` has `value`.
 * The frame stays current until the code that controls the current step sets
 * the previous frame again. `AsyncLocalStorage.enterWith` uses this function.
 *
 * @internal
 */
export function enterValue<T>(variable : Variable<T>, value : T) : void {
    store.current = createFrame(store.current, variable, value);
}
