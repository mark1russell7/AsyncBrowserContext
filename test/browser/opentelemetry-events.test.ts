import { context, ROOT_CONTEXT, trace, TraceFlags, type Span } from "@opentelemetry/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AsyncContextManager } from "async-browser-context/opentelemetry";

let nextSpanId = 1;
const newSpan = () : Span => trace.wrapSpanContext({
    traceId : "4bf92f3577b34da6a3ce929d0e0e4736",
    spanId : (nextSpanId++).toString(16).padStart(16, "0"),
    traceFlags : TraceFlags.SAMPLED,
});

/**
 * Rule C13 through the API of OpenTelemetry, as an application uses it. The
 * first case is the case "listener, code dispatch" of the experiment E8 of
 * lag: code without an active context dispatches the event.
 */
describe("rule C13 with the OpenTelemetry context manager", () => {
    beforeAll(() => {
        expect(context.setGlobalContextManager(new AsyncContextManager())).toBe(true);
    });

    afterAll(() => {
        context.disable();
    });

    it("gives the span of the registration to a listener when code in the root context dispatches the event", () => {
        const span = newSpan();
        const target = new EventTarget();
        let seen : Span | undefined;
        context.with(trace.setSpan(ROOT_CONTEXT, span), () => {
            target.addEventListener("e8", () => { seen = trace.getActiveSpan(); }, { once : true });
        });
        target.dispatchEvent(new Event("e8"));
        expect(seen).toBe(span);
    });

    it("gives the span of the dispatch to a listener when code with a span dispatches the event", () => {
        const registration = newSpan();
        const dispatch = newSpan();
        const target = new EventTarget();
        let seen : Span | undefined;
        context.with(trace.setSpan(ROOT_CONTEXT, registration), () => {
            target.addEventListener("e8", () => { seen = trace.getActiveSpan(); }, { once : true });
        });
        context.with(trace.setSpan(ROOT_CONTEXT, dispatch), () => target.dispatchEvent(new Event("e8")));
        expect(seen).toBe(dispatch);
    });

    it("gives no span to a listener when code dispatches the event in with(ROOT_CONTEXT)", () => {
        const registration = newSpan();
        const target = new EventTarget();
        let seen : Span | undefined = registration;
        context.with(trace.setSpan(ROOT_CONTEXT, registration), () => {
            target.addEventListener("e8", () => { seen = trace.getActiveSpan(); }, { once : true });
        });
        // with() makes a context, also for ROOT_CONTEXT. Thus the dispatch has a context, and the listener gets it.
        context.with(ROOT_CONTEXT, () => target.dispatchEvent(new Event("e8")));
        expect(seen).toBeUndefined();
    });
});
