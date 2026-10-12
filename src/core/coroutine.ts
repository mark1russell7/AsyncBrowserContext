import { applyWithHooks, store, type Frame } from "./store.js";

/**
 * The code from the Babel preset uses these runtime functions. Do not use them
 * directly.
 *
 * Each async function becomes a generator function, and `coroutine` operates it.
 * Each `await` becomes a `yield`. Before each step of the generator,
 * `coroutine` sets the context of the async function. After the step, it sets
 * the previous context again. Thus, the context is correct after each `await`,
 * also in the same expression, and no other code gets this context.
 */

/**
 * This function gives the generator function to the callback hooks, with the name of the
 * async function. The preset gives the name, because the generator function
 * of Babel has no name. The function sets the name only when a hook operates.
 */
function namedForHooks(generatorFunction : Function, name : string | undefined) : Function {
    if (name !== undefined && generatorFunction.name !== name) {
        Object.defineProperty(generatorFunction, "name", { value : name, configurable : true });
    }
    return generatorFunction;
}

/**
 * This function gives an async function that operates `generatorFunction`. The preset gives
 * this function to `@babel/plugin-transform-async-to-generator` as its
 * `method` option, and adds `name`, the name of the async function, if it has one.
 */
export function coroutine<T, A extends unknown[], R>(
    generatorFunction : (this : T, ...args : A) => Generator<unknown, R, unknown>,
    name? : string,
) : (this : T, ...args : A) => Promise<R> {
    const { promiseResolve } = store.intrinsics;
    return function asyncFunction(this : T, ...args : A) : Promise<R> {
        // The context of the call. The body can change it with AsyncLocalStorage.enterWith.
        let frame : Frame = store.current;
        let generator : Generator<unknown, R, unknown>;
        const next = (value : unknown) : IteratorResult<unknown, R> => generator.next(value);
        const throwInto = (error : unknown) : IteratorResult<unknown, R> => generator.throw(error);

        /**
         * This function does one step of the body in the context of the async function, and sets
         * the previous context again. `resumed` is `true` for a step after an `await`. Only these
         * steps start the hook methods. The function gives the value to await.
         */
        const step = (resume : (argument : unknown) => IteratorResult<unknown, R>, argument : unknown, resumed : boolean) : IteratorResult<unknown, R> => {
            const previous = store.current;
            store.current = frame;
            try {
                const hooks = resumed ? store.hooks : undefined;
                const result = hooks === undefined
                    ? resume(argument)
                    : applyWithHooks(hooks, namedForHooks(generatorFunction, name), "await", resume, undefined, [argument]);
                const value : unknown = result.value;
                if (!result.done && ((typeof value === "object" && value !== null) || typeof value === "function")) {
                    // Promise.resolve reads the "then" property of an object. Do it in the context of the body, as await does.
                    // The result object is new for each step, so the change is not visible to other code.
                    (result as { value : unknown }).value = promiseResolve(value);
                }
                return result;
            } finally {
                frame = store.current;
                store.current = previous;
            }
        };

        /**
         * The driver is a native async function: its `await` is faster than a `then` callback,
         * mostly in Firefox. Each `await` takes the same number of microtask turns as the
         * `await` of the source. Between the steps, the context of the caller stays current.
         */
        const drive = async () : Promise<R> => {
            // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
            "async-browser-context runtime";
            // In the driver, an error of the parameters rejects the promise, as with a native async function
            generator = generatorFunction.apply(this, args);
            let result = step(next, undefined, false);
            while (result.done !== true) {
                let value : unknown;
                try {
                    value = await result.value;
                } catch (error) {
                    result = step(throwInto, error, true);
                    continue;
                }
                result = step(next, value, true);
            }
            return result.value;
        };
        return drive();
    };
}

type AnyIterator = Iterator<unknown, unknown, unknown> | AsyncIterator<unknown, unknown, unknown>;
type ResumeMethod = "next" | "throw" | "return";

/**
 * This function binds a generator object to the current context. The body of
 * the generator operates in the context of the call that made the generator, as the TC39
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
