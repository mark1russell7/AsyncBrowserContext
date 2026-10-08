import { bindToFrame, store } from "../core/store.js";
import { claim, globalPrototype, replaceFunction } from "./patch.js";

type Scheduler = (this : unknown, callback : unknown, ...rest : unknown[]) => unknown;

/** The global functions that get a callback as their first argument and call it later. */
const GLOBAL_SCHEDULERS = [
    "setTimeout",
    "setInterval",
    "setImmediate",
    "queueMicrotask",
    "requestAnimationFrame",
    "requestIdleCallback",
] as const;

/** The prototype methods that get a callback as their first argument and call it later. */
const PROTOTYPE_SCHEDULERS : readonly (readonly [string, string])[] = [
    ["Scheduler", "postTask"],
    ["HTMLVideoElement", "requestVideoFrameCallback"],
    ["XRSession", "requestAnimationFrame"],
];

function wrapFirstArgument(original : Scheduler) : Scheduler {
    return function (this : unknown, callback : unknown, ...rest : unknown[]) : unknown {
        const wrapped = typeof callback === "function" ? bindToFrame(store.current, callback as (...args : unknown[]) => unknown) : callback;
        return original.call(this, wrapped, ...rest);
    };
}

/**
 * Patches the timers and the other schedulers. The callback runs in the
 * context of the call that scheduled it (rule C6). A string callback of
 * `setTimeout` does not change.
 */
export function installTimerPatches() : void {
    if (!claim("timers")) {
        return;
    }
    for (const name of GLOBAL_SCHEDULERS) {
        replaceFunction<Scheduler>(globalThis, name, wrapFirstArgument);
    }
    for (const [constructorName, method] of PROTOTYPE_SCHEDULERS) {
        const prototype = globalPrototype(constructorName);
        if (prototype !== undefined) {
            replaceFunction<Scheduler>(prototype, method, wrapFirstArgument);
        }
    }
}
