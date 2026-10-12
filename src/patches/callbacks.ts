import { bindToFrame, store, type Frame } from "../core/store.js";
import { claim, globalPrototype, ownDataValue, replaceFunction, wrapFunctionArguments } from "./patch.js";

type Method = (this : unknown, ...args : unknown[]) => unknown;

/**
 * The methods that get callbacks and use them later. Each function argument
 * operates in the context of the method call.
 */
const PROTOTYPE_METHODS : readonly (readonly [string, readonly string[]])[] = [
    ["Geolocation", ["getCurrentPosition", "watchPosition"]],
    ["LockManager", ["request"]],
    ["HTMLCanvasElement", ["toBlob"]],
    ["DataTransferItem", ["getAsString"]],
    ["FileSystemDirectoryReader", ["readEntries"]],
    ["FileSystemFileEntry", ["file"]],
    ["FileSystemDirectoryEntry", ["getFile", "getDirectory"]],
    ["FileSystemEntry", ["getParent", "getMetadata"]],
    ["BaseAudioContext", ["decodeAudioData"]],
    ["MediaSession", ["setActionHandler"]],
    ["RTCPeerConnection", ["createOffer", "createAnswer", "setLocalDescription", "setRemoteDescription", "addIceCandidate", "getStats"]],
];

/** The static methods that get callbacks and use them later. */
const STATIC_METHODS : readonly (readonly [string, readonly string[]])[] = [
    ["Notification", ["requestPermission"]],
];

/** `source` is the name of the method, for the callback hooks. The replacement is a method, as the native function. */
function wrapArguments(source : string) : (original : Method) => Method {
    return (original) => ({
        method(this : unknown, ...args : unknown[]) : unknown {
            return Reflect.apply(original, this, wrapFunctionArguments(args, source));
        },
    }).method;
}

/**
 * `Array.fromAsync(items, mapFn, thisArg)` uses only `mapFn` later. `items` and `thisArg` can
 * also be functions, and they must not change.
 */
function wrapFromAsync(original : Method) : Method {
    return {
        fromAsync(this : unknown) : unknown {
            const mapFn : unknown = arguments[1];
            if (typeof mapFn !== "function") {
                return Reflect.apply(original, this, arguments);
            }
            const args = Array.prototype.slice.call(arguments) as unknown[];
            args[1] = bindToFrame(store.current, mapFn as Method, "Array.fromAsync");
            return Reflect.apply(original, this, args);
        },
    }.fromAsync;
}

/**
 * This function gives a view of the dictionary `options` in which each key of `keys` gives a
 * wrapper of its callback. The other members come from `options` with their getters and their
 * prototype chain. The target of the Proxy is an empty object, so a frozen object also
 * operates. The browser reads the members of a dictionary with [[Get]] only.
 */
function withCallback(options : object, keys : readonly string[], frame : Frame, source : string) : object {
    const wrappers = new Map<PropertyKey, Method>();
    return new Proxy({}, {
        get(_target, property) : unknown {
            const value : unknown = Reflect.get(options, property, options);
            if (typeof property !== "string" || !keys.includes(property) || typeof value !== "function") {
                return value;
            }
            let wrapper = wrappers.get(property);
            if (wrapper === undefined) {
                wrapper = bindToFrame(frame, value as Method, source);
                wrappers.set(property, wrapper);
            }
            return wrapper;
        },
        // For an engine that examines a member with the `in` operator first, as the streams of WebKit do
        has(_target, property) : boolean {
            return Reflect.has(options, property);
        },
    });
}

/** `startViewTransition()` gets a callback, or an object with an `update` callback. `source` names the class. */
function wrapViewTransition(source : string) : (original : Method) => Method {
    return (original) => ({
        startViewTransition(this : unknown) : unknown {
            const first : unknown = arguments[0];
            if (typeof first === "object" && first !== null) {
                const args = Array.prototype.slice.call(arguments) as unknown[];
                args[0] = withCallback(first, ["update"], store.current, source);
                return Reflect.apply(original, this, args);
            }
            return Reflect.apply(original, this, wrapFunctionArguments(Array.prototype.slice.call(arguments) as unknown[], source));
        },
    }).startViewTransition;
}

/** `NavigateEvent.intercept()` gets an object with a `handler` and a `precommitHandler` callback. */
function wrapIntercept(original : Method) : Method {
    return {
        intercept(this : unknown) : unknown {
            const first : unknown = arguments[0];
            if (typeof first === "object" && first !== null) {
                const args = Array.prototype.slice.call(arguments) as unknown[];
                args[0] = withCallback(first, ["handler", "precommitHandler"], store.current, "NavigateEvent.intercept");
                return Reflect.apply(original, this, args);
            }
            return Reflect.apply(original, this, arguments);
        },
    }.intercept;
}

/** This function patches the callback APIs that are not events, timers or observers. */
export function installCallbackPatches() : void {
    if (!claim("callbacks")) {
        return;
    }
    for (const [constructorName, methods] of PROTOTYPE_METHODS) {
        const prototype = globalPrototype(constructorName);
        if (prototype === undefined) {
            continue;
        }
        for (const method of methods) {
            replaceFunction<Method>(prototype, method, wrapArguments(`${constructorName}.${method}`));
        }
    }
    for (const [constructorName, methods] of STATIC_METHODS) {
        const constructor = ownDataValue(globalThis, constructorName);
        if (typeof constructor !== "function") {
            continue;
        }
        for (const method of methods) {
            replaceFunction<Method>(constructor, method, wrapArguments(`${constructorName}.${method}`));
        }
    }
    const array = ownDataValue(globalThis, "Array");
    if (typeof array === "function") {
        replaceFunction<Method>(array, "fromAsync", wrapFromAsync);
    }
    for (const owner of ["Document", "Element"]) {
        const prototype = globalPrototype(owner);
        if (prototype !== undefined) {
            replaceFunction<Method>(prototype, "startViewTransition", wrapViewTransition(`${owner}.startViewTransition`));
        }
    }
    const navigateEventPrototype = globalPrototype("NavigateEvent");
    if (navigateEventPrototype !== undefined) {
        replaceFunction<Method>(navigateEventPrototype, "intercept", wrapIntercept);
    }
}
