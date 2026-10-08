/**
 * A module that the Vite plugin of the library does not transform (refer to
 * `isSiteModule` in `vite.config.ts`). It is an example of a dependency that
 * the build does not give to the plugin. Its `await` is native, so the
 * library cannot set the context after it.
 */

/** This function waits for two microtasks and then gives the result of `callback`. */
export async function loadWithCallback<T>(callback : () => T) : Promise<T> {
    await null;
    await null;
    return callback();
}
