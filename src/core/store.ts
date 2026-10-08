/**
 * The context store. It holds the current frame, the original functions of
 * the patches, and the native functions that the runtime uses.
 *
 * A frame identifies one context. A frame does not contain values. Each
 * `Variable` keeps its values in its own private `WeakMap`, with the frame as
 * the key. Thus, code that gets a frame cannot read the values of a variable.
 *
 * The store is a property of `globalThis` with a `Symbol.for` key. When a page
 * contains two copies of the library, the two copies use the same store, and
 * thus the same contexts.
 */

/** One context. Only the root frame has no parent. */
export interface Frame {
    readonly parent : Frame | null;
}

/** The native functions that the runtime uses. The store records them before a patch replaces them. */
export interface Intrinsics {
    readonly Promise : PromiseConstructor;
    readonly promiseThen : typeof Promise.prototype.then;
    readonly promiseResolve : <T>(value : T) => Promise<Awaited<T>>;
    readonly functionToString : () => string;
}

export interface ContextStore {
    /** The frame of the code that runs now. */
    current : Frame;
    /** The frame with no values. */
    readonly root : Frame;
    /** The names of the installed patches. Each patch is installed one time for each global object. */
    readonly patches : Set<string>;
    /** The original function of each patched function. `Function.prototype.toString` shows the original. */
    readonly originals : WeakMap<object, object>;
    readonly intrinsics : Intrinsics;
}

/** The key of the store on `globalThis`. The version changes when the store format changes. */
const STORE_KEY : symbol = Symbol.for("async-browser-context/store/v1");

function createStore() : ContextStore {
    const NativePromise = Promise;
    const root : Frame = Object.freeze({ parent : null });
    return {
        current : root,
        root,
        patches : new Set(),
        originals : new WeakMap(),
        intrinsics : Object.freeze({
            Promise : NativePromise,
            promiseThen : NativePromise.prototype.then,
            promiseResolve : NativePromise.resolve.bind(NativePromise) as Intrinsics["promiseResolve"],
            functionToString : Function.prototype.toString,
        }),
    };
}

function getOrCreateStore() : ContextStore {
    const holder = globalThis as unknown as Record<symbol, ContextStore | undefined>;
    const existing = holder[STORE_KEY];
    if (existing !== undefined) {
        return existing;
    }
    const created = createStore();
    Object.defineProperty(globalThis, STORE_KEY, { value : created, writable : false, enumerable : false, configurable : false });
    return created;
}

/** The store of this global object. */
export const store : ContextStore = getOrCreateStore();

/** Makes `frame` the current frame. Returns the frame that was current before. */
export function enter(frame : Frame) : Frame {
    const previous = store.current;
    store.current = frame;
    return previous;
}

/** Makes a new frame that has `parent` as its parent. */
export function createFrame(parent : Frame) : Frame {
    return Object.freeze({ parent });
}

/**
 * Wraps `fn`. The wrapper runs `fn` in `frame`, with the `this` value and the
 * arguments of the call. After `fn` returns or throws, the previous frame is
 * current again.
 */
export function bindToFrame<T, A extends unknown[], R>(frame : Frame, fn : (this : T, ...args : A) => R) : (this : T, ...args : A) => R {
    return function boundToFrame(this : T, ...args : A) : R {
        const previous = store.current;
        store.current = frame;
        try {
            return fn.apply(this, args);
        } finally {
            store.current = previous;
        }
    };
}

/**
 * Wraps a callback that gets one argument, for example a `then` callback. This
 * wrapper does not make an array of the arguments, so it is faster than
 * `bindToFrame` on the hot path.
 */
export function bindOneArgument<T, A, R>(frame : Frame, fn : (this : T, argument : A) => R) : (this : T, argument : A) => R {
    return function boundToFrame(this : T, argument : A) : R {
        const previous = store.current;
        store.current = frame;
        try {
            return fn.call(this, argument);
        } finally {
            store.current = previous;
        }
    };
}
