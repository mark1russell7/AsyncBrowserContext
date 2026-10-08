import { createFrame, store, type Frame } from "./store.js";

/** The options of a `Variable`. */
export interface VariableOptions<T> {
    /** The name of the variable. It is for debug tools only. The default is the empty string. */
    readonly name? : string | undefined;
    /** The value that `get()` gives when no context sets a value. */
    readonly defaultValue? : T | undefined;
}

let enterValueImplementation : <T>(variable : Variable<T>, value : T) => void;

/**
 * A value that is different in each context. This class is the
 * `AsyncContext.Variable` of the TC39 AsyncContext proposal.
 *
 * `run(value, fn)` runs `fn` in a new context in which `get()` gives `value`.
 * Code that `fn` starts later, for example a `then` callback or the rest of an
 * async function after `await`, gets the same context.
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
    /** The value of this variable in each frame that sets it, or that got it from a parent frame. */
    readonly #values : WeakMap<Frame, T> = new WeakMap();
    /** The frames in which this variable has no value. */
    readonly #absent : WeakSet<Frame> = new WeakSet();

    static {
        enterValueImplementation = <T>(variable : Variable<T>, value : T) : void => {
            const frame = createFrame(store.current);
            variable.#values.set(frame, value);
            store.current = frame;
        };
    }

    constructor(options : VariableOptions<T> = {}) {
        this.#name = options.name === undefined ? "" : String(options.name);
        this.#defaultValue = options.defaultValue;
    }

    /** The name of the variable. */
    get name() : string {
        return this.#name;
    }

    /**
     * Gives the value of this variable in the current context. If no context
     * sets a value, the method gives the default value.
     */
    get() : T | undefined {
        const current = store.current;
        const value = this.#values.get(current);
        if (value !== undefined || this.#values.has(current)) {
            return value;
        }
        if (this.#absent.has(current)) {
            return this.#defaultValue;
        }
        for (let frame = current.parent; frame !== null; frame = frame.parent) {
            if (this.#values.has(frame)) {
                const found = this.#values.get(frame) as T;
                // Frames do not change, so the result for the current frame does not change
                this.#values.set(current, found);
                return found;
            }
            if (this.#absent.has(frame)) {
                break;
            }
        }
        this.#absent.add(current);
        return this.#defaultValue;
    }

    /**
     * Runs `fn` with `args` in a new context in which `get()` gives `value`.
     * After `fn` returns or throws, the previous context is current again.
     * The method gives the result of `fn`.
     */
    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        const previous = store.current;
        const frame = createFrame(previous);
        this.#values.set(frame, value);
        store.current = frame;
        try {
            return fn(...args);
        } finally {
            store.current = previous;
        }
    }
}

/**
 * Makes a new current frame in which `variable` has `value`. The frame stays
 * current until the code that controls the current step sets the previous
 * frame again. This function is the base of `AsyncLocalStorage.enterWith`.
 *
 * @internal
 */
export function enterValue<T>(variable : Variable<T>, value : T) : void {
    enterValueImplementation(variable, value);
}
