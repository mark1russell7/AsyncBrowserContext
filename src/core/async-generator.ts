/**
 * The async generators of transformed code. `@babel/plugin-transform-async-generator-functions`
 * changes each async generator into a sync generator and its helper `wrapAsyncGenerator`.
 * The helper continued each step in a `then` callback, and a `then` callback is slow in
 * Firefox. The preset replaces the helper with `asyncGenerator` of the runtime. It also takes
 * the helpers `OverloadYield`, `awaitAsyncGenerator` and `asyncGeneratorDelegate` from this
 * module. The driver in this module then continues each step with a native `await`.
 *
 * The protocol is the protocol of the Babel 8 helper: the body gives
 * `new OverloadYield(value, 0)` for an `await`, and `new OverloadYield(promise, 1)` for a
 * step of `yield*`. Each other value is a `yield`. Where the helper differs from a native async
 * generator, the driver does as the native generator. Thus `return()` at a `yield` awaits its
 * value first, and a request on a complete generator settles at once. The delegate of this
 * module also gives kind 2 for a step of `yield*` after `return()`.
 */

/** The Promise of the time when the module loads, for the rejections of the methods. */
const NativePromise : PromiseConstructor = Promise;

/**
 * The value that the body gives for an `await` (kind 0), for a step of `yield*` (kind 1), or
 * for a step of `yield*` after `return()` (kind 2). The helpers `awaitAsyncGenerator` and
 * `asyncGeneratorDelegate` make it with `new`.
 */
export class OverloadYield {
    readonly v : unknown;
    readonly k : 0 | 1 | 2;
    constructor(value : unknown, kind : 0 | 1 | 2) {
        this.v = value;
        this.k = kind;
    }
}

/**
 * The error of a step of `yield*` that was rejected. The driver gives it back to the delegate,
 * and the delegate throws the error. Thus the error goes into the body at the `yield*`, also
 * when the delegate has no `throw` method.
 */
class DelegateRejection {
    readonly error : unknown;
    constructor(error : unknown) {
        this.error = error;
    }
}

/**
 * The helper `awaitAsyncGenerator` of Babel: the body gives its value for an `await`. The preset
 * gives this function in place of the helper of Babel. Thus the marker is always the class of this
 * module, also when `@babel/plugin-transform-runtime` gives the other helpers.
 */
export function awaitAsyncGenerator(value : unknown) : OverloadYield {
    return new OverloadYield(value, 0);
}

/**
 * The helper `asyncGeneratorDelegate` of Babel 8: a sync iterator for `yield*` in an async
 * generator. Each step of the inner async iterator becomes `new OverloadYield(promise, 1)`, or
 * kind 2 after `return()`. The driver awaits the promise, and gives a copy of its result back to
 * the iterator. After kind 2, the driver gives it back with `return()`. Thus a complete inner
 * iterator ends the body, as with a native `yield*`.
 */
export function asyncGeneratorDelegate(inner : AsyncIterator<unknown, unknown, unknown>) : Iterator<unknown, unknown, unknown> {
    const iterator = inner as unknown as Record<ResumeKey, ((value : unknown) => unknown) | undefined>;
    let waiting = false;
    const pump = (key : ResumeKey, value : unknown) : IteratorResult<unknown, unknown> => {
        waiting = true;
        const promise = new NativePromise((resolve) => {
            resolve(Reflect.apply(iterator[key] as (value : unknown) => unknown, inner, [value]));
        });
        return { done : false, value : new OverloadYield(promise, key === "return" ? 2 : 1) };
    };
    const delegate : Record<PropertyKey, unknown> = {
        [Symbol.iterator]() { return this; },
        next(value : unknown) : unknown {
            if (!waiting) {
                return pump("next", value);
            }
            waiting = false;
            if (value instanceof DelegateRejection) {
                throw value.error;
            }
            return value;
        },
    };
    delegate["throw"] = (value : unknown) : unknown => {
        if (typeof iterator.throw === "function") {
            return pump("throw", value);
        }
        // Without a throw method, a native yield* closes the inner iterator and awaits its return()
        // (AsyncIteratorClose). An error of return() goes into the body, else a TypeError.
        waiting = true;
        const closed = new NativePromise<never>((resolve) => {
            resolve(typeof iterator.return === "function" ? Reflect.apply(iterator.return, inner, []) : undefined);
        }).then((result : unknown) : never => {
            if (typeof iterator.return === "function" && !isObject(result)) {
                throw new TypeError("The result of return() of the iterator of yield* is not an object");
            }
            throw new TypeError("The iterator of yield* has no throw method");
        });
        return { done : false, value : new OverloadYield(closed, 1) };
    };
    if (typeof iterator.return === "function") {
        delegate["return"] = (value : unknown) : unknown => {
            if (waiting) {
                waiting = false;
                return value;
            }
            return pump("return", value);
        };
    }
    return delegate as unknown as Iterator<unknown, unknown, unknown>;
}

/**
 * A value that is not a thenable, in a box. The browser runtime reads the `then` property of an
 * awaited object one time, in the context of the body. When the object has no `then` method,
 * the driver awaits the box. Thus the engine does not read `then` a second time, and the
 * `await` takes the same microtask turns.
 */
export class PlainValue {
    readonly value : unknown;
    constructor(value : unknown) {
        this.value = value;
    }
}

/** This function gives the value in a box, or the value itself. */
export function unbox(value : unknown) : unknown {
    return value instanceof PlainValue ? value.value : value;
}

/** This function gives `true` for a value that can have properties: an object or a function. */
export function isObject(value : unknown) : value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

/** The methods of a generator that a request of the consumer starts. */
export type ResumeKey = "next" | "throw" | "return";

/**
 * This function does one step of the body: `generator[key](argument)`. The browser runtime sets
 * the context of the generator around the step. `resumed` is `true` for a step after an
 * `await` of the driver. The function gives the result of the generator without a change.
 */
export type AsyncGeneratorStep = (key : ResumeKey, argument : unknown, resumed : boolean) => IteratorResult<unknown, unknown>;

/**
 * This function gives the value that the driver awaits in place of `value`. The browser runtime
 * reads the `then` property in the context of the generator. The Node.js runtime gives the
 * value without a change.
 */
export type Prepare = (value : unknown) => unknown;

interface Request {
    readonly key : ResumeKey;
    readonly argument : unknown;
    readonly resolve : (result : IteratorResult<unknown, unknown>) => void;
    readonly reject : (error : unknown) => void;
    next : Request | undefined;
}

type Invoke = (key : ResumeKey, argument : unknown) => Promise<IteratorResult<unknown, unknown>>;

/** The key of the request function of each async generator object. */
const INVOKE : unique symbol = Symbol("async-browser-context/invoke");

/** This function starts a request. For an object that is not an async generator of the runtime, it gives a rejected promise, as a native method does. */
function request(target : unknown, key : ResumeKey, argument : unknown) : Promise<IteratorResult<unknown, unknown>> {
    const invoke = typeof target === "object" && target !== null ? (target as { [INVOKE]? : Invoke })[INVOKE] : undefined;
    if (invoke === undefined) {
        return NativePromise.reject(new TypeError(`AsyncGenerator.prototype.${key} started on an object that is not an async generator`));
    }
    return invoke(key, argument);
}

/**
 * This function gives %AsyncIteratorPrototype% of the engine from an async generator function.
 * The prototype gives `Symbol.asyncIterator`, `Symbol.asyncDispose` and the async iterator
 * helpers. If a compiler changed the async generator function, the function gives `undefined`.
 *
 * @internal
 */
export function asyncIteratorPrototypeOf(generatorFunction : Function) : object | undefined {
    let prototype : Record<symbol, unknown> | null;
    try {
        prototype = Object.getPrototypeOf(Object.getPrototypeOf(generatorFunction.prototype) as object) as Record<symbol, unknown> | null;
    } catch {
        // A function without a prototype object, for example an arrow function
        return undefined;
    }
    return prototype !== null && typeof prototype[Symbol.asyncIterator] === "function" ? prototype : undefined;
}

/**
 * This function makes the prototype of the async generator objects of transformed code. Its
 * methods are not enumerable, as native methods. Without `parent`, the prototype inherits from
 * `Object.prototype` and gets its own `Symbol.asyncIterator` method.
 *
 * @internal
 */
export function makeAsyncGeneratorPrototype(parent : object | undefined) : object {
    const prototype = Object.create(parent ?? Object.prototype) as object;
    const methods : Record<ResumeKey, (this : unknown, argument? : unknown) => Promise<IteratorResult<unknown, unknown>>> = {
        next(value) { return request(this, "next", value); },
        throw(error) { return request(this, "throw", error); },
        return(value) { return request(this, "return", value); },
    };
    for (const key of ["next", "throw", "return"] as const) {
        Object.defineProperty(prototype, key, { value : methods[key], writable : true, configurable : true });
    }
    if (parent === undefined) {
        Object.defineProperty(prototype, Symbol.asyncIterator, { value : function asyncIterator(this : unknown) { return this; }, writable : true, configurable : true });
    }
    Object.defineProperty(prototype, Symbol.toStringTag, { value : "AsyncGenerator", configurable : true });
    return prototype;
}

/**
 * This function gives %AsyncIteratorPrototype% of the engine, or `undefined`. Another preset in
 * the same Babel configuration, for example `next/babel` with its preset-env, can change the
 * async generator below in the runtime itself. Its helper is then a module that loads at this
 * time, and the call can throw. The catch keeps the runtime available, with a prototype
 * without the parent of the engine.
 */
function engineAsyncIteratorPrototype() : object | undefined {
    try {
        return asyncIteratorPrototypeOf(async function* () {
            // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
            // Stryker disable next-line all: the directive matters only when a bundler applies the preset to the runtime
            "async-browser-context runtime";
        });
    } catch {
        return undefined;
    }
}

/** The prototype of the async generator objects of transformed code. */
const AsyncGeneratorPrototype : object = makeAsyncGeneratorPrototype(engineAsyncIteratorPrototype());

/**
 * This function makes an async generator object. The object queues the requests of the
 * consumer, and starts one request at a time, as a native async generator does. `enter`
 * starts the driver: the Node.js runtime starts it in the context of the generator.
 */
export function createAsyncGenerator(
    step : AsyncGeneratorStep,
    PromiseConstructor : PromiseConstructor,
    enter : (start : () => Promise<void>) => Promise<void> = (start) => start(),
    prepare : Prepare = (value) => value,
) : AsyncGenerator<unknown, unknown, unknown> {
    let first : Request | undefined;
    let last : Request | undefined;
    /** `true` after the first step of the body. While a step operates, the requests wait in the queue. */
    let started = false;
    /** `true` when the body is complete. */
    let complete = false;

    /** This function starts the requests in the queue, one after the other, until the queue is empty. */
    const run = async (key : ResumeKey, argument : unknown) : Promise<void> => {
        // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
        // Stryker disable next-line all: the directive matters only when a bundler applies the preset to the runtime
        "async-browser-context runtime";
        let resumed = false;
        for (;;) {
            let failed = false;
            let settled : unknown;
            try {
                if (complete || (!started && key !== "next")) {
                    // The body does not operate: it is complete, or return() or throw() came before the start
                    complete = true;
                    if (key === "throw") {
                        throw argument;
                    }
                    if (key === "return") {
                        // As AsyncGeneratorAwaitReturn, return() awaits its value
                        settled = await argument;
                    }
                } else {
                    started = true;
                    if (key === "return") {
                        // At a yield, return() awaits its value first. A rejection goes into the body at the yield.
                        try {
                            argument = unbox(await prepare(argument));
                        } catch (error) {
                            key = "throw";
                            argument = error;
                        }
                        resumed = true;
                    }
                    let result = step(key, argument, resumed);
                    // return() at a yield already awaited its value. If the body completes with that value, a native generator does not await it again.
                    if (key === "return" && result.done === true && result.value === argument) {
                        settled = argument;
                        complete = true;
                        result = { done : true, value : undefined };
                    }
                    for (;;) {
                        if (complete) {
                            break;
                        }
                        const yielded : unknown = result.value;
                        const overloaded = yielded instanceof OverloadYield;
                        let value : unknown;
                        try {
                            value = unbox(await prepare(overloaded ? yielded.v : yielded));
                        } catch (error) {
                            // The error goes into the body at the await or the yield. The delegate of a yield* throws it.
                            result = overloaded && yielded.k !== 0 ? step("next", new DelegateRejection(error), true) : step("throw", error, true);
                            continue;
                        }
                        resumed = true;
                        if (overloaded) {
                            const resumeKey : ResumeKey = yielded.k === 2 ? "return" : "next";
                            if (yielded.k === 0 || !isObject(value)) {
                                // The value of an await. For a result of yield* that is not an object, the body throws a TypeError.
                                result = step(resumeKey, value, true);
                                continue;
                            }
                            // A step of yield*. As a native yield*, the driver reads done and value one time, and the body gets a copy.
                            // The driver does not compare the result of the body with the copy, because the yield* of WebKit makes a new object.
                            const done = Boolean((value as { done? : unknown }).done);
                            const item = (value as { value? : unknown }).value;
                            result = step(resumeKey, { value : item, done }, true);
                            if (done) {
                                continue;
                            }
                            // The body gives the result back. Its value is not awaited, as with a native yield*.
                            value = item;
                        }
                        settled = value;
                        complete = result.done === true;
                        break;
                    }
                }
            } catch (error) {
                complete = true;
                failed = true;
                settled = error;
            }
            // A request always waits in the queue while the driver runs
            const current = first as Request;
            first = current.next;
            if (failed) {
                current.reject(settled);
            } else {
                current.resolve({ value : settled, done : complete });
            }
            if (first === undefined) {
                last = undefined;
                return;
            }
            key = first.key;
            argument = first.argument;
        }
    };

    const invoke : Invoke = (key, argument) => new PromiseConstructor((resolve, reject) => {
        const added : Request = { key, argument, resolve, reject, next : undefined };
        if (last === undefined) {
            first = last = added;
            void enter(() => run(key, argument));
        } else {
            last = last.next = added;
        }
    });

    const generator = Object.create(AsyncGeneratorPrototype) as AsyncGenerator<unknown, unknown, unknown>;
    Object.defineProperty(generator, INVOKE, { value : invoke });
    return generator;
}
