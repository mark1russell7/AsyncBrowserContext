import { assertCallbackHook, type CallbackHook } from "./callback-hook.js";
import { store, type HookEntry } from "./store.js";

export type { CallbackHook } from "./callback-hook.js";

/**
 * This function adds a hook. The library starts its methods before and after each
 * callback that it starts. These callbacks are the callbacks of the patched
 * APIs and the step of each transformed async function after an `await`. The
 * function gives a function that removes the hook.
 *
 * A tool can use the hook to measure the time of each callback, with the
 * name of the callback and the values of its context. An error in a hook goes
 * to `reportError()`, and the callback operates as usual. A callback that
 * starts synchronously in a hook does not start the hook methods.
 */
export function addCallbackHook(hook : CallbackHook) : () => void {
    assertCallbackHook(hook);
    const entry : HookEntry = { hook };
    store.hooks = [...(store.hooks ?? []), entry];
    let removed = false;
    return function removeCallbackHook() : void {
        if (removed) {
            return;
        }
        removed = true;
        const remaining = (store.hooks ?? []).filter((other) => other !== entry);
        store.hooks = remaining.length === 0 ? undefined : remaining;
    };
}
