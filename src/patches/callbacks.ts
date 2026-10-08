import { bindToFrame, store } from "../core/store.js";
import { claim, globalPrototype, ownDataValue, replaceFunction, wrapFunctionArguments } from "./patch.js";

type Method = (this : unknown, ...args : unknown[]) => unknown;

/**
 * The methods that get callbacks and call them later. Each function argument
 * runs in the context of the method call.
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

/** The static methods that get callbacks and call them later. */
const STATIC_METHODS : readonly (readonly [string, readonly string[]])[] = [
    ["Notification", ["requestPermission"]],
    ["Array", ["fromAsync"]],
];

function wrapArguments(original : Method) : Method {
    return function (this : unknown, ...args : unknown[]) : unknown {
        return original.apply(this, wrapFunctionArguments(args));
    };
}

/** `startViewTransition()` gets a callback, or an object with an `update` callback. */
function wrapViewTransition(original : Method) : Method {
    return function (this : unknown, ...args : unknown[]) : unknown {
        const [first] = args;
        if (typeof first === "object" && first !== null && typeof (first as { update? : unknown }).update === "function") {
            const options = first as { update : Method };
            args[0] = { ...options, update : bindToFrame(store.current, options.update) };
            return original.apply(this, args);
        }
        return original.apply(this, wrapFunctionArguments(args));
    };
}

/** `NavigateEvent.intercept()` gets an object with a `handler` callback. */
function wrapIntercept(original : Method) : Method {
    return function (this : unknown, ...args : unknown[]) : unknown {
        const [first] = args;
        if (typeof first === "object" && first !== null && typeof (first as { handler? : unknown }).handler === "function") {
            const options = first as { handler : Method };
            args[0] = { ...options, handler : bindToFrame(store.current, options.handler) };
        }
        return original.apply(this, args);
    };
}

/** Patches the callback APIs that are not events, timers or observers. */
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
            replaceFunction<Method>(prototype, method, wrapArguments);
        }
    }
    for (const [constructorName, methods] of STATIC_METHODS) {
        const constructor = ownDataValue(globalThis, constructorName);
        if (typeof constructor !== "function") {
            continue;
        }
        for (const method of methods) {
            replaceFunction<Method>(constructor, method, wrapArguments);
        }
    }
    const documentPrototype = globalPrototype("Document");
    if (documentPrototype !== undefined) {
        replaceFunction<Method>(documentPrototype, "startViewTransition", wrapViewTransition);
    }
    const navigateEventPrototype = globalPrototype("NavigateEvent");
    if (navigateEventPrototype !== undefined) {
        replaceFunction<Method>(navigateEventPrototype, "intercept", wrapIntercept);
    }
}
