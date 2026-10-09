import { ROOT_CONTEXT, type Context, type ContextManager } from "@opentelemetry/api";

/** The methods of `AsyncLocalStorage` that the context manager uses. */
export interface ContextStorage {
    getStore() : Context | undefined;
    run<R>(store : Context, fn : () => R) : R;
    disable() : void;
}

/** The type of the context manager class. */
export type AsyncContextManagerClass = new () => ContextManager;

/**
 * This function makes the context manager class for one `AsyncLocalStorage`
 * class: the class of the browser runtime, or the native class of Node.js.
 * The two entry points of `async-browser-context/opentelemetry` use it.
 */
export function defineContextManager(createStorage : () => ContextStorage) : AsyncContextManagerClass {
    return class AsyncContextManager implements ContextManager {
        readonly #storage : ContextStorage = createStorage();

        /** This method gives the active context, or the root context outside `with()`. */
        active() : Context {
            return this.#storage.getStore() ?? ROOT_CONTEXT;
        }

        /** This method starts `fn` with `context` as the active context, also after each `await` in `fn`. */
        with<A extends unknown[], F extends (...args : A) => ReturnType<F>>(context : Context, fn : F, thisArg? : ThisParameterType<F>, ...args : A) : ReturnType<F> {
            return this.#storage.run(context, () => fn.apply(thisArg, args));
        }

        /** This method gives a function that starts `target` with `context` as the active context. Other values stay as they are. */
        bind<T>(context : Context, target : T) : T {
            if (typeof target !== "function") return target;
            const fn = target as unknown as (...args : unknown[]) => unknown;
            const run = (call : () => unknown) : unknown => this.with(context, call);
            const bound = function (this : unknown, ...args : unknown[]) : unknown {
                return run(() => fn.apply(this, args));
            };
            Object.defineProperty(bound, "length", { value : fn.length, configurable : true });
            return bound as T;
        }

        /** The manager is active when it exists. The method is for the `ContextManager` interface. */
        enable() : this {
            return this;
        }

        /** After this method, `active()` gives the root context until the next `with()`. */
        disable() : this {
            this.#storage.disable();
            return this;
        }
    };
}
