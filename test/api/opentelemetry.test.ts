import { context, createContextKey, ROOT_CONTEXT, trace, type ContextManager } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsyncContextManager } from "async-browser-context/opentelemetry";
import { delay, inBrowser, runtime, turns } from "../helpers.js";

const REQUEST = createContextKey("request");
const valueOf = () : unknown => context.active().getValue(REQUEST);

type Listener = (...args : unknown[]) => void;

/** A small emitter with two methods of the Node.js EventEmitter: `on` and `removeListener`. */
class Emitter {
    readonly #listeners = new Map<string, Listener[]>();
    on(event : string, listener : Listener) : this {
        this.#listeners.set(event, [...this.#listeners.get(event) ?? [], listener]);
        return this;
    }
    removeListener(event : string, listener : Listener) : this {
        this.#listeners.set(event, (this.#listeners.get(event) ?? []).filter((other) => other !== listener));
        return this;
    }
    emit(event : string, ...args : unknown[]) : void {
        for (const listener of this.#listeners.get(event) ?? []) {
            listener(...args);
        }
    }
}

/** An emitter with `addListener` in place of `on`. */
class AddListenerEmitter {
    readonly #emitter = new Emitter();
    addListener(event : string, listener : Listener) : this {
        this.#emitter.on(event, listener);
        return this;
    }
    removeListener(event : string, listener : Listener) : this {
        this.#emitter.removeListener(event, listener);
        return this;
    }
    emit(event : string, ...args : unknown[]) : void {
        this.#emitter.emit(event, ...args);
    }
}

/**
 * These tests use the context manager through the API of OpenTelemetry, as an
 * application does after `provider.register({ contextManager })`.
 */
describe(`AsyncContextManager (${runtime} runtime)`, () => {
    let manager : ContextManager;

    beforeAll(() => {
        manager = new AsyncContextManager();
        expect(context.setGlobalContextManager(manager)).toBe(true);
    });

    afterAll(() => {
        context.disable();
    });

    it("gives the root context outside with()", () => {
        expect(context.active()).toBe(ROOT_CONTEXT);
    });

    it("keeps the active context through await, timers and then callbacks", async () => {
        const active = ROOT_CONTEXT.setValue(REQUEST, "r-1");
        const seen : unknown[] = [];
        await context.with(active, async () => {
            await delay(1);
            seen.push(valueOf());
            await new Promise<void>(resolve => setTimeout(() => {
                seen.push(valueOf());
                resolve();
            }, 1));
            await Promise.resolve().then(() => seen.push(valueOf()));
        });
        expect(seen).toEqual(["r-1", "r-1", "r-1"]);
        expect(context.active()).toBe(ROOT_CONTEXT);
    });

    it("keeps the contexts of two operations apart", async () => {
        const seen : string[] = [];
        const operation = (id : string, wait : number) => context.with(ROOT_CONTEXT.setValue(REQUEST, id), async () => {
            await delay(wait);
            seen.push(`${id}:${String(valueOf())}`);
            await turns(3);
            seen.push(`${id}:${String(valueOf())}`);
        });
        await Promise.all([operation("a", 5), operation("b", 1)]);
        expect(seen.sort()).toEqual(["a:a", "a:a", "b:b", "b:b"]);
    });

    it("gives the arguments and the this value to the function of with()", () => {
        const target = { name : "target" };
        const result = context.with(ROOT_CONTEXT.setValue(REQUEST, "r-2"), function (this : typeof target, a : number, b : number) {
            return `${this.name} ${a + b} ${String(valueOf())}`;
        }, target, 2, 3);
        expect(result).toBe("target 5 r-2");
    });

    it("binds a function to a context, with its this value, its arguments and its length", async () => {
        const bound = context.bind(ROOT_CONTEXT.setValue(REQUEST, "r-3"), function (this : { tag : string }, suffix : string) {
            return `${this.tag}${suffix} ${String(valueOf())}`;
        });
        expect(bound.length).toBe(1);
        // The length of a native function is configurable, but not writable or enumerable.
        expect(Object.getOwnPropertyDescriptor(bound, "length")).toEqual({ value : 1, writable : false, enumerable : false, configurable : true });
        expect(bound.call({ tag : "x" }, "!")).toBe("x! r-3");
        expect(context.bind(ROOT_CONTEXT, 42)).toBe(42);
    });

    it("gives the active span of the context", async () => {
        const span = trace.wrapSpanContext({ traceId : "0af7651916cd43dd8448eb211c80319c", spanId : "b7ad6b7169203331", traceFlags : 1 });
        await context.with(trace.setSpan(context.active(), span), async () => {
            await delay(1);
            expect(trace.getActiveSpan()).toBe(span);
        });
        expect(trace.getActiveSpan()).toBeUndefined();
    });

    it("gives the root context after disable(), until the next with()", () => {
        const other = new AsyncContextManager();
        other.with(ROOT_CONTEXT.setValue(REQUEST, "r-4"), () => {
            other.disable();
            expect(other.active()).toBe(ROOT_CONTEXT);
        });
        other.with(ROOT_CONTEXT.setValue(REQUEST, "r-5"), () => {
            expect(other.active().getValue(REQUEST)).toBe("r-5");
        });
        expect(other.enable()).toBe(other);
    });

    it("binds a function to the active context when bind() gets no context", () => {
        const bound = context.with(ROOT_CONTEXT.setValue(REQUEST, "active"), () => context.bind(undefined as unknown as typeof ROOT_CONTEXT, () => valueOf()));
        expect(bound()).toBe("active");
    });

    it("binds the listeners of an event emitter, and removes them with the remove methods", () => {
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "request"), new Emitter());
        const seen : unknown[] = [];
        const listener = (chunk : unknown) : void => { seen.push(`${String(chunk)} ${String(valueOf())}`); };
        emitter.on("data", listener);
        context.with(ROOT_CONTEXT.setValue(REQUEST, "emit-time"), () => emitter.emit("data", "a"));
        emitter.removeListener("data", listener);
        emitter.emit("data", "b");
        expect(seen).toEqual(["a request"]);
    });

    it.skipIf(inBrowser)("removes a once listener of a Node.js EventEmitter with removeListener, and starts it one time", () => {
        const { EventEmitter } = process.getBuiltinModule("node:events");
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "once"), new EventEmitter());
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(valueOf()); };
        emitter.once("removed", listener);
        emitter.prependOnceListener("removed", listener);
        emitter.removeListener("removed", listener);
        emitter.removeListener("removed", listener);
        expect(emitter.listenerCount("removed")).toBe(0);
        emitter.emit("removed");
        emitter.once("kept", listener);
        context.with(ROOT_CONTEXT.setValue(REQUEST, "emit-time"), () => emitter.emit("kept"));
        emitter.emit("kept");
        expect(seen).toEqual(["once"]);
        expect(emitter.listenerCount("kept")).toBe(0);
    });

    it("keeps the first context when bind() gets the same event target again, as OpenTelemetry does", () => {
        const target = context.bind(ROOT_CONTEXT.setValue(REQUEST, "first"), new EventTarget());
        expect(context.bind(ROOT_CONTEXT.setValue(REQUEST, "second"), target)).toBe(target);
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(valueOf()); };
        target.addEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        target.removeEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        expect(seen).toEqual(["first"]);
    });

    it("binds the listeners of an event target, and removes them with removeEventListener", () => {
        const target = context.bind(ROOT_CONTEXT.setValue(REQUEST, "target"), new EventTarget());
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(valueOf()); };
        target.addEventListener("ping", listener);
        context.with(ROOT_CONTEXT.setValue(REQUEST, "dispatch"), () => target.dispatchEvent(new Event("ping")));
        target.removeEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        expect(seen).toEqual(["target"]);
    });

    it("gives other values back without a change", () => {
        const bound = ROOT_CONTEXT.setValue(REQUEST, "value");
        for (const value of [undefined, null, 42, "text", true]) {
            expect(context.bind(bound, value)).toBe(value);
        }
        // Without addEventListener, on and addListener, an object is not an emitter
        const method = () : void => {};
        const object = { once : method, prependListener : method, removeListener : method, off : method, removeAllListeners : method };
        expect(context.bind(bound, object)).toBe(object);
        for (const value of Object.values(object)) {
            expect(value).toBe(method);
        }
    });

    it("binds an emitter that has addListener and no on", () => {
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "addListener"), new AddListenerEmitter());
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(valueOf()); };
        emitter.addListener("data", listener);
        context.with(ROOT_CONTEXT.setValue(REQUEST, "emit-time"), () => emitter.emit("data"));
        emitter.removeListener("data", listener);
        emitter.emit("data");
        expect(seen).toEqual(["addListener"]);
    });

    it("patches only the methods that the emitter or the event target has", () => {
        const bound = ROOT_CONTEXT.setValue(REQUEST, "methods");
        // The patches are own properties. The other methods stay on the prototype.
        expect(Object.keys(context.bind(bound, new Emitter())).sort()).toEqual(["on", "removeListener"]);
        expect(Object.keys(context.bind(bound, { addEventListener() {} }))).toEqual(["addEventListener"]);
    });

    it("adds a listener to an event target one time when the program adds it two times, as the event target does", () => {
        const target = context.bind(ROOT_CONTEXT.setValue(REQUEST, "twice"), new EventTarget());
        const seen : unknown[] = [];
        const listener = () : void => { seen.push(valueOf()); };
        target.addEventListener("ping", listener);
        target.addEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        target.removeEventListener("ping", listener);
        target.dispatchEvent(new Event("ping"));
        expect(seen).toEqual(["twice"]);
    });

    it("gives listener objects, options and the listeners of the time before bind() to the methods of an event target", () => {
        const target = new EventTarget();
        const seen : string[] = [];
        const older = () : void => { seen.push("older"); };
        target.addEventListener("ping", older);
        context.bind(ROOT_CONTEXT.setValue(REQUEST, "options"), target);
        // A remove without bound listeners for the target or for the type
        target.removeEventListener("other", older);
        const object = { handleEvent(this : unknown) : void { seen.push(this === object ? "object" : "other this"); } };
        const once = () : void => { seen.push(`once ${String(valueOf())}`); };
        const capture = () : void => { seen.push(`capture ${String(valueOf())}`); };
        target.addEventListener("ping", object);
        target.addEventListener("ping", once, { once : true });
        target.addEventListener("ping", capture, { capture : true });
        target.removeEventListener("other", once);
        // The capture flag of a remove must agree with the capture flag of the add.
        // The EventTarget of Node.js reads only an object for the remove options, not a boolean.
        target.removeEventListener("ping", capture, { capture : false });
        target.dispatchEvent(new Event("ping"));
        target.removeEventListener("ping", older);
        target.removeEventListener("ping", object);
        target.removeEventListener("ping", capture, { capture : true });
        target.dispatchEvent(new Event("ping"));
        // At the target, a browser starts the capture listeners first, and Node.js keeps the order of the adds
        expect(seen.sort()).toEqual(["capture options", "object", "older", "once options"]);
    });

    it("finds the bound listener when the remove method of an event target gets the type as a string", () => {
        const target = context.bind(ROOT_CONTEXT.setValue(REQUEST, "type"), new EventTarget());
        const seen : string[] = [];
        const listener = (event : Event) : void => { seen.push(`${event.type} ${String(valueOf())}`); };
        // The event target changes the type to a string, thus 1 and "1" are the same type
        target.addEventListener(1 as unknown as string, listener);
        target.addEventListener("constructor", listener);
        target.dispatchEvent(new Event("1"));
        target.dispatchEvent(new Event("constructor"));
        target.removeEventListener("1", listener);
        target.removeEventListener("constructor", listener);
        target.dispatchEvent(new Event("1"));
        target.dispatchEvent(new Event("constructor"));
        expect(seen).toEqual(["1 type", "constructor type"]);
    });

    it.skipIf(inBrowser)("finds the bound listener when the remove method of a Node.js EventEmitter gets the event name as a string", () => {
        const { EventEmitter } = process.getBuiltinModule("node:events");
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "name"), new EventEmitter());
        const listener = () : void => {};
        // The emitter keeps its listeners in an object, thus 1 and "1" are the same event name
        emitter.on(1 as unknown as string, listener);
        emitter.on("constructor", listener);
        emitter.removeListener("1", listener);
        emitter.removeListener("constructor", listener);
        expect(emitter.eventNames()).toEqual([]);
    });

    it.skipIf(inBrowser)("binds each add method of a Node.js EventEmitter, and removes the listeners with removeListener and off", () => {
        const { EventEmitter } = process.getBuiltinModule("node:events");
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "first"), new EventEmitter());
        expect(context.bind(ROOT_CONTEXT.setValue(REQUEST, "second"), emitter)).toBe(emitter);
        const seen : string[] = [];
        const listen = (name : string) => () : void => { seen.push(`${name} ${String(valueOf())}`); };
        const addListener = listen("addListener");
        const on = listen("on");
        const prependListener = listen("prependListener");
        emitter.addListener("event", addListener);
        emitter.on("event", on);
        emitter.prependListener("event", prependListener);
        emitter.once("event", listen("once"));
        emitter.prependOnceListener("event", listen("prependOnceListener"));
        context.with(ROOT_CONTEXT.setValue(REQUEST, "emit-time"), () => emitter.emit("event"));
        expect(seen.sort()).toEqual(["addListener first", "on first", "once first", "prependListener first", "prependOnceListener first"]);
        emitter.off("event", addListener);
        emitter.removeListener("event", on);
        emitter.off("event", prependListener);
        expect(emitter.listenerCount("event")).toBe(0);
    });

    it.skipIf(inBrowser)("gives a listener that is not a function to the add method of a Node.js EventEmitter", () => {
        const { EventEmitter } = process.getBuiltinModule("node:events");
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "object"), new EventEmitter());
        // The native method refuses the object. A bound function in its place would hide the error.
        expect(() => emitter.on("event", {} as () => void)).toThrow(/"listener"/);
    });

    it.skipIf(inBrowser)("forgets the bound listeners that removeAllListeners() removes, and keeps the others, as OpenTelemetry does", () => {
        const { EventEmitter } = process.getBuiltinModule("node:events");
        const emitter = context.bind(ROOT_CONTEXT.setValue(REQUEST, "remove all"), new EventEmitter());
        const listener = () : void => {};
        // The remove methods operate also without bound listeners for the emitter or for the event
        emitter.removeAllListeners("a");
        emitter.removeListener("a", listener);
        emitter.on("a", listener);
        emitter.on("b", listener);
        emitter.removeListener("c", listener);
        const [first] = emitter.listeners("a");
        expect(first).not.toBe(listener);
        emitter.removeAllListeners("a");
        emitter.removeListener("b", listener);
        expect(emitter.eventNames()).toEqual([]);
        // A new add after removeAllListeners() gives a new bound listener
        emitter.on("a", listener);
        const [second] = emitter.listeners("a");
        expect(second).not.toBe(first);
        emitter.removeAllListeners();
        emitter.removeListener("a", listener);
        emitter.on("a", listener);
        expect(emitter.listeners("a")[0]).not.toBe(second);
    });
});
