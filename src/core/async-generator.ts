/**
 * The async generators of transformed code. `@babel/plugin-transform-async-generator-functions`
 * changes each async generator into a sync generator and its helper `wrapAsyncGenerator`.
 * The helper continued each step in a `then` callback, and a `then` callback is slow in
 * Firefox. The preset replaces the helper with `asyncGenerator` of the runtime, and the
 * helper `OverloadYield` with the class of this module. The driver in this module then
 * continues each step with a native `await`.
 *
 * The protocol is the protocol of the Babel 8 helper: the body gives
 * `new OverloadYield(value, 0)` for an `await`, and `new OverloadYield(promise, 1)` for a
 * step of `yield*`. Each other value is a `yield`. Where the helper differs from a native async
 * generator, the driver does as the native generator. Thus `return()` at a `yield` awaits its
 * value first, and a request on a complete generator settles at once.
 */

/** The Promise of the time when the module loads, for the rejections of the methods. */
const NativePromise : PromiseConstructor = Promise;

/**
 * The value that the body gives for an `await` (kind 0) or for a step of `yield*` (kind 1).
 * The Babel helpers `awaitAsyncGenerator` and `asyncGeneratorDelegate` make it with `new`.
 */
export class OverloadYield {
    readonly v : unknown;
    readonly k : 0 | 1;
    constructor(value : unknown, kind : 0 | 1) {
        this.v = value;
        this.k = kind;
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
 * generator. Each step of the inner async iterator becomes `new OverloadYield(promise, 1)`.
 * The driver awaits the promise, and gives its result back to the iterator.
 */
export function asyncGeneratorDelegate(inner : AsyncIterator<unknown, unknown, unknown>) : Iterator<unknown, unknown, unknown> {
    const iterator = inner as unknown as Record<ResumeKey, ((value : unknown) => unknown) | undefined>;
    let waiting = false;
    const pump = (key : ResumeKey, value : unknown) : IteratorResult<unknown, unknown> => {
        waiting = true;
        const promise = new NativePromise((resolve) => {
            resolve(Reflect.apply(iterator[key] as (value : unknown) => unknown, inner, [value]));
        });
        return { done : false, value : new OverloadYield(promise, 1) };
    };
    const delegate : Record<PropertyKey, unknown> = {
        [Symbol.iterator]() { return this; },
        next(value : unknown) : unknown {
            if (waiting) {
                waiting = false;
                return value;
            }
            return pump("next", value);
        },
    };
    if (typeof iterator.throw === "function") {
        delegate["throw"] = (value : unknown) : unknown => {
            if (waiting) {
                waiting = false;
                throw value;
            }
            return pump("throw", value);
        };
    }
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
 * This function gives %AsyncIteratorPrototype% of the engine, which gives `Symbol.asyncIterator`,
 * `Symbol.asyncDispose` and the async iterator helpers. If a compiler changed the async
 * generator below, the function gives `undefined`.
 */
function asyncIteratorPrototype() : object | undefined {
    try {
        const generatorFunction = async function* () {
            // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
            // Stryker disable next-line all: the directive matters only when a bundler applies the preset to the runtime
            "async-browser-context runtime";
        };
        const prototype = Object.getPrototypeOf(Object.getPrototypeOf(generatorFunction.prototype) as object) as Record<symbol, unknown> | null;
        return prototype !== null && typeof prototype[Symbol.asyncIterator] === "function" ? prototype : undefined;
    } catch {
        return undefined;
    }
}

/** The prototype of the async generator objects of transformed code. Its methods are not enumerable, as native methods. */
const AsyncGeneratorPrototype : object = (() => {
    const parent = asyncIteratorPrototype();
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
})();

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
    /** The state of the body: not started, suspended at a `yield`, or complete. While a step operates, the requests wait in the queue. */
    let state : "start" | "yield" | "done" = "start";

    /** This function starts the requests in the queue, one after the other, until the queue is empty. */
    const run = async (key : ResumeKey, argument : unknown) : Promise<void> => {
        // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
        // Stryker disable next-line all: the directive matters only when a bundler applies the preset to the runtime
        "async-browser-context runtime";
        let resumed = false;
        for (;;) {
            let failed = false;
            let settled : unknown;
            let done = false;
            try {
                if (state === "done" || (state === "start" && key !== "next")) {
                    // The body does not operate: it is complete, or return() or throw() came before the start
                    state = "done";
                    done = true;
                    if (key === "throw") {
                        throw argument;
                    }
                    if (key === "return") {
                        // As AsyncGeneratorAwaitReturn, return() awaits its value
                        settled = await argument;
                    }
                } else {
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
                    for (;;) {
                        const yielded : unknown = result.value;
                        const overloaded = yielded instanceof OverloadYield;
                        let value : unknown;
                        try {
                            value = unbox(await prepare(overloaded ? yielded.v : yielded));
                        } catch (error) {
                            resumed = true;
                            key = "throw";
                            result = step("throw", error, true);
                            continue;
                        }
                        resumed = true;
                        if (overloaded) {
                            const nextKey : ResumeKey = key === "return" && yielded.k === 1 ? "return" : "next";
                            if (yielded.k === 0 || Boolean((value as { done? : unknown }).done)) {
                                key = nextKey;
                                result = step(nextKey, value, true);
                                continue;
                            }
                            // A step of yield*: the body gives the result of the delegate back without a change.
                            // Its value is not awaited, as with a native yield*.
                            const passed = step(nextKey, value, true);
                            if (passed !== value) {
                                result = passed;
                                continue;
                            }
                            value = passed.value;
                        }
                        settled = value;
                        done = result.done === true;
                        break;
                    }
                    state = done ? "done" : "yield";
                }
            } catch (error) {
                state = "done";
                failed = true;
                settled = error;
            }
            // A request always waits in the queue while the driver runs
            const current = first as Request;
            first = current.next;
            if (failed) {
                current.reject(settled);
            } else {
                current.resolve({ value : settled, done });
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
