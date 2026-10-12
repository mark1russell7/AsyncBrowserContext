import { applyWithHooks, store, type Frame } from "../core/store.js";
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
 * This function gives an object that inherits from `underlying` and has a wrapper for each
 * method. The other properties, for example `type`, come from `underlying`.
 * Each method gets `underlying` as its `this` value, as the specification
 * tells.
 */
function wrapUnderlying(underlying : object, methods : readonly string[], frame : Frame, name : string) : object {
    const wrapped = Object.create(underlying) as Record<string, unknown>;
    const properties = underlying as Record<string, unknown>;
    for (const method of methods) {
        const original = properties[method];
        if (typeof original !== "function") {
            continue;
        }
        const source = `${name}.${method}`;
        wrapped[method] = function asyncBrowserContextWrapper(...args : unknown[]) : unknown {
            const previous = store.current;
            store.current = frame;
            try {
                const hooks = store.hooks;
                if (hooks === undefined) {
                    return (original as Method).apply(underlying, args);
                }
                return applyWithHooks(hooks, original as Method, source, original as Method, underlying, args);
            } finally {
                store.current = previous;
            }
        };
    }
    return wrapped;
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
