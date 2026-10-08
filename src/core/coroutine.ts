import { store, type Frame } from "./store.js";

/**
 * The runtime functions that the code from the Babel preset calls. Do not call
 * them directly.
 *
 * Each async function becomes a generator function, and `coroutine` runs it.
 * Each `await` becomes a `yield`. Before each step of the generator,
 * `coroutine` sets the context of the async function. After the step, it sets
 * the previous context again. Thus, the context is correct after each `await`,
 * also in the same expression, and no other code gets this context.
 */

type StepMethod = "next" | "throw";

/**
 * Gives an async function that runs `generatorFunction`. The preset gives
 * this function to `@babel/plugin-transform-async-to-generator` as its
 * `method` option.
 */
export function coroutine<T, A extends unknown[], R>(generatorFunction : (this : T, ...args : A) => Generator<unknown, R, unknown>) : (this : T, ...args : A) => Promise<R> {
    const { Promise : NativePromise, promiseThen, promiseResolve } = store.intrinsics;
    return function asyncFunction(this : T, ...args : A) : Promise<R> {
        // The context of the call. The body can change it with AsyncLocalStorage.enterWith.
        let frame : Frame = store.current;
        const generator = generatorFunction.apply(this, args);
        return new NativePromise<R>((resolve, reject) => {
            const step = (method : StepMethod, argument : unknown) : void => {
                const previous = store.current;
                store.current = frame;
                let result : IteratorResult<unknown, R>;
                let awaited : Promise<unknown>;
                try {
                    result = method === "next" ? generator.next(argument) : generator.throw(argument);
                    if (result.done) {
                        frame = store.current;
                        store.current = previous;
                        resolve(result.value);
                        return;
                    }
                    // Promise.resolve reads a "then" property of the value. Do it in the context of the body, as await does.
                    awaited = promiseResolve(result.value);
                } catch (error) {
                    store.current = previous;
                    reject(error);
                    return;
                }
                frame = store.current;
                store.current = previous;
                promiseThen.call(awaited, onFulfilled, onRejected);
            };
            const onFulfilled = (value : unknown) : void => step("next", value);
            const onRejected = (error : unknown) : void => step("throw", error);
            step("next", undefined);
        });
    };
}

type AnyIterator = Iterator<unknown, unknown, unknown> | AsyncIterator<unknown, unknown, unknown>;
type ResumeMethod = "next" | "throw" | "return";

/**
 * Binds a generator object to the current context. The body of the generator
 * runs in the context of the call that made the generator, as the TC39
 * proposal specifies (`GeneratorStart` and `GeneratorResume`). After each step,
 * the context of the caller is current again.
 *
 * The preset changes each generator function so that it gives
 * `bindGenerator(generator)`. The function works with sync generators and
 * with the async generators of `@babel/plugin-transform-async-generator-functions`.
 */
export function bindGenerator<I extends AnyIterator>(generator : I) : I {
    let frame : Frame = store.current;
    const target = generator as unknown as Record<ResumeMethod, (argument? : unknown) => unknown>;
    const resume = (method : ResumeMethod, argument : unknown) : unknown => {
        const previous = store.current;
        store.current = frame;
        try {
            return target[method](argument);
        } finally {
            frame = store.current;
            store.current = previous;
        }
    };
    // Inherit from the prototype of the generator, so that Symbol.iterator,
    // Symbol.toStringTag and the iterator helpers stay available.
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
