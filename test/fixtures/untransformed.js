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

/** Calls `callback` from a timer that it starts before its first `await`. */
export function libraryTimer(callback) {
    return new Promise((resolve) => setTimeout(() => resolve(callback()), 0));
}

/** A list of callbacks, as a library keeps them: `emit()` calls each callback. */
export function createEmitter() {
    const listeners = [];
    return {
        on(listener) {
            listeners.push(listener);
        },
        emit() {
            return listeners.map((listener) => listener());
        },
    };
}
