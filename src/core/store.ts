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
    /**
     * The callback hooks (`addCallbackHook`), or `undefined` if there are none. Each change
     * makes a new array. The store of an older copy of the library does not
     * have this property.
     */
    hooks? : readonly HookEntry[] | undefined;
    /** `true` while a hook operates. Callbacks that start in a hook do not start the hook methods. */
    inHook? : boolean | undefined;
}

/** The methods of a callback hook. The public type is `CallbackHook` in `hooks.ts`. */
export interface HookMethods {
    before?(callback : Function, source : string) : void;
    after?(callback : Function, source : string) : void;
}

/** One registration of a hook. Each `addCallbackHook` call makes a new entry. */
export interface HookEntry {
    readonly hook : HookMethods;
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
        // Own properties from the start: each callback reads `hooks`, and the read of an own property is faster
        hooks : undefined,
        inHook : false,
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
        // Stryker disable next-line ConditionalExpression: a search without the cache gives the same result, only slower
        if (!(#variable in start)) {
            return ValueFrame.#search(start, variable);
        }
        if (start.#variable === variable) {
            return start.#value;
        }
        // Stryker disable next-line ConditionalExpression,BlockStatement: a search without the cache gives the same result, only slower
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

/** This function gives the error of a hook to the host. A hook error does not stop the callback. */
function reportHookError(error : unknown) : void {
    const report = (globalThis as { reportError? : unknown }).reportError;
    if (typeof report === "function") {
        (report as (error : unknown) => void)(error);
        return;
    }
    console.error(error);
}

/**
 * This function starts one method of each hook. `before` uses the order of
 * registration, and `after` uses the opposite order. Each hook operates in
 * the current frame, and a hook cannot change the frame of the callback.
 */
function callHooks(hooks : readonly HookEntry[], phase : "before" | "after", callback : Function, source : string) : void {
    const frame = store.current;
    store.inHook = true;
    try {
        const count = hooks.length;
        for (let step = 0; step < count; step++) {
            const { hook } = hooks[phase === "before" ? step : count - 1 - step] as HookEntry;
            const method = hook[phase];
            if (typeof method !== "function") {
                continue;
            }
            try {
                method.call(hook, callback, source);
            } catch (error) {
                reportHookError(error);
            }
            store.current = frame;
        }
    } finally {
        store.inHook = false;
    }
}

/**
 * This function starts `fn` between the `before` and the `after` methods of
 * the hooks. The current frame must be the frame of the callback. The hooks
 * get `callback` and `source`. A callback that starts in a hook does not start
 * the hooks again.
 */
export function applyWithHooks<T, A extends unknown[], R>(
    hooks : readonly HookEntry[],
    callback : Function,
    source : string,
    fn : (this : T, ...args : A) => R,
    thisValue : T,
    args : A,
) : R {
    if (store.inHook === true) {
        return fn.apply(thisValue, args);
    }
    callHooks(hooks, "before", callback, source);
    try {
        return fn.apply(thisValue, args);
    } finally {
        callHooks(hooks, "after", callback, source);
    }
}

/*
 * Each wrapper has the name `asyncBrowserContextWrapper`. Profilers, stack
 * traces and the Long Animation Frames API show the static name of a
 * function, so they show this name in place of the name of the callback. The
 * name tells the reader that the next frame is the callback.
 */

/**
 * This function wraps `fn`. The wrapper starts `fn` in `frame`, with the `this`
 * value and the arguments of the call. After `fn` ends, also with an error, the
 * previous frame is current again. `source` is the name of the API that got
 * `fn`, for the callback hooks.
 */
export function bindToFrame<T, A extends unknown[], R>(frame : Frame, fn : (this : T, ...args : A) => R, source : string) : (this : T, ...args : A) => R {
    return function asyncBrowserContextWrapper(this : T, ...args : A) : R {
        const previous = store.current;
        store.current = frame;
        try {
            const hooks = store.hooks;
            if (hooks === undefined) {
                return fn.apply(this, args);
            }
            return applyWithHooks(hooks, fn, source, fn, this, args);
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
export function bindOneArgument<T, A, R>(frame : Frame, fn : (this : T, argument : A) => R, source : string) : (this : T, argument : A) => R {
    return function asyncBrowserContextWrapper(this : T, argument : A) : R {
        const previous = store.current;
        store.current = frame;
        try {
            const hooks = store.hooks;
            if (hooks === undefined) {
                return fn.call(this, argument);
            }
            return applyWithHooks(hooks, fn, source, fn, this, [argument]);
        } finally {
            store.current = previous;
        }
    };
}
