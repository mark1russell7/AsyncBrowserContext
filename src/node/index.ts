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
import { assertCallbackHook, type CallbackHook } from "../core/callback-hook.js";
import type { VariableOptions } from "../core/variable.js";
import { createCompatibleStorage } from "./compatible-storage.js";

export type { AsyncLocalStorageOptions } from "../core/async-local-storage.js";
export type { CallbackHook } from "../core/callback-hook.js";
export type { VariableOptions } from "../core/variable.js";

/**
 * One value of one variable in a context, and the values of the parent context. The chain
 * tells "a value is set" apart from `undefined`.
 */
interface Entry {
    readonly variable : object;
    readonly value : unknown;
    readonly parent : Entry | undefined;
}

/**
 * One native storage for all variables. Its store is the chain of the values of the current
 * context. On Node.js 22, each native storage that operated stays in a global list of
 * async_hooks, and each new async resource examines the list. One storage keeps that list short.
 */
const values = new NodeAsyncLocalStorage<Entry>();

/** The `AsyncContext.Variable` of the TC39 proposal, on the native `AsyncLocalStorage`. */
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

    /** This method gives the value of this variable in the current context, or the default value. */
    get() : T | undefined {
        for (let entry = values.getStore(); entry !== undefined; entry = entry.parent) {
            if (entry.variable === this) {
                return entry.value as T;
            }
        }
        return this.#defaultValue;
    }

    /**
     * This method starts `fn` with `args` in a new context in which `get()` gives `value`. As
     * in the TC39 draft, `fn` gets `undefined` as its `this` value.
     */
    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        const current = values.getStore();
        // A value of the same variable in the current context gets replaced, so the chain stays short
        const parent = current !== undefined && current.variable === this ? current.parent : current;
        return values.run({ variable : this, value, parent }, () => fn(...args));
    }
}

Object.defineProperty(Variable.prototype, Symbol.toStringTag, { value : "AsyncContext.Variable", configurable : true });

/** The `AsyncContext.Snapshot` of the TC39 proposal, on the native `AsyncLocalStorage.snapshot()`. */
export class Snapshot {
    readonly #run : <R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) => R = NodeAsyncLocalStorage.snapshot();

    /** This method starts `fn` with `args` in the recorded context. `fn` gets `undefined` as its `this` value. */
    run<R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) : R {
        return this.#run(() => fn(...args));
    }

    /** This method records the current context. It gives a wrapper of `fn` that operates in that context. */
    static wrap<T, A extends unknown[], R>(fn : (this : T, ...args : A) => R) : (this : T, ...args : A) => R {
        if (typeof fn !== "function") {
            throw new TypeError("Snapshot.wrap: the argument is not a function");
        }
        const run = NodeAsyncLocalStorage.snapshot();
        const wrapped = function (this : T, ...args : A) : R {
            return run(() => Reflect.apply(fn, this, args));
        };
        // As CopyNameAndLength with the prefix "wrapped" in the TC39 draft
        const name : unknown = fn.name;
        Object.defineProperty(wrapped, "name", { value : `wrapped ${typeof name === "string" ? name : ""}`, configurable : true });
        Object.defineProperty(wrapped, "length", { value : fn.length, configurable : true });
        return wrapped;
    }
}

Object.defineProperty(Snapshot.prototype, Symbol.toStringTag, { value : "AsyncContext.Snapshot", configurable : true });

/**
 * This function gives `true` if the native class supports the `defaultValue` option (Node.js 24
 * and later), and `exit()` then gives `undefined` as in the browser class. Without
 * AsyncContextFrame (`--no-async-context-frame`), `exit()` gives the default value, so the
 * compatible class is used. The probe disables itself, so it does not stay in the list of
 * async_hooks.
 */
function supportsOptions() : boolean {
    const probe = new NodeAsyncLocalStorage<number>({ defaultValue : 1 } as never);
    try {
        return probe.getStore() === 1 && probe.run(2, () => probe.exit(() => probe.getStore())) === undefined;
    } finally {
        probe.disable();
    }
}

/**
 * The native `AsyncLocalStorage` of Node.js. On a Node.js version without the
 * `defaultValue` and `name` options, a compatible class adds them (compatible-storage.ts).
 */
export const AsyncLocalStorage : typeof NodeAsyncLocalStorage = supportsOptions()
    ? NodeAsyncLocalStorage
    : createCompatibleStorage(NodeAsyncLocalStorage);
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

/**
 * On Node.js, this function does nothing. The library does not wrap callbacks
 * on Node.js, because the native `AsyncLocalStorage` keeps the context. Use
 * `node:diagnostics_channel` or `node:async_hooks` to measure callbacks. The
 * function examines the hook as the browser function does, and gives a
 * function that does nothing.
 */
export function addCallbackHook(hook : CallbackHook) : () => void {
    assertCallbackHook(hook);
    return function removeCallbackHook() : void {
        // There is no hook to remove
    };
}
