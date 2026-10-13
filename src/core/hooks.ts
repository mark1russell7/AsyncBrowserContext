import { assertCallbackHook, type CallbackHook } from "./callback-hook.js";
import { store, type HookEntry } from "./store.js";

export type { CallbackHook } from "./callback-hook.js";

let warned = false;

/**
 * Version 0.1 of the library has no callback hooks. If a copy of version 0.1 installed some
 * patches first, the callbacks of those patches do not start the hooks. The function tells
 * this one time on the console. The patches of version 0.2 start the hooks, and the patch of
 * `Function.prototype.toString` has no callbacks.
 */
function warnAboutOldPatches() : void {
    if (warned) {
        return;
    }
    const without = [...(store.oldCopyPatches ?? [])].filter((name) => name !== "Function.prototype.toString");
    if (without.length > 0) {
        warned = true;
        console.warn(`async-browser-context: an older copy of the library installed these patches, and their callbacks do not start the callback hooks: ${without.join(", ")}`);
    }
}

/**
 * This function adds a hook. The library starts its methods before and after each
 * callback that it starts. These callbacks are the callbacks of the patched
 * APIs and the step of each transformed async function after an `await`. The
 * function gives a function that removes the hook.
 *
 * A tool can use the hook to measure the time of each callback, with the
 * name of the callback and the values of its context. An error in a hook goes
 * to `reportError()`, and the callback operates as usual. A callback that
 * starts synchronously in a hook does not start the hook methods. A callback
 * that a hook schedules does not start them either, also later.
 */
export function addCallbackHook(hook : CallbackHook) : () => void {
    assertCallbackHook(hook);
    warnAboutOldPatches();
    const entry : HookEntry = { hook };
    store.hooks = [...(store.hooks ?? []), entry];
    // A second removal finds no entry, and the list stays the same
    return function removeCallbackHook() : void {
        const remaining = (store.hooks ?? []).filter((other) => other !== entry);
        store.hooks = remaining.length === 0 ? undefined : remaining;
    };
}
