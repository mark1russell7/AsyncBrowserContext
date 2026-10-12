/**
 * The runtime of transformed code on Node.js. On Node.js, the native
 * `AsyncLocalStorage` keeps the context through promises, so `coroutine` is
 * a plain driver of the generator. `bindGenerator` keeps the context of the
 * generator creation (rule C5), with an `AsyncResource`.
 *
 * An `AsyncResource` records the context as `AsyncLocalStorage.snapshot()` does,
 * but at a much lower cost. `snapshot()` is `AsyncResource.bind()`, which also
 * defines properties on a new function (approximately 3 µs against 30 ns on
 * Node.js 24). The drivers record the context again after each step.
 *
 * @packageDocumentation
 */
import { AsyncResource } from "node:async_hooks";
import { createAsyncGenerator, type ResumeKey } from "../core/async-generator.js";
import { copyNameAndLength } from "../core/function-name.js";

export { asyncGeneratorDelegate, awaitAsyncGenerator, OverloadYield } from "../core/async-generator.js";

/** The type of the async resources of the generators, for async_hooks. */
const RESOURCE_TYPE = "async-browser-context:generator";

/**
 * This function gives an async function that operates `generatorFunction`. The function is
 * a native async function: each `await` of the source becomes one native `await`, with
 * the same microtask turns. An error of the parameters rejects the promise. The function has the
 * name and the length of the source, as in the browser runtime.
 */
export function coroutine<T, A extends unknown[], R>(
    generatorFunction : (this : T, ...args : A) => Generator<unknown, R, unknown>,
    name? : string,
) : (this : T, ...args : A) => Promise<R> {
    const asyncFunction = async function asyncFunction(this : T, ...args : A) : Promise<R> {
        // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
        "async-browser-context runtime";
        const generator = generatorFunction.apply(this, args);
        let result = generator.next();
        while (result.done !== true) {
            let value : unknown;
            try {
                value = await result.value;
            } catch (error) {
                result = generator.throw(error);
                continue;
            }
            result = generator.next(value);
        }
        return result.value;
    };
    copyNameAndLength(asyncFunction, name, generatorFunction.length);
    return asyncFunction;
}

/**
 * This function gives a function that makes an async generator object, which operates
 * `generatorFunction`. The preset gives it in place of the helper `wrapAsyncGenerator` of
 * Babel. The driver starts in the context of the creation (rule C5). The native
 * `AsyncLocalStorage` keeps that context through the `await` of the driver.
 */
export function asyncGenerator<T, A extends unknown[]>(
    generatorFunction : (this : T, ...args : A) => Generator<unknown, unknown, unknown>,
    name? : string,
) : (this : T, ...args : A) => AsyncGenerator<unknown, unknown, unknown> {
    const makeAsyncGenerator = function makeAsyncGenerator(this : T, ...args : A) : AsyncGenerator<unknown, unknown, unknown> {
        let context = new AsyncResource(RESOURCE_TYPE);
        const generator = generatorFunction.apply(this, args);
        const step = (key : ResumeKey, argument : unknown) : IteratorResult<unknown, unknown> => {
            try {
                return generator[key](argument);
            } finally {
                // The body can change its context with enterWith before it stops
                context = new AsyncResource(RESOURCE_TYPE);
            }
        };
        return createAsyncGenerator(step, Promise, (start) => context.runInAsyncScope(start));
    };
    copyNameAndLength(makeAsyncGenerator, name, generatorFunction.length);
    return makeAsyncGenerator;
}

type AnyIterator = Iterator<unknown, unknown, unknown> | AsyncIterator<unknown, unknown, unknown>;
type ResumeMethod = "next" | "throw" | "return";

/** This function binds a generator object to the current context (rule C5). */
export function bindGenerator<I extends AnyIterator>(generator : I) : I {
    let context = new AsyncResource(RESOURCE_TYPE);
    const target = generator as unknown as Record<ResumeMethod, (argument? : unknown) => unknown>;
    const resume = (method : ResumeMethod, argument : unknown) : unknown => context.runInAsyncScope(() => {
        try {
            return target[method](argument);
        } finally {
            // The body can change its context with enterWith before it stops
            context = new AsyncResource(RESOURCE_TYPE);
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
