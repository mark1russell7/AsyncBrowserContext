import { applyWithHooks, store, type Frame } from "../core/store.js";
import { HANDLER_INTERFACES } from "./handler-interfaces.js";
import { claim, globalPrototype, ownDataValue, rememberOriginal, replaceFunction } from "./patch.js";

/**
 * The event patch (rule C13).
 *
 * An event listener operates in the context of the code that dispatches the
 * event, if that context is not the root context. This is the case for
 * `dispatchEvent()`, `element.click()` and the other events that code
 * dispatches synchronously. Else, the listener operates in the context of the
 * `addEventListener()` call, or of the assignment to the `on...` property.
 * This is the case for the events that the browser dispatches, for example a
 * `load` event of an `XMLHttpRequest` or a click of the user.
 */

type Listener = EventListenerOrEventListenerObject;
type AddEventListener = typeof EventTarget.prototype.addEventListener;
type RemoveEventListener = typeof EventTarget.prototype.removeEventListener;
type Handler = (this : unknown, ...args : unknown[]) => unknown;

interface Registration {
    readonly wrapper : EventListener;
    /** The DOM removes the listener when this signal aborts. */
    readonly signal : AbortSignal | undefined;
    /** `true` after a `once` listener operated, or after the abort of the signal. */
    gone : boolean;
    /** This function removes the abort listener of the registration from its signal. */
    stopWatching : (() => void) | undefined;
}

/**
 * The registrations of each target: type and capture flag, then listener. The map of the listeners
 * is weak. On Node.js, the native addEventListener with a signal adds an abort listener to the
 * signal through the patched method, and keeps that listener only weakly. A strong map of a signal
 * that lives long kept that listener, its target and the context in memory.
 */
const registrations = new WeakMap<object, Map<string, WeakMap<Listener, Registration>>>();

/** The options of an `addEventListener()` or `removeEventListener()` call, as the DOM reads them (WebIDL). */
interface ListenerOptions {
    readonly capture : boolean;
    readonly once : boolean;
    readonly signal : AbortSignal | undefined;
}

function readOptions(options : unknown) : ListenerOptions {
    if ((typeof options === "object" && options !== null) || typeof options === "function") {
        const dictionary = options as { capture? : unknown; once? : unknown; signal? : unknown };
        const signal = dictionary.signal;
        return {
            capture : Boolean(dictionary.capture),
            once : Boolean(dictionary.once),
            signal : signal === undefined || signal === null ? undefined : signal as AbortSignal,
        };
    }
    // undefined and null give the default options. Another value is the capture flag.
    return { capture : Boolean(options), once : false, signal : undefined };
}

function keyOf(type : unknown, capture : boolean) : string {
    return `${String(type)}\u0000${capture ? "1" : "0"}`;
}

/** This function gives the frame for a listener call: the current frame, or the registration frame in the root context. */
function frameForCall(registered : Frame) : Frame {
    const current = store.current;
    return current === store.root ? registered : current;
}

/** `source` is `addEventListener:` and the event type, for the callback hooks. */
function createWrapper(listener : Listener, frame : Frame, onCall : (() => void) | undefined, source : string) : EventListener {
    // A listener that a hook registers does not start the hooks
    const quiet = store.inHook === true;
    return function asyncBrowserContextWrapper(this : unknown, event : Event) : unknown {
        onCall?.();
        const previous = store.current;
        store.current = frameForCall(frame);
        try {
            let fn : Handler;
            let thisValue : unknown;
            if (typeof listener === "function") {
                fn = listener as Handler;
                thisValue = this;
            } else {
                fn = listener.handleEvent as Handler;
                thisValue = listener;
            }
            const hooks = quiet ? undefined : store.hooks;
            if (hooks === undefined || typeof fn !== "function") {
                return Reflect.apply(fn, thisValue, [event]);
            }
            return applyWithHooks(hooks, fn, source, fn, thisValue, [event]);
        } finally {
            store.current = previous;
        }
    };
}

/** A weak reference, or a strong one where the engine has no WeakRef. */
function weak<T extends object>(value : T) : { deref() : T | undefined } {
    return typeof WeakRef === "function" ? new WeakRef(value) : { deref : () => value };
}

/**
 * This function removes `registration` from `listeners` when its signal aborts, as the DOM removes
 * the listener. The abort listener keeps only weak references. Thus a signal that lives long
 * does not keep the target, the listener or the context in memory.
 */
function watchSignal(
    signal : AbortSignal,
    listeners : WeakMap<Listener, Registration>,
    listener : Listener,
    registration : Registration,
    nativeAdd : AddEventListener,
    nativeRemove : RemoveEventListener,
) : void {
    const listenersRef = weak(listeners);
    const listenerRef = weak(listener);
    const registrationRef = weak(registration);
    const forget = () : void => {
        const current = registrationRef.deref();
        const key = listenerRef.deref();
        if (current === undefined || key === undefined) {
            return;
        }
        current.gone = true;
        const map = listenersRef.deref();
        if (map !== undefined && map.get(key) === current) {
            map.delete(key);
        }
    };
    Reflect.apply(nativeAdd, signal, ["abort", forget, { once : true }]);
    registration.stopWatching = () : void => {
        Reflect.apply(nativeRemove, signal, ["abort", forget]);
    };
}

/** This function gives the arguments of a call, with `wrapper` in place of the listener. The number of arguments stays the same. */
function withListener(args : IArguments, wrapper : EventListener) : unknown[] {
    const copy = Array.prototype.slice.call(args) as unknown[];
    copy[1] = wrapper;
    return copy;
}

function installListenerPatch() : void {
    const prototype = globalPrototype("EventTarget");
    if (prototype === undefined) {
        return;
    }
    const nativeRemove = (prototype as { removeEventListener : RemoveEventListener }).removeEventListener;
    // Method syntax: a native method has no prototype property and is not a constructor
    replaceFunction<AddEventListener>(prototype, "addEventListener", (nativeAdd) => ({
        addEventListener(this : EventTarget | null | undefined, type : string, listener : Listener | null, options? : boolean | AddEventListenerOptions) : void {
            const target = this ?? (globalThis as unknown as EventTarget);
            if (arguments.length < 2 || listener === null || (typeof listener !== "function" && typeof listener !== "object")) {
                // The DOM gives its own error, or ignores a null listener
                Reflect.apply(nativeAdd, target, arguments);
                return;
            }
            const { capture, once, signal } = readOptions(options);
            const key = keyOf(type, capture);
            let byKey = registrations.get(target);
            if (byKey === undefined) {
                byKey = new Map();
                registrations.set(target, byKey);
            }
            let byListener = byKey.get(key);
            if (byListener === undefined) {
                byListener = new WeakMap();
                byKey.set(key, byListener);
            }
            const listeners = byListener;
            const existing = listeners.get(listener);
            if (existing !== undefined && !existing.gone && existing.signal?.aborted !== true) {
                // The DOM ignores a second registration of the same listener, so the first context stays
                Reflect.apply(nativeAdd, target, withListener(arguments, existing.wrapper));
                return;
            }
            if (existing !== undefined) {
                // The DOM removed the old registration: a once listener operated, or its signal aborted
                existing.stopWatching?.();
                listeners.delete(listener);
            }
            const registration : Registration = { wrapper : undefined as unknown as EventListener, signal, gone : false, stopWatching : undefined };
            const onCall = once
                ? () : void => {
                    registration.gone = true;
                    registration.stopWatching?.();
                    if (listeners.get(listener) === registration) {
                        listeners.delete(listener);
                    }
                }
                : undefined;
            (registration as { wrapper : EventListener }).wrapper = createWrapper(listener, store.current, onCall, `addEventListener:${String(type)}`);
            // The native method examines the options, and throws for an incorrect signal
            Reflect.apply(nativeAdd, target, withListener(arguments, registration.wrapper));
            if (signal?.aborted === true) {
                // The DOM does not add a listener with an aborted signal
                return;
            }
            listeners.set(listener, registration);
            if (signal !== undefined) {
                watchSignal(signal, listeners, listener, registration, nativeAdd, nativeRemove);
            }
        },
    }).addEventListener as AddEventListener);

    replaceFunction<RemoveEventListener>(prototype, "removeEventListener", (native) => ({
        removeEventListener(this : EventTarget | null | undefined, type : string, listener : Listener | null, options? : boolean | EventListenerOptions) : void {
            const target = this ?? (globalThis as unknown as EventTarget);
            if (arguments.length >= 2 && listener !== null && (typeof listener === "function" || typeof listener === "object")) {
                const key = keyOf(type, readOptions(options).capture);
                const byKey = registrations.get(target);
                const byListener = byKey?.get(key);
                const registration = byListener?.get(listener);
                if (registration !== undefined && byListener !== undefined) {
                    byListener.delete(listener);
                    registration.stopWatching?.();
                    Reflect.apply(native, target, withListener(arguments, registration.wrapper));
                    return;
                }
            }
            Reflect.apply(native, target, arguments);
        },
    }).removeEventListener as RemoveEventListener);
}

/** The handler of each wrapper of an `on...` property. The getter gives the handler in place of its wrapper. */
const handlerOfWrapper = new WeakMap<object, Handler>();

/** `source` is the name of the `on...` property, for the callback hooks. */
function createHandlerWrapper(handler : Handler, frame : Frame, source : string) : Handler {
    const quiet = store.inHook === true;
    return function asyncBrowserContextWrapper(this : unknown) : unknown {
        const previous = store.current;
        store.current = frameForCall(frame);
        try {
            const hooks = quiet ? undefined : store.hooks;
            if (hooks === undefined) {
                // The arguments object gives the arguments without a new array
                return Reflect.apply(handler, this, arguments);
            }
            return applyWithHooks(hooks, handler, source, handler, this, Array.prototype.slice.call(arguments) as unknown[]);
        } finally {
            store.current = previous;
        }
    };
}

/** This function patches each `on...` accessor property of `owner`. */
function patchHandlerProperties(owner : object) : void {
    for (const name of Object.getOwnPropertyNames(owner)) {
        if (!name.startsWith("on")) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(owner, name);
        if (descriptor?.get === undefined || descriptor.set === undefined || descriptor.configurable !== true) {
            continue;
        }
        const nativeGet = descriptor.get;
        const nativeSet = descriptor.set;
        const accessors = {
            get [name]() : unknown {
                const target = (this as object | undefined) ?? globalThis;
                const value : unknown = Reflect.apply(nativeGet, target, []);
                // One map for all targets: the handlers of body and window give the same wrapper
                return typeof value === "function" ? handlerOfWrapper.get(value) ?? value : value;
            },
            set [name](value : unknown) {
                const target = (this as object | undefined) ?? globalThis;
                if (typeof value !== "function") {
                    Reflect.apply(nativeSet, target, [value]);
                    return;
                }
                const wrapper = createHandlerWrapper(value as Handler, store.current, name);
                handlerOfWrapper.set(wrapper, value as Handler);
                Reflect.apply(nativeSet, target, [wrapper]);
            },
        };
        const replacement = Object.getOwnPropertyDescriptor(accessors, name);
        if (replacement?.get === undefined || replacement.set === undefined) {
            continue;
        }
        rememberOriginal(replacement.get, nativeGet);
        rememberOriginal(replacement.set, nativeSet);
        Object.defineProperty(owner, name, { get : replacement.get, set : replacement.set, enumerable : descriptor.enumerable ?? false, configurable : true });
    }
}

/**
 * This function patches the `on...` properties of the global object and of the prototypes of
 * the `EventTarget` classes in `HANDLER_INTERFACES`. It does not read the
 * other globals: for each global that code reads for the first time, the browser makes an interface object.
 */
function installHandlerPropertyPatch() : void {
    const eventTarget = ownDataValue(globalThis, "EventTarget");
    if (typeof eventTarget !== "function") {
        return;
    }
    const eventTargetPrototype = (eventTarget as { prototype : object }).prototype;
    const done = new Set<object>();
    for (const name of HANDLER_INTERFACES) {
        const prototype = globalPrototype(name);
        // An alias, for example webkitMediaStream, can give a prototype a second time
        if (prototype === undefined || done.has(prototype) || !Object.prototype.isPrototypeOf.call(eventTargetPrototype, prototype)) {
            continue;
        }
        done.add(prototype);
        patchHandlerProperties(prototype);
    }
    // In browsers, the `on...` properties of window are own properties of the global object
    patchHandlerProperties(globalThis);
}

type LegacyListenerMethod = (this : unknown, callback : Listener | null) => void;

/**
 * `MediaQueryList.addListener()` and `removeListener()` do not use the JavaScript `addEventListener()`.
 * The patch gives each listener, also an object with `handleEvent`, to the patched methods of
 * `EventTarget.prototype`, as the DOM does with the native methods.
 */
function installMediaQueryListPatch() : void {
    const prototype = globalPrototype("MediaQueryList");
    const eventTarget = globalPrototype("EventTarget") as { addEventListener : AddEventListener; removeEventListener : RemoveEventListener } | undefined;
    if (prototype === undefined || eventTarget === undefined) {
        return;
    }
    const patchedAdd = eventTarget.addEventListener;
    const patchedRemove = eventTarget.removeEventListener;
    replaceFunction<LegacyListenerMethod>(prototype, "addListener", (native) => ({
        addListener(this : unknown, callback : Listener | null) : void {
            if (typeof callback === "function" || (typeof callback === "object" && callback !== null)) {
                Reflect.apply(patchedAdd, this, ["change", callback]);
                return;
            }
            Reflect.apply(native, this, arguments);
        },
    }).addListener);
    replaceFunction<LegacyListenerMethod>(prototype, "removeListener", (native) => ({
        removeListener(this : unknown, callback : Listener | null) : void {
            if (typeof callback === "function" || (typeof callback === "object" && callback !== null)) {
                Reflect.apply(patchedRemove, this, ["change", callback]);
                return;
            }
            Reflect.apply(native, this, arguments);
        },
    }).removeListener);
}

/** This function installs the event patch (rule C13). */
export function installEventPatches() : void {
    if (!claim("events")) {
        return;
    }
    installListenerPatch();
    installHandlerPropertyPatch();
    installMediaQueryListPatch();
}
