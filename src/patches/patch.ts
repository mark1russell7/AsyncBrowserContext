import { bindToFrame, store } from "../core/store.js";

/**
 * Marks the patch `name` as installed. Gives `true` if the patch was not
 * installed before. Each patch is installed one time for each global object,
 * also when the page loads two copies of the library.
 */
export function claim(name : string) : boolean {
    if (store.patches.has(name)) {
        return false;
    }
    store.patches.add(name);
    return true;
}

/** Records `original` as the original of `replacement`. `Function.prototype.toString` then shows the original. */
export function rememberOriginal(replacement : object, original : object) : void {
    store.originals.set(replacement, store.originals.get(original) ?? original);
}

/** Copies the name, the length and the other own properties of `original` to `replacement`. */
function copyFunctionProperties(replacement : object, original : object) : void {
    for (const key of Reflect.ownKeys(original)) {
        if (key === "prototype" || key === "arguments" || key === "caller") {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(original, key);
        if (descriptor === undefined) {
            continue;
        }
        try {
            Object.defineProperty(replacement, key, descriptor);
        } catch {
            // A property that the replacement cannot take is not important
        }
    }
}

type AnyFunction = (this : unknown, ...args : never[]) => unknown;

/**
 * Replaces the function property `key` of `owner`. `create` gets the original
 * function and gives the replacement. The replacement gets the property
 * attributes, the name, the length and the other own properties of the
 * original. Gives `false` if `owner` has no function with that key.
 */
export function replaceFunction<F extends AnyFunction>(owner : object, key : string, create : (original : F) => F) : boolean {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor === undefined || typeof descriptor.value !== "function" || descriptor.configurable !== true) {
        return false;
    }
    const original = descriptor.value as F;
    const replacement = create(original);
    copyFunctionProperties(replacement, original);
    rememberOriginal(replacement, original);
    Object.defineProperty(owner, key, { ...descriptor, value : replacement });
    return true;
}

/** Gives the value of the own data property `key` of `owner`, without a call to a getter. */
export function ownDataValue(owner : object, key : string) : unknown {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

/** Gives the prototype of the global constructor `name`, if it exists. */
export function globalPrototype(name : string) : object | undefined {
    const constructor = ownDataValue(globalThis, name);
    if (typeof constructor !== "function") {
        return undefined;
    }
    const prototype = (constructor as { prototype? : unknown }).prototype;
    return typeof prototype === "object" && prototype !== null ? prototype : undefined;
}

/** Wraps each function argument with the current frame. Other arguments do not change. */
export function wrapFunctionArguments(args : unknown[]) : unknown[] {
    const frame = store.current;
    let changed : unknown[] | undefined;
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (typeof argument === "function") {
            changed ??= [...args];
            changed[index] = bindToFrame(frame, argument as (...values : unknown[]) => unknown);
        }
    }
    return changed ?? args;
}
