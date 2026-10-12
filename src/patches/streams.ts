import { applyQuietly, applyWithHooks, store, type Frame } from "../core/store.js";
import { claim, ownDataValue, rememberOriginal } from "./patch.js";

/**
 * The stream constructors and the methods of the object that each constructor
 * gets as its first argument. The stream uses these methods later, from its
 * own queue. Each method operates in the context of the construction.
 */
const STREAMS : readonly (readonly [string, readonly string[]])[] = [
    ["ReadableStream", ["start", "pull", "cancel"]],
    ["WritableStream", ["start", "write", "close", "abort"]],
    ["TransformStream", ["start", "transform", "flush", "cancel"]],
];

type Method = (this : unknown, ...args : unknown[]) => unknown;

/**
 * This function gives a view of `underlying` in which each method of `methods` is a wrapper.
 * The view is a Proxy, so the other properties, for example `type`, come from `underlying`
 * with their getters and private fields. The target of the Proxy is an empty object, so a
 * frozen object also operates. The specification reads the members with [[Get]]. But the
 * streams of WebKit first examine each member with the `in` operator, thus the `has` trap
 * gives the answer of `underlying`. Each method gets `underlying` as its `this` value, as the
 * specification tells.
 */
function wrapUnderlying(underlying : object, methods : readonly string[], frame : Frame, name : string) : object {
    // A method that a hook registers does not start the hooks
    const quiet = store.inHook === true;
    const wrappers = new Map<string, Method>();
    const wrapperOf = (method : string, original : Method) : Method => {
        let wrapper = wrappers.get(method);
        if (wrapper !== undefined) {
            return wrapper;
        }
        const source = `${name}.${method}`;
        wrapper = function asyncBrowserContextWrapper() : unknown {
            const previous = store.current;
            store.current = frame;
            try {
                if (quiet) {
                    return applyQuietly(original, underlying, Array.prototype.slice.call(arguments) as unknown[]);
                }
                const hooks = store.hooks;
                if (hooks === undefined) {
                    return Reflect.apply(original, underlying, arguments);
                }
                return applyWithHooks(hooks, original, source, original, underlying, Array.prototype.slice.call(arguments) as unknown[]);
            } finally {
                store.current = previous;
            }
        };
        wrappers.set(method, wrapper);
        return wrapper;
    };
    return new Proxy({}, {
        get(_target, property) : unknown {
            const value : unknown = Reflect.get(underlying, property, underlying);
            if (typeof property === "string" && typeof value === "function" && methods.includes(property)) {
                return wrapperOf(property, value as Method);
            }
            return value;
        },
        has(_target, property) : boolean {
            return Reflect.has(underlying, property);
        },
    });
}

/** This function patches the stream constructors. */
export function installStreamPatches() : void {
    if (!claim("streams")) {
        return;
    }
    for (const [name, methods] of STREAMS) {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
        const native = ownDataValue(globalThis, name);
        if (typeof native !== "function" || descriptor?.configurable !== true) {
            continue;
        }
        const constructor = native as new (...args : unknown[]) => object;
        const proxy = new Proxy(constructor, {
            construct(target, args : unknown[], newTarget : Function) : object {
                const underlying = args[0];
                if (typeof underlying === "object" && underlying !== null) {
                    args[0] = wrapUnderlying(underlying, methods, store.current, name);
                }
                return Reflect.construct(target, args, newTarget) as object;
            },
        });
        rememberOriginal(proxy, constructor);
        const prototype = (constructor as { prototype? : unknown }).prototype;
        if (typeof prototype === "object" && prototype !== null) {
            const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
            if (constructorDescriptor?.configurable === true) {
                Object.defineProperty(prototype, "constructor", { ...constructorDescriptor, value : proxy });
            }
        }
        Object.defineProperty(globalThis, name, { ...descriptor, value : proxy });
    }
}
