import { ROOT_CONTEXT, type Context, type ContextManager } from "@opentelemetry/api";

/** The methods of `AsyncLocalStorage` that the context manager uses. */
export interface ContextStorage {
    getStore() : Context | undefined;
    run<R>(store : Context, fn : () => R) : R;
    disable() : void;
}

/** The type of the context manager class. */
export type AsyncContextManagerClass = new () => ContextManager;

type Listener = (...args : unknown[]) => unknown;
type Method = (this : unknown, ...args : unknown[]) => unknown;

/** The methods of a Node.js EventEmitter that add a listener. */
const ADD_LISTENER_METHODS = ["addListener", "on", "once", "prependListener", "prependOnceListener"] as const;

/** The emitters and event targets that bind() patched. A second bind() keeps the first context, as the context managers of OpenTelemetry do. */
const boundTargets = new WeakSet<object>();

/** The bound listeners of each emitter or event target, for each event name, so that a remove method finds the bound listener. */
const boundListeners = new WeakMap<object, Map<unknown, WeakMap<object, Listener>>>();

function listenersOf(target : object, event : unknown) : WeakMap<object, Listener> {
    let byEvent = boundListeners.get(target);
    if (byEvent === undefined) {
        byEvent = new Map();
        boundListeners.set(target, byEvent);
    }
    let listeners = byEvent.get(event);
    if (listeners === undefined) {
        listeners = new WeakMap();
        byEvent.set(event, listeners);
    }
    return listeners;
}

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
            return this.#storage.run(context, () => Reflect.apply(fn, thisArg, args) as ReturnType<F>);
        }

        /**
         * This method binds `target` to `context`, as the context managers of OpenTelemetry do:
         *
         * - A function gives a wrapper that starts it with `context` as the active context.
         * - An event target (`addEventListener`) or a Node.js event emitter (`on`) gets a patch of
         *   its methods. Each listener that the program adds later operates with `context`, and the
         *   remove methods find the bound listener. A second `bind()` of the same object keeps the
         *   first context.
         * - Other values stay as they are.
         *
         * Without a context, the method uses the active context.
         */
        bind<T>(context : Context | undefined, target : T) : T {
            const bound = context ?? this.active();
            if (typeof target === "function") {
                return this.#bindFunction(bound, target as unknown as Listener) as T;
            }
            if (typeof target === "object" && target !== null && !boundTargets.has(target)) {
                const methods = target as unknown as Record<string, unknown>;
                if (typeof methods["addEventListener"] === "function") {
                    boundTargets.add(target);
                    this.#bindEventTarget(bound, target);
                } else if (typeof methods["on"] === "function" || typeof methods["addListener"] === "function") {
                    boundTargets.add(target);
                    this.#bindEmitter(bound, target);
                }
            }
            return target;
        }

        /** The manager is active when it exists. The method is for the `ContextManager` interface. */
        enable() : this {
            return this;
        }

        /**
         * After this method, `active()` gives the root context in the current code. With the
         * browser runtime and with Node.js 22, it also gives the root context in all other code
         * until the next `with()`. With Node.js 24 and its AsyncContextFrame, the native class
         * changes only the current context, also for the callbacks that this context registered.
         */
        disable() : this {
            this.#storage.disable();
            return this;
        }

        #bindFunction(context : Context, fn : Listener) : Listener {
            const run = (call : () => unknown) : unknown => this.with(context, call);
            const wrapper = function (this : unknown, ...args : unknown[]) : unknown {
                return run(() => Reflect.apply(fn, this, args));
            };
            Object.defineProperty(wrapper, "length", { value : fn.length, configurable : true });
            return wrapper;
        }

        /** This method patches the methods of a Node.js event emitter, as `AsyncLocalStorageContextManager` of OpenTelemetry does. */
        #bindEmitter(context : Context, emitter : object) : void {
            const methods = emitter as Record<string, unknown>;
            // `once` of Node.js adds its own wrapper with `this.on`. That inner add must not wrap again,
            // else `removeListener` does not find the listener. OpenTelemetry has the same guard.
            let adding = false;
            for (const name of ADD_LISTENER_METHODS) {
                const original = methods[name];
                if (typeof original !== "function") {
                    continue;
                }
                const manager = this;
                methods[name] = function (this : unknown, event : unknown, listener : unknown) : unknown {
                    if (adding || typeof listener !== "function") {
                        return Reflect.apply(original as Method, this, arguments);
                    }
                    const listeners = listenersOf(emitter, event);
                    let wrapper = listeners.get(listener);
                    if (wrapper === undefined) {
                        wrapper = manager.#bindFunction(context, listener as Listener);
                        listeners.set(listener, wrapper);
                    }
                    adding = true;
                    try {
                        return Reflect.apply(original as Method, this, [event, wrapper]);
                    } finally {
                        adding = false;
                    }
                };
            }
            for (const name of ["removeListener", "off"] as const) {
                const original = methods[name];
                if (typeof original !== "function") {
                    continue;
                }
                methods[name] = function (this : unknown, event : unknown, listener : unknown) : unknown {
                    const wrapper = typeof listener === "function" ? boundListeners.get(emitter)?.get(event)?.get(listener) : undefined;
                    return Reflect.apply(original as Method, this, [event, wrapper ?? listener]);
                };
            }
            const removeAll = methods["removeAllListeners"];
            if (typeof removeAll === "function") {
                methods["removeAllListeners"] = function (this : unknown, event? : unknown) : unknown {
                    if (arguments.length === 0) {
                        boundListeners.delete(emitter);
                    } else {
                        boundListeners.get(emitter)?.delete(event);
                    }
                    return Reflect.apply(removeAll as Method, this, arguments);
                };
            }
        }

        /** This method patches the methods of an event target, as `ZoneContextManager` of OpenTelemetry does. */
        #bindEventTarget(context : Context, target : object) : void {
            const methods = target as Record<string, unknown>;
            const add = methods["addEventListener"] as Method;
            const remove = methods["removeEventListener"];
            const manager = this;
            methods["addEventListener"] = function (this : unknown, type : unknown, listener : unknown) : unknown {
                if (typeof listener !== "function") {
                    return Reflect.apply(add, this, arguments);
                }
                const listeners = listenersOf(target, type);
                let wrapper = listeners.get(listener);
                if (wrapper === undefined) {
                    wrapper = manager.#bindFunction(context, listener as Listener);
                    listeners.set(listener, wrapper);
                }
                const args = Array.prototype.slice.call(arguments) as unknown[];
                args[1] = wrapper;
                return Reflect.apply(add, this, args);
            };
            if (typeof remove === "function") {
                methods["removeEventListener"] = function (this : unknown, type : unknown, listener : unknown) : unknown {
                    const wrapper = typeof listener === "function" ? boundListeners.get(target)?.get(type)?.get(listener) : undefined;
                    const args = Array.prototype.slice.call(arguments) as unknown[];
                    if (wrapper !== undefined) {
                        args[1] = wrapper;
                    }
                    return Reflect.apply(remove as Method, this, args);
                };
            }
        }
    };
}
