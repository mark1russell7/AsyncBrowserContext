import { store, type Frame } from "./store.js";

/**
 * A record of the current context. `run(fn)` runs `fn` in the recorded
 * context. This class is the `AsyncContext.Snapshot` of the TC39 AsyncContext
 * proposal.
 *
 * Use a snapshot for a callback that the library does not wrap, for example a
 * callback of a library that keeps its own queue.
 */
export class Snapshot {
    readonly #frame : Frame = store.current;

    /**
     * Runs `fn` with `args` in the recorded context. After `fn` returns or
     * throws, the previous context is current again.
     */
    run<R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) : R {
        const previous = store.current;
        store.current = this.#frame;
        try {
            return fn(...args);
        } finally {
            store.current = previous;
        }
    }

    /**
     * Records the current context and gives a wrapper of `fn`. The wrapper runs
     * `fn` in the recorded context, with the `this` value and the arguments of
     * each call.
     */
    static wrap<T, A extends unknown[], R>(fn : (this : T, ...args : A) => R) : (this : T, ...args : A) => R {
        if (typeof fn !== "function") {
            throw new TypeError("Snapshot.wrap: the argument is not a function");
        }
        const frame = store.current;
        const wrapped = function (this : T, ...args : A) : R {
            const previous = store.current;
            store.current = frame;
            try {
                return fn.apply(this, args);
            } finally {
                store.current = previous;
            }
        };
        Object.defineProperty(wrapped, "name", { value : fn.name, configurable : true });
        Object.defineProperty(wrapped, "length", { value : fn.length, configurable : true });
        return wrapped;
    }
}
