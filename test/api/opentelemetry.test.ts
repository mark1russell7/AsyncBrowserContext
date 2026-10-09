import { context, createContextKey, ROOT_CONTEXT, trace, type ContextManager } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsyncContextManager } from "async-browser-context/opentelemetry";
import { delay, runtime, turns } from "../helpers.js";

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
});
