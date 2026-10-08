/**
 * The Node.js entry of `async-browser-context`. The `node` export condition
 * selects it. It gives the same API as the browser entry, but the native
 * `AsyncLocalStorage` of `node:async_hooks` keeps the context. Thus, on
 * Node.js, the context stays through all asynchronous operations, also in
 * code that Babel does not transform. No patch is necessary.
 *
 * @packageDocumentation
 */
import { AsyncLocalStorage as NodeAsyncLocalStorage } from "node:async_hooks";
import type { AsyncLocalStorageOptions } from "../core/async-local-storage.js";
import type { VariableOptions } from "../core/variable.js";

export type { AsyncLocalStorageOptions } from "../core/async-local-storage.js";
export type { VariableOptions } from "../core/variable.js";

/** The value of a `Variable` in one context. The box tells "a value is set" apart from `undefined`. */
interface Box<T> {
    readonly value : T;
}

/** The `AsyncContext.Variable` of the TC39 proposal, on the native `AsyncLocalStorage`. */
export class Variable<T> {
    readonly #name : string;
    readonly #defaultValue : T | undefined;
    readonly #storage : NodeAsyncLocalStorage<Box<T>> = new NodeAsyncLocalStorage<Box<T>>();

    constructor(options : VariableOptions<T> = {}) {
        this.#name = options.name === undefined ? "" : String(options.name);
        this.#defaultValue = options.defaultValue;
    }

    /** The name of the variable. */
    get name() : string {
        return this.#name;
    }

    /** Gives the value of this variable in the current context, or the default value. */
    get() : T | undefined {
        const box = this.#storage.getStore();
        return box === undefined ? this.#defaultValue : box.value;
    }

    /** Runs `fn` with `args` in a new context in which `get()` gives `value`. */
    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        return this.#storage.run({ value }, fn, ...args);
    }
}

/** The `AsyncContext.Snapshot` of the TC39 proposal, on the native `AsyncLocalStorage.snapshot()`. */
export class Snapshot {
    readonly #run : <R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) => R = NodeAsyncLocalStorage.snapshot();

    /** Runs `fn` with `args` in the recorded context. */
    run<R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) : R {
        return this.#run(fn, ...args);
    }

    /** Records the current context and gives a wrapper of `fn` that runs in that context. */
    static wrap<T, A extends unknown[], R>(fn : (this : T, ...args : A) => R) : (this : T, ...args : A) => R {
        if (typeof fn !== "function") {
            throw new TypeError("Snapshot.wrap: the argument is not a function");
        }
        const run = NodeAsyncLocalStorage.snapshot();
        const wrapped = function (this : T, ...args : A) : R {
            return run(() => fn.apply(this, args));
        };
        Object.defineProperty(wrapped, "name", { value : fn.name, configurable : true });
        Object.defineProperty(wrapped, "length", { value : fn.length, configurable : true });
        return wrapped;
    }
}

/** Gives `true` if the native class supports the `defaultValue` option (Node.js 24 and later). */
function supportsOptions() : boolean {
    const probe = new NodeAsyncLocalStorage<number>({ defaultValue : 1 } as never);
    return probe.getStore() === 1;
}

/**
 * The native `AsyncLocalStorage` of Node.js. On a Node.js version without the
 * `defaultValue` and `name` options, a subclass adds them.
 */
export const AsyncLocalStorage : typeof NodeAsyncLocalStorage = supportsOptions()
    ? NodeAsyncLocalStorage
    : class AsyncLocalStorage<T> extends NodeAsyncLocalStorage<T> {
        readonly #defaultValue : T | undefined;

        constructor(options : AsyncLocalStorageOptions<T> = {}) {
            super();
            this.#defaultValue = options.defaultValue;
            Object.defineProperty(this, "name", { value : options.name === undefined ? "" : String(options.name), configurable : true });
        }

        override getStore() : T | undefined {
            const store = super.getStore();
            return store === undefined ? this.#defaultValue : store;
        }
    };
/** The type of the native `AsyncLocalStorage`. */
export type AsyncLocalStorage<T> = NodeAsyncLocalStorage<T>;

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
