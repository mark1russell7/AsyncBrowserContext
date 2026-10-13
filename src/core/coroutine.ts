import { createAsyncGenerator, isObject, PlainValue, unbox } from "./async-generator.js";
import { copyNameAndLength } from "./function-name.js";
import { applyQuietly, applyWithHooks, store, type Frame } from "./store.js";

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
 * async function or the async generator. The preset gives the name, because the generator function
 * of Babel has no name. The function sets the name only when a hook operates.
 */
function namedForHooks(generatorFunction : Function, name : string | undefined) : Function {
    if (name !== undefined && generatorFunction.name !== name) {
        Object.defineProperty(generatorFunction, "name", { value : name, configurable : true });
    }
    return generatorFunction;
}

/**
 * This function gives the value that a driver awaits or gives as its result, in place of `value`. It
 * operates in the context of the body, as `await` reads the `then` property there:
 *
 * - A primitive value and a native promise stay the same. `await` does not read a `then`
 *   property of them.
 * - For another object, the function reads `then` one time. A `then` method gets the current
 *   frame for its later call. Thus the method operates in the context of the body, as with
 *   the native `AsyncLocalStorage`. With `box`, an object without a `then` method goes into a
 *   box, so that the engine does not read `then` a second time.
 * - When the read throws, the function gives a rejected promise: the error goes into the body.
 */
function awaitable(value : unknown, NativePromise : PromiseConstructor, box : boolean) : unknown {
    if (!isObject(value)) {
        return value;
    }
    let then : unknown;
    try {
        if (value instanceof NativePromise && value.constructor === NativePromise) {
            return value;
        }
        then = (value as { then? : unknown }).then;
    } catch (error) {
        return new NativePromise((_resolve, reject) => reject(error));
    }
    if (typeof then !== "function") {
        return box ? new PlainValue(value) : value;
    }
    const frame = store.current;
    return {
        then(this : unknown, resolve : unknown, reject : unknown) : unknown {
            const previous = store.current;
            store.current = frame;
            try {
                return Reflect.apply(then, value, [resolve, reject]);
            } finally {
                store.current = previous;
            }
        },
    };
}

/**
 * This function gives an async function that operates `generatorFunction`. The preset gives
 * this function to `@babel/plugin-transform-async-to-generator` as its
 * `method` option, and adds `name`, the name of the async function, if it has one.
 *
 * The first step of the body operates in the step of the caller. Thus an `enterWith()` of that
 * step stays for the caller, as on Node.js.
 */
export function coroutine<T, A extends unknown[], R>(
    generatorFunction : (this : T, ...args : A) => Generator<unknown, R, unknown>,
    name? : string,
) : (this : T, ...args : A) => Promise<R> {
    const NativePromise = store.intrinsics.Promise;
    const asyncFunction = function asyncFunction(this : T, ...args : A) : Promise<R> {
        // The context of the call. The body can change it with AsyncLocalStorage.enterWith.
        let frame : Frame = store.current;
        // An async function that a hook starts does not start the hooks (store.ts, applyQuietly)
        const quiet = store.inHook === true;
        let generator : Generator<unknown, R, unknown>;
        const next = (value : unknown) : IteratorResult<unknown, R> => generator.next(value);
        const throwInto = (error : unknown) : IteratorResult<unknown, R> => generator.throw(error);

        /**
         * This function does one step of the body in the context of the async function. `resumed`
         * is `true` for a step after an `await`. Only these steps start the hook methods. After a
         * resumed step, the function sets the previous context again. The first step operates in
         * the code of the caller, so an `enterWith` of that step stays for the caller, as on
         * Node.js. The function gives the value to await, or the result of the function.
         */
        const step = (resume : (argument : unknown) => IteratorResult<unknown, R>, argument : unknown, resumed : boolean) : IteratorResult<unknown, R> => {
            const previous = store.current;
            store.current = frame;
            try {
                const hooks = resumed && !quiet ? store.hooks : undefined;
                const result = quiet
                    ? applyQuietly(resume, undefined, [argument])
                    : hooks === undefined
                        ? resume(argument)
                        : applyWithHooks(hooks, namedForHooks(generatorFunction, name), "await", resume, undefined, [argument]);
                // The result object is new for each step, so the change is not visible to other code
                (result as { value : unknown }).value = awaitable(result.value, NativePromise, result.done !== true);
                return result;
            } finally {
                frame = store.current;
                store.current = resumed ? previous : frame;
            }
        };

        /**
         * The driver is a native async function: its `await` is faster than a `then` callback,
         * mostly in Firefox. Each `await` takes the same number of microtask turns as the
         * `await` of the source. Between the steps, the context of the caller stays current.
         */
        const drive = async () : Promise<R> => {
            // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
            // Stryker disable next-line all: the directive matters only when a bundler applies the preset to the runtime
            "async-browser-context runtime";
            // In the driver, an error of the parameters rejects the promise, as with a native async function
            generator = Reflect.apply(generatorFunction, this, args);
            let result = step(next, undefined, false);
            while (result.done !== true) {
                let value : unknown;
                try {
                    value = unbox(await result.value);
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
    // Where Babel gives no named wrapper, for example in a class field, the function keeps the name and the length of the source
    copyNameAndLength(asyncFunction, name, generatorFunction.length);
    return asyncFunction;
}

/**
 * This function gives a function that makes an async generator object, which operates
 * `generatorFunction`. The preset gives this function in place of the helper
 * `wrapAsyncGenerator` of `@babel/plugin-transform-async-generator-functions`. It adds `name`,
 * the name of the async generator, if it has one.
 *
 * Each step of the body operates in the context of the call that made the generator
 * (rule C5). The driver continues each step with a native `await` (`async-generator.ts`).
 */
export function asyncGenerator<T, A extends unknown[]>(
    generatorFunction : (this : T, ...args : A) => Generator<unknown, unknown, unknown>,
    name? : string,
) : (this : T, ...args : A) => AsyncGenerator<unknown, unknown, unknown> {
    const NativePromise = store.intrinsics.Promise;
    const makeAsyncGenerator = function makeAsyncGenerator(this : T, ...args : A) : AsyncGenerator<unknown, unknown, unknown> {
        let frame : Frame = store.current;
        // An async generator that a hook makes does not start the hooks (store.ts, applyQuietly)
        const quiet = store.inHook === true;
        const generator = Reflect.apply(generatorFunction, this, args);
        const methods : Record<ResumeMethod, (argument : unknown) => IteratorResult<unknown, unknown>> = {
            next : (argument) => generator.next(argument),
            throw : (argument) => generator.throw(argument),
            return : (argument) => generator.return(argument),
        };
        /** One step of the body in the context of the generator. The result stays the same: `yield*` gives the result of the delegate back. */
        const step = (key : ResumeMethod, argument : unknown, resumed : boolean) : IteratorResult<unknown, unknown> => {
            const previous = store.current;
            store.current = frame;
            try {
                if (quiet) {
                    return applyQuietly(methods[key], undefined, [argument]);
                }
                const hooks = resumed ? store.hooks : undefined;
                return hooks === undefined
                    ? methods[key](argument)
                    : applyWithHooks(hooks, namedForHooks(generatorFunction, name), "await", methods[key], undefined, [argument]);
            } finally {
                frame = store.current;
                store.current = previous;
            }
        };
        /** The value to await, in the context of the generator: `await` and `yield` read the `then` property of an object there. */
        const prepare = (value : unknown) : unknown => {
            const previous = store.current;
            store.current = frame;
            try {
                return awaitable(value, NativePromise, true);
            } finally {
                store.current = previous;
            }
        };
        return createAsyncGenerator(step, NativePromise, undefined, prepare);
    };
    copyNameAndLength(makeAsyncGenerator, name, generatorFunction.length);
    return makeAsyncGenerator;
}

type AnyIterator = Iterator<unknown, unknown, unknown> | AsyncIterator<unknown, unknown, unknown>;
type ResumeMethod = "next" | "throw" | "return";

/**
 * This function binds a generator object to the current context. The body of
 * the generator operates in the context of the call that made the generator, as the TC39
 * proposal specifies (`GeneratorStart` and `GeneratorResume`). After each step,
 * the context of the caller is current again.
 *
 * The preset changes each sync generator function so that it gives
 * `bindGenerator(generator)`. An async generator does not need it, because
 * `asyncGenerator` keeps the context itself. The function also works with
 * async generator objects, for example in the output of older versions.
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
