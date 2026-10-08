/**
 * The context store. It holds the current frame, the original functions of
 * the patches, and the native functions that the runtime uses.
 *
 * A frame identifies one context. Each `run()` call makes a frame that sets
 * one variable. The frame keeps the variable and the value in private fields,
 * so code that gets a frame cannot read the value.
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
    /** The frame of the code that operates at this time. */
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

/** This function makes `frame` the current frame. It gives the frame that was current before. */
export function enter(frame : Frame) : Frame {
    const previous = store.current;
    store.current = frame;
    return previous;
}

/** The result of `findValue` when no frame sets the variable. */
export const NOT_FOUND : unique symbol = Symbol("not found");

/**
 * A frame that sets the value of one variable. The variable and the value are
 * private fields, so only this module can read them. A frame of another copy
 * of the library is an instance of another class. Thus, `#variable in frame`
 * is `false` for it, and the search continues to its parent.
 */
class ValueFrame implements Frame {
    readonly parent : Frame;
    readonly #variable : object;
    readonly #value : unknown;
    /**
     * The result of the last search for another variable from this frame. A
     * frame does not change, so the result stays correct. The cached value
     * comes from a parent frame, so the cache keeps no other object in memory.
     */
    #cachedVariable : object | undefined = undefined;
    #cachedValue : unknown = undefined;

    constructor(parent : Frame, variable : object, value : unknown) {
        this.parent = parent;
        this.#variable = variable;
        this.#value = value;
    }

    /** This method gives the value that the nearest frame sets for `variable`, or `NOT_FOUND`. */
    static find(start : Frame, variable : object) : unknown {
        if (!(#variable in start)) {
            return ValueFrame.#search(start, variable);
        }
        if (start.#variable === variable) {
            return start.#value;
        }
        if (start.#cachedVariable === variable) {
            return start.#cachedValue;
        }
        const value = ValueFrame.#search(start.parent, variable);
        start.#cachedVariable = variable;
        start.#cachedValue = value;
        return value;
    }

    static #search(start : Frame | null, variable : object) : unknown {
        for (let frame = start; frame !== null; frame = frame.parent) {
            if (#variable in frame && frame.#variable === variable) {
                return frame.#value;
            }
        }
        return NOT_FOUND;
    }
}

/** This function makes a new frame that has `parent` as its parent and sets `variable` to `value`. */
export function createFrame(parent : Frame, variable : object, value : unknown) : Frame {
    return new ValueFrame(parent, variable, value);
}

/** This function gives the value of `variable` in `frame`, or `NOT_FOUND` if no frame sets it. */
export function findValue(frame : Frame, variable : object) : unknown {
    return ValueFrame.find(frame, variable);
}

/**
 * This function wraps `fn`. The wrapper starts `fn` in `frame`, with the `this`
 * value and the arguments of the call. After `fn` ends, also with an error, the
 * previous frame is current again.
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
 * This function wraps a callback that gets one argument, for example a `then` callback. This
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
