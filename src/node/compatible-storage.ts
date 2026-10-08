import type { AsyncLocalStorage as NodeAsyncLocalStorage } from "node:async_hooks";
import type { AsyncLocalStorageOptions } from "../core/async-local-storage.js";

/** The store of one context. The box tells "a store is set" apart from "no store". */
interface Box<T> {
    readonly value : T | undefined;
}

/** The box of `exit()`: the store is `undefined`, also when the storage has a default value. */
const EXITED : Box<never> = Object.freeze({ value : undefined });

/**
 * This function gives a class with the API of the native `AsyncLocalStorage`
 * and the `defaultValue` and `name` options of Node.js 24. Node.js 22 does not
 * have these options. The class keeps a native storage, and keeps each store
 * in a box. Thus, `exit()` gives `undefined`, and the default value applies
 * only where no store is set.
 *
 * The class does not extend the native class: on some Node.js versions, the
 * native constructor gives an object of an internal class.
 */
export function createCompatibleStorage(Native : typeof NodeAsyncLocalStorage) : typeof NodeAsyncLocalStorage {
    class AsyncLocalStorage<T> {
        readonly #storage : NodeAsyncLocalStorage<Box<T>> = new Native<Box<T>>();
        readonly #defaultValue : T | undefined;
        readonly #name : string;
        #disabled = false;

        constructor(options : AsyncLocalStorageOptions<T> = {}) {
            this.#defaultValue = options.defaultValue;
            this.#name = options.name === undefined ? "" : String(options.name);
        }

        get name() : string {
            return this.#name;
        }

        getStore() : T | undefined {
            if (this.#disabled) {
                return undefined;
            }
            const box = this.#storage.getStore();
            return box === undefined ? this.#defaultValue : box.value;
        }

        run<R, A extends unknown[]>(store : T, callback : (...args : A) => R, ...args : A) : R {
            this.#disabled = false;
            return this.#storage.run({ value : store }, callback, ...args);
        }

        exit<R, A extends unknown[]>(callback : (...args : A) => R, ...args : A) : R {
            return this.#storage.run(EXITED, callback, ...args);
        }

        enterWith(store : T) : void {
            this.#disabled = false;
            this.#storage.enterWith({ value : store });
        }

        disable() : void {
            this.#disabled = true;
            this.#storage.disable();
        }

        static bind<F extends (...args : never[]) => unknown>(fn : F) : F {
            return Native.bind(fn);
        }

        static snapshot() : ReturnType<typeof NodeAsyncLocalStorage.snapshot> {
            return Native.snapshot();
        }
    }
    return AsyncLocalStorage as unknown as typeof NodeAsyncLocalStorage;
}
