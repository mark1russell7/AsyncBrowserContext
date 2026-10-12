import { context, createContextKey, ROOT_CONTEXT, trace, type ContextManager } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsyncContextManager } from "async-browser-context/opentelemetry";
import { delay, inBrowser, runtime, turns } from "../helpers.js";

const REQUEST = createContextKey("request");
const valueOf = () : unknown => context.active().getValue(REQUEST);

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
        // A small emitter with the methods of the Node.js EventEmitter
        class Emitter {
            readonly #listeners = new Map<string, ((...args : unknown[]) => void)[]>();
            on(event : string, listener : (...args : unknown[]) => void) : this {
                this.#listeners.set(event, [...this.#listeners.get(event) ?? [], listener]);
                return this;
            }
            removeListener(event : string, listener : (...args : unknown[]) => void) : this {
                this.#listeners.set(event, (this.#listeners.get(event) ?? []).filter((other) => other !== listener));
                return this;
            }
            emit(event : string, ...args : unknown[]) : void {
                for (const listener of this.#listeners.get(event) ?? []) {
                    listener(...args);
                }
            }
        }
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
});
