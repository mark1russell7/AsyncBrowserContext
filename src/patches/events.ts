import { store, type Frame } from "../core/store.js";
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
    readonly frame : Frame;
    readonly wrapper : EventListener;
}

/** The registrations of each target: type and capture flag, then listener. */
const registrations = new WeakMap<object, Map<string, Map<Listener, Registration>>>();

function keyOf(type : string, options : boolean | EventListenerOptions | undefined) : string {
    const capture = typeof options === "boolean" ? options : options?.capture === true;
    return `${type}\u0000${capture ? "1" : "0"}`;
}

/** This function gives the frame for a listener call: the current frame, or the registration frame in the root context. */
function frameForCall(registered : Frame) : Frame {
    const current = store.current;
    return current === store.root ? registered : current;
}

function createWrapper(listener : Listener, frame : Frame, onFirstCall : (() => void) | undefined) : EventListener {
    return function (this : unknown, event : Event) : unknown {
        onFirstCall?.();
        const previous = store.current;
        store.current = frameForCall(frame);
        try {
            if (typeof listener === "function") {
                return (listener as Handler).call(this, event);
            }
            return (listener.handleEvent as Handler).call(listener, event);
        } finally {
            store.current = previous;
        }
    };
}

function installListenerPatch() : void {
    const prototype = globalPrototype("EventTarget");
    if (prototype === undefined) {
        return;
    }
    replaceFunction<AddEventListener>(prototype, "addEventListener", (nativeAdd) => function addEventListener(
        this : EventTarget | null | undefined,
        type : string,
        listener : Listener | null,
        options? : boolean | AddEventListenerOptions,
    ) : void {
        const target = this ?? (globalThis as unknown as EventTarget);
        if (listener === null || (typeof listener !== "function" && typeof listener !== "object")) {
            nativeAdd.call(target, type, listener, options);
            return;
        }
        const key = keyOf(String(type), options);
        let byKey = registrations.get(target);
        if (byKey === undefined) {
            byKey = new Map();
            registrations.set(target, byKey);
        }
        let byListener = byKey.get(key);
        if (byListener === undefined) {
            byListener = new Map();
            byKey.set(key, byListener);
        }
        let registration = byListener.get(listener);
        if (registration === undefined) {
            const listeners = byListener;
            const forget = () : void => {
                if (listeners.get(listener) === registration) {
                    listeners.delete(listener);
                }
            };
            const once = typeof options === "object" && options.once === true;
            registration = { frame : store.current, wrapper : createWrapper(listener, store.current, once ? forget : undefined) };
            listeners.set(listener, registration);
            const signal = typeof options === "object" ? options.signal : undefined;
            if (signal !== undefined) {
                if (signal.aborted) {
                    forget();
                } else {
                    nativeAdd.call(signal, "abort", forget, { once : true });
                }
            }
        }
        // The DOM ignores a second registration of the same wrapper, as it does for the same listener
        nativeAdd.call(target, type, registration.wrapper, options);
    } as AddEventListener);

    replaceFunction<RemoveEventListener>(prototype, "removeEventListener", (nativeRemove) => function removeEventListener(
        this : EventTarget | null | undefined,
        type : string,
        listener : Listener | null,
        options? : boolean | EventListenerOptions,
    ) : void {
        const target = this ?? (globalThis as unknown as EventTarget);
        if (listener !== null && (typeof listener === "function" || typeof listener === "object")) {
            const byListener = registrations.get(target)?.get(keyOf(String(type), options));
            const registration = byListener?.get(listener);
            if (registration !== undefined) {
                byListener?.delete(listener);
                nativeRemove.call(target, type, registration.wrapper, options);
                return;
            }
        }
        nativeRemove.call(target, type, listener, options);
    } as RemoveEventListener);
}

/** The handler and its wrapper of each `on...` property of each target. */
const handlers = new WeakMap<object, Map<string, { readonly handler : Handler; readonly wrapper : Handler }>>();

function createHandlerWrapper(handler : Handler, frame : Frame) : Handler {
    return function (this : unknown, ...args : unknown[]) : unknown {
        const previous = store.current;
        store.current = frameForCall(frame);
        try {
            return handler.apply(this, args);
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
                const value : unknown = nativeGet.call(target);
                const entry = handlers.get(target)?.get(name);
                return entry !== undefined && entry.wrapper === value ? entry.handler : value;
            },
            set [name](value : unknown) {
                const target = (this as object | undefined) ?? globalThis;
                let byName = handlers.get(target);
                if (typeof value !== "function") {
                    byName?.delete(name);
                    nativeSet.call(target, value);
                    return;
                }
                if (byName === undefined) {
                    byName = new Map();
                    handlers.set(target, byName);
                }
                const wrapper = createHandlerWrapper(value as Handler, store.current);
                byName.set(name, { handler : value as Handler, wrapper });
                nativeSet.call(target, wrapper);
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

/** This function patches the `on...` properties of the global object and of each prototype of an `EventTarget` class. */
function installHandlerPropertyPatch() : void {
    const eventTarget = ownDataValue(globalThis, "EventTarget");
    if (typeof eventTarget !== "function") {
        return;
    }
    const eventTargetPrototype = (eventTarget as { prototype : object }).prototype;
    const done = new Set<object>();
    for (const name of Object.getOwnPropertyNames(globalThis)) {
        const value = ownDataValue(globalThis, name);
        if (typeof value !== "function") {
            continue;
        }
        const prototype = (value as { prototype? : unknown }).prototype;
        if (typeof prototype !== "object" || prototype === null || done.has(prototype)) {
            continue;
        }
        if (prototype === eventTargetPrototype || Object.prototype.isPrototypeOf.call(eventTargetPrototype, prototype)) {
            done.add(prototype);
            patchHandlerProperties(prototype);
        }
    }
    // In browsers, the `on...` properties of window are own properties of the global object
    patchHandlerProperties(globalThis);
}

type LegacyListenerMethod = (this : unknown, callback : ((this : MediaQueryList, event : MediaQueryListEvent) => unknown) | null) => void;

/** `MediaQueryList.addListener()` and `removeListener()` do not use the JavaScript `addEventListener()`. */
function installMediaQueryListPatch() : void {
    const prototype = globalPrototype("MediaQueryList");
    if (prototype === undefined) {
        return;
    }
    replaceFunction<LegacyListenerMethod>(prototype, "addListener", (native) => function addListener(this : unknown, callback) : void {
        if (typeof callback === "function") {
            (this as MediaQueryList).addEventListener("change", callback);
            return;
        }
        native.call(this, callback);
    });
    replaceFunction<LegacyListenerMethod>(prototype, "removeListener", (native) => function removeListener(this : unknown, callback) : void {
        if (typeof callback === "function") {
            (this as MediaQueryList).removeEventListener("change", callback);
            return;
        }
        native.call(this, callback);
    });
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
