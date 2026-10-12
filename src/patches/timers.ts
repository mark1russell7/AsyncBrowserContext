import { bindToFrame, store } from "../core/store.js";
import { claim, globalPrototype, replaceFunction } from "./patch.js";

type Scheduler = (this : unknown, callback : unknown, ...rest : unknown[]) => unknown;

/** The global functions that get a callback as their first argument and use it later. */
const GLOBAL_SCHEDULERS = [
    "setTimeout",
    "setInterval",
    "setImmediate",
    "queueMicrotask",
    "requestAnimationFrame",
    "requestIdleCallback",
] as const;

/**
 * The prototype methods that get a callback as their first argument and use it
 * later. Only browsers have these classes. The browser tests examine them.
 */
// Stryker disable all: browser-only entries, which the browser tests examine
const PROTOTYPE_SCHEDULERS : readonly (readonly [string, string])[] = [
    ["Scheduler", "postTask"],
    ["HTMLVideoElement", "requestVideoFrameCallback"],
    ["XRSession", "requestAnimationFrame"],
];
// Stryker restore all

/**
 * `source` is the name of the scheduler, for the callback hooks. The replacement is a method,
 * so it has no prototype property and is not a constructor, as the native function. It gives
 * the native function the same number of arguments, so `setTimeout()` without arguments
 * throws as the native function does.
 */
function wrapFirstArgument(source : string) : (original : Scheduler) => Scheduler {
    return (original) => ({
        scheduler(this : unknown, callback : unknown) : unknown {
            if (typeof callback !== "function") {
                // A string callback of setTimeout, or no callback: the native function decides
                return Reflect.apply(original, this, arguments);
            }
            const args = Array.prototype.slice.call(arguments) as unknown[];
            args[0] = bindToFrame(store.current, callback as (...values : unknown[]) => unknown, source);
            return Reflect.apply(original, this, args);
        },
    }).scheduler;
}

/**
 * This function patches the timers and the other schedulers. The callback
 * operates in the context of the call that scheduled it (rule C6). A string callback of
 * `setTimeout` does not change.
 */
export function installTimerPatches() : void {
    if (!claim("timers")) {
        return;
    }
    for (const name of GLOBAL_SCHEDULERS) {
        replaceFunction<Scheduler>(globalThis, name, wrapFirstArgument(name));
    }
    // Stryker disable all: Node.js has none of these classes. The browser tests examine them.
    for (const [constructorName, method] of PROTOTYPE_SCHEDULERS) {
        const prototype = globalPrototype(constructorName);
        if (prototype !== undefined) {
            replaceFunction<Scheduler>(prototype, method, wrapFirstArgument(`${constructorName}.${method}`));
        }
    }
    // Stryker restore all
}
