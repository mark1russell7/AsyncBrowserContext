import { bindOneArgument, store } from "../core/store.js";
import { claim, replaceFunction } from "./patch.js";

type Then = typeof Promise.prototype.then;

/**
 * This function patches `Promise.prototype.then`. A `then` callback operates in
 * the context of the `then` call (rule C4). `catch`, `finally`, `Promise.all`
 * and the other combinators use `then`, so they get the same rule.
 *
 * The patch does not replace the `Promise` constructor. Thus, `Promise`
 * subclasses and identity checks operate as without the library (rule C11).
 *
 * `await` in native code does not use `then`. The Babel preset changes each
 * `await` so that the coroutine sets the context (rule C3).
 */
export function installPromisePatch() : void {
    if (!claim("Promise.prototype.then")) {
        return;
    }
    const nativeThen = store.intrinsics.promiseThen;
    replaceFunction<Then>(Promise.prototype, "then", () => function then<T, R1 = T, R2 = never>(
        this : Promise<T>,
        onFulfilled? : ((value : T) => R1 | PromiseLike<R1>) | null,
        onRejected? : ((reason : unknown) => R2 | PromiseLike<R2>) | null,
    ) : Promise<R1 | R2> {
        const frame = store.current;
        return nativeThen.call(
            this,
            typeof onFulfilled === "function" ? bindOneArgument(frame, onFulfilled) : onFulfilled,
            typeof onRejected === "function" ? bindOneArgument(frame, onRejected) : onRejected,
        ) as Promise<R1 | R2>;
    } as Then);
}
