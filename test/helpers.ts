import type { Variable } from "async-browser-context";

/** The runtime under test (a `define` constant of the Vitest project). */
export const runtime : "browser" | "node" = __TEST_RUNTIME__;
/** `true` if the Babel preset transformed the test files. */
export const transformed : boolean = __TEST_TRANSFORMED__;
/** `true` in a real browser (Vitest browser mode). */
export const inBrowser : boolean = typeof window !== "undefined" && typeof document !== "undefined";

/** Resolves after `ms` milliseconds. */
export function delay(ms : number) : Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves after `count` microtask turns. */
export async function turns(count : number) : Promise<void> {
    for (let index = 0; index < count; index++) {
        await null;
    }
}

/** A promise and the functions that settle it. */
export interface Deferred<T> {
    readonly promise : Promise<T>;
    readonly resolve : (value : T) => void;
    readonly reject : (reason : unknown) => void;
}

export function deferred<T = void>() : Deferred<T> {
    let resolve! : (value : T) => void;
    let reject! : (reason : unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

/**
 * Starts a task in another context that resumes in each of the next `count`
 * microtask turns. Start it immediately before an `await`: then the other task
 * resumes immediately before the code after the `await`. A runtime that leaks
 * the context gives the value of the other task.
 */
export function busyOther<T>(variable : Variable<T>, value : T, count = 3) : Promise<void> {
    return variable.run(value, async () => {
        for (let index = 0; index < count; index++) {
            await null;
        }
    });
}
