// A dependency that the application does not transform with the Babel preset.
// The Vite plugin of the tests excludes this file. Its async functions stay
// native, so the library cannot set the context after their `await`.

/** Awaits two times, then calls `callback`. */
export async function libraryCall(callback) {
    await null;
    await null;
    return callback();
}

/** Calls `callback` after `await` inside a native async generator. */
export async function* libraryGenerator(callback) {
    await null;
    yield callback();
}
