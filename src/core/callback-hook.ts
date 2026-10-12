/**
 * A callback hook. The library starts `before` immediately before each
 * callback that it starts, and `after` immediately after the callback, also
 * after an error. Both methods operate in the context of the callback, so
 * `variable.get()` and `storage.getStore()` give the values of the callback.
 */
export interface CallbackHook {
    /**
     * The library starts this method before the callback.
     *
     * @param callback - The function that the library starts. For a step
     *   after an `await`, it is the body of the async function or the async
     *   generator. It has the name of that function.
     * @param source - The API that got the callback, for example
     *   `"setTimeout"`, `"Promise.then"`, `"addEventListener:click"`,
     *   `"onclick"` or `"await"`.
     */
    before?(callback : Function, source : string) : void;
    /** The library starts this method after the callback, also after an error. The arguments are the same as for `before`. */
    after?(callback : Function, source : string) : void;
}

/** This function makes sure that `hook` is an object, and that `before` and `after` are functions or `undefined`. */
export function assertCallbackHook(hook : CallbackHook) : void {
    if (typeof hook !== "object" || hook === null) {
        throw new TypeError("addCallbackHook: the hook is not an object");
    }
    for (const phase of ["before", "after"] as const) {
        const method : unknown = hook[phase];
        if (method !== undefined && typeof method !== "function") {
            throw new TypeError(`addCallbackHook: hook.${phase} is not a function`);
        }
    }
}
