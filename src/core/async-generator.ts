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
 * step of `yield*`. Each other value is a `yield`.
 */

/**
 * The value that the body gives for an `await` (kind 0) or for a step of `yield*` (kind 1).
 * The Babel helpers `awaitAsyncGenerator` and `asyncGeneratorDelegate` make it with `new`.
 */
export class OverloadYield {
    v : unknown;
    readonly k : 0 | 1;
    constructor(value : unknown, kind : 0 | 1) {
        this.v = value;
        this.k = kind;
    }
}

/** The methods of a generator that a request of the consumer starts. */
export type ResumeKey = "next" | "throw" | "return";

/**
 * This function does one step of the body: `generator[key](argument)`. The browser runtime sets
 * the context of the generator around the step. `resumed` is `true` for a step after an
 * `await` of the driver.
 */
export type AsyncGeneratorStep = (key : ResumeKey, argument : unknown, resumed : boolean) => IteratorResult<unknown, unknown>;

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

function invokeOf(target : object) : Invoke {
    const invoke = (target as { [INVOKE]? : Invoke })[INVOKE];
    if (invoke === undefined) {
        throw new TypeError("The object is not an async generator of async-browser-context");
    }
    return invoke;
}

/** The prototype of the async generator objects of transformed code. */
const AsyncGeneratorPrototype = {
    next(this : object, value? : unknown) : Promise<IteratorResult<unknown, unknown>> {
        return invokeOf(this)("next", value);
    },
    throw(this : object, error? : unknown) : Promise<IteratorResult<unknown, unknown>> {
        return invokeOf(this)("throw", error);
    },
    return(this : object, value? : unknown) : Promise<IteratorResult<unknown, unknown>> {
        return invokeOf(this)("return", value);
    },
    [Symbol.asyncIterator]<T>(this : T) : T {
        return this;
    },
    [Symbol.toStringTag] : "AsyncGenerator",
};

/**
 * This function makes an async generator object. The object queues the requests of the
 * consumer, and starts one request at a time, as the Babel helper does. `enter` starts the
 * driver: the Node.js runtime starts it in the context of the generator.
 */
export function createAsyncGenerator(
    step : AsyncGeneratorStep,
    NativePromise : PromiseConstructor,
    enter : (start : () => Promise<void>) => Promise<void> = (start) => start(),
) : AsyncGenerator<unknown, unknown, unknown> {
    let first : Request | undefined;
    let last : Request | undefined;

    /** This function starts the requests in the queue, one after the other, until the queue is empty. */
    const run = async (key : ResumeKey, argument : unknown) : Promise<void> => {
        // The directive tells the Babel preset not to change this function (src/babel/skip-runtime.ts)
        "async-browser-context runtime";
        let resumed = false;
        for (;;) {
            let failed = false;
            let settled : unknown;
            let done = false;
            try {
                let result = step(key, argument, resumed);
                for (;;) {
                    const yielded : unknown = result.value;
                    const overloaded = yielded instanceof OverloadYield;
                    let value : unknown;
                    try {
                        value = await (overloaded ? yielded.v : yielded);
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
                        value = step(nextKey, value, true).value;
                    }
                    settled = value;
                    done = result.done === true;
                    break;
                }
            } catch (error) {
                failed = true;
                settled = error;
            }
            // A request always waits in the queue while the driver runs
            const request = first as Request;
            first = request.next;
            if (failed) {
                request.reject(settled);
            } else {
                request.resolve({ value : settled, done });
            }
            if (first === undefined) {
                last = undefined;
                return;
            }
            key = first.key;
            argument = first.argument;
        }
    };

    const invoke : Invoke = (key, argument) => new NativePromise((resolve, reject) => {
        const request : Request = { key, argument, resolve, reject, next : undefined };
        if (last === undefined) {
            first = last = request;
            void enter(() => run(key, argument));
        } else {
            last = last.next = request;
        }
    });

    const generator = Object.create(AsyncGeneratorPrototype) as AsyncGenerator<unknown, unknown, unknown>;
    Object.defineProperty(generator, INVOKE, { value : invoke });
    return generator;
}
