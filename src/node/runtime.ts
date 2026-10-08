/**
 * The runtime of transformed code on Node.js. On Node.js, the native
 * `AsyncLocalStorage` keeps the context through promises, so `coroutine` is
 * a plain driver of the generator. `bindGenerator` keeps the context of the
 * generator creation (rule C5), with `AsyncLocalStorage.snapshot()`.
 *
 * @packageDocumentation
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** This function gives an async function that operates `generatorFunction`. */
export function coroutine<T, A extends unknown[], R>(generatorFunction : (this : T, ...args : A) => Generator<unknown, R, unknown>) : (this : T, ...args : A) => Promise<R> {
    return function asyncFunction(this : T, ...args : A) : Promise<R> {
        const generator = generatorFunction.apply(this, args);
        return new Promise<R>((resolve, reject) => {
            const step = (method : "next" | "throw", argument : unknown) : void => {
                let result : IteratorResult<unknown, R>;
                let awaited : Promise<unknown>;
                try {
                    result = method === "next" ? generator.next(argument) : generator.throw(argument);
                    if (result.done) {
                        resolve(result.value);
                        return;
                    }
                    awaited = Promise.resolve(result.value);
                } catch (error) {
                    reject(error);
                    return;
                }
                awaited.then(onFulfilled, onRejected);
            };
            const onFulfilled = (value : unknown) : void => step("next", value);
            const onRejected = (error : unknown) : void => step("throw", error);
            step("next", undefined);
        });
    };
}

type AnyIterator = Iterator<unknown, unknown, unknown> | AsyncIterator<unknown, unknown, unknown>;
type ResumeMethod = "next" | "throw" | "return";

/** This function binds a generator object to the current context (rule C5). */
export function bindGenerator<I extends AnyIterator>(generator : I) : I {
    let run = AsyncLocalStorage.snapshot();
    const target = generator as unknown as Record<ResumeMethod, (argument? : unknown) => unknown>;
    const resume = (method : ResumeMethod, argument : unknown) : unknown => run(() => {
        try {
            return target[method](argument);
        } finally {
            // The body can change its context with enterWith before it stops
            run = AsyncLocalStorage.snapshot();
        }
    });
    const methods = {
        next(value? : unknown) : unknown { return resume("next", value); },
        throw(error? : unknown) : unknown { return resume("throw", error); },
        return(value? : unknown) : unknown { return resume("return", value); },
    };
    const bound = Object.create(Object.getPrototypeOf(generator) as object) as I;
    Object.defineProperties(bound, {
        next : { value : methods.next, writable : true, configurable : true },
        throw : { value : methods.throw, writable : true, configurable : true },
        return : { value : methods.return, writable : true, configurable : true },
    });
    return bound;
}
