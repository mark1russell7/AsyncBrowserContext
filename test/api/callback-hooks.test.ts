import { afterEach, describe, expect, it } from "vitest";
import { addCallbackHook, AsyncLocalStorage, Variable, type CallbackHook } from "async-browser-context";
import { deferred, delay, inBrowser, preset, runtime } from "../helpers.js";

/** The removers of the hooks of the current test. */
const removers : (() => void)[] = [];

afterEach(() => {
    for (const remove of removers.splice(0)) {
        remove();
    }
});

/** One call of a hook method, for a callback in a context of the test. */
interface Call {
    readonly phase : "before" | "after";
    readonly source : string;
    readonly name : string;
    readonly value : unknown;
}

/**
 * This function adds a hook that records the calls for callbacks in which
 * `variable` has a value. Vitest uses promises and timers too. Its callbacks
 * have no value of `variable`, so the hook ignores them.
 */
function record(variable : Variable<string>, label = "") : Call[] {
    const calls : Call[] = [];
    const add = (phase : "before" | "after") => (callback : Function, source : string) : void => {
        const value = variable.get();
        if (value !== undefined) {
            calls.push({ phase, source, name : `${label}${callback.name}`, value });
        }
    };
    removers.push(addCallbackHook({ before : add("before"), after : add("after") }));
    return calls;
}

describe("addCallbackHook", () => {
    it("refuses a hook that is not an object, and methods that are not functions", () => {
        expect(() => addCallbackHook(null as unknown as CallbackHook)).toThrow(new TypeError("addCallbackHook: the hook is not an object"));
        expect(() => addCallbackHook((() => undefined) as unknown as CallbackHook)).toThrow(TypeError);
        expect(() => addCallbackHook({ before : 1 } as unknown as CallbackHook)).toThrow(/hook\.before is not a function/);
        expect(() => addCallbackHook({ after : "x" } as unknown as CallbackHook)).toThrow(/hook\.after is not a function/);
    });

    it.skipIf(runtime !== "node")("does nothing on Node.js, where the library wraps no callback (Node.js runtime only)", async () => {
        let calls = 0;
        const remove = addCallbackHook({ before : () => { calls++; }, after : () => { calls++; } });
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
        await Promise.resolve().then(() => undefined);
        remove();
        remove();
        expect(calls).toBe(0);
    });
});

describe.skipIf(runtime !== "browser")("callback hooks (browser runtime)", () => {
    it("calls before and after around a timer callback, in the context of the callback", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const done = deferred<unknown>();
        variable.run("a", () => setTimeout(function onTimer() {
            done.resolve(variable.get());
        }, 1));
        expect(await done.promise).toBe("a");
        expect(calls).toEqual([
            { phase : "before", source : "setTimeout", name : "onTimer", value : "a" },
            { phase : "after", source : "setTimeout", name : "onTimer", value : "a" },
        ]);
    });

    it("gives the callback itself to the hook", async () => {
        const variable = new Variable<string>();
        const seen : Function[] = [];
        removers.push(addCallbackHook({ before : (callback) => { if (variable.get() === "a") seen.push(callback); } }));
        const callback = () : void => undefined;
        await variable.run("a", () => Promise.resolve().then(callback));
        expect(seen).toEqual([callback]);
    });

    it("calls the hooks for then callbacks with the source Promise.then, also for a rejection", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        await variable.run("p", () => Promise.resolve(1).then(function onValue() { return 2; }));
        await variable.run("q", () => Promise.reject(new Error("x")).then(undefined, function onError() { return 3; }));
        expect(calls.map((call) => `${call.phase} ${call.source} ${call.name} ${String(call.value)}`)).toEqual([
            "before Promise.then onValue p",
            "after Promise.then onValue p",
            "before Promise.then onError q",
            "after Promise.then onError q",
        ]);
    });

    it.skipIf(!preset)("calls the hooks for each step of an async function after an await, with the name of the async function", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        async function loadUser() : Promise<string | undefined> {
            await null;
            await null;
            return variable.get();
        }
        expect(await variable.run("u", () => loadUser())).toBe("u");
        const steps = calls.filter((call) => call.source === "await");
        // The first step is a direct call, not a callback. The two steps after the awaits call the hooks.
        expect(steps).toEqual([
            { phase : "before", source : "await", name : "loadUser", value : "u" },
            { phase : "after", source : "await", name : "loadUser", value : "u" },
            { phase : "before", source : "await", name : "loadUser", value : "u" },
            { phase : "after", source : "await", name : "loadUser", value : "u" },
        ]);
    });

    it.skipIf(!preset)("calls after for a step that throws after an await, and the promise of the call rejects", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        async function failLater() : Promise<never> {
            await null;
            throw new Error("late");
        }
        await expect(variable.run("f", () => failLater())).rejects.toThrow("late");
        expect(calls.filter((call) => call.source === "await").map((call) => `${call.phase} ${call.name} ${String(call.value)}`)).toEqual([
            "before failLater f",
            "after failLater f",
        ]);
    });

    it.skipIf(!preset)("calls the hooks for each step of an async generator after an await, in the context of the generator", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        async function* ticks() : AsyncGenerator<string | undefined> {
            await null;
            yield variable.get();
        }
        const values : unknown[] = [];
        const consume = async () : Promise<void> => {
            for await (const value of ticks()) {
                values.push(value);
            }
        };
        await variable.run("g", consume);
        expect(values).toEqual(["g"]);
        // The step after the await of the generator body, with the name of the async generator
        const steps = calls.filter((call) => call.source === "await" && call.name === "ticks");
        expect(steps).toEqual([
            { phase : "before", source : "await", name : "ticks", value : "g" },
            { phase : "after", source : "await", name : "ticks", value : "g" },
        ]);
    });

    it.skipIf(!preset)("calls the hooks for the step of return() at a yield, after the await of the value of return()", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const log : unknown[] = [];
        async function* closing() : AsyncGenerator<number> {
            try {
                yield 1;
            } finally {
                log.push(variable.get());
            }
        }
        const generator = variable.run("r", () => closing());
        await generator.next();
        expect(await generator.return(2)).toEqual({ value : 2, done : true });
        expect(log).toEqual(["r"]);
        expect(calls.filter((call) => call.source === "await").map((call) => `${call.phase} ${call.name}`)).toEqual(["before closing", "after closing"]);
    });

    it.skipIf(!preset)("calls the hooks for a request of an async generator that waits in the queue, and for the step after a rejected await", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        async function* pair() : AsyncGenerator<unknown, void, unknown> {
            const received : unknown = yield 1;
            yield received;
        }
        async function* recovering() : AsyncGenerator<string> {
            try {
                await Promise.reject(new Error("rejected"));
            } catch {
                yield "recovered";
            }
        }
        const queued = variable.run("q", () => pair());
        expect(await Promise.all([queued.next(), queued.next("x")])).toEqual([{ value : 1, done : false }, { value : "x", done : false }]);
        expect(await variable.run("q", () => recovering()).next()).toEqual({ value : "recovered", done : false });
        expect(calls.filter((call) => call.source === "await").map((call) => `${call.phase} ${call.name}`)).toEqual([
            "before pair",
            "after pair",
            "before recovering",
            "after recovering",
        ]);
    });

    it.skipIf(!preset)("calls the hooks for each step of an async generator after a step of yield*, also after a rejection of the delegate", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        async function* inner() : AsyncGenerator<number> {
            yield 1;
        }
        const failing : AsyncIterable<number> = { [Symbol.asyncIterator] : () => ({ next : () => Promise.reject(new Error("failed")) }) };
        let failed = false;
        async function* outer() : AsyncGenerator<number> {
            yield* inner();
            try {
                yield* failing;
            } catch {
                failed = true;
            }
        }
        const values = await variable.run("d", async () => {
            const seen : unknown[] = [];
            for await (const value of outer()) {
                seen.push(value);
            }
            return seen;
        });
        expect(values).toEqual([1]);
        expect(failed).toBe(true);
        // The steps after the first and the last step of inner(), and after the rejection
        expect(calls.filter((call) => call.source === "await" && call.name === "outer").map((call) => call.phase)).toEqual(["before", "after", "before", "after", "before", "after"]);
    });

    it.skipIf(!preset)("gives the steps of an anonymous async function a callback with the empty name, and configurable names as native functions have", async () => {
        const variable = new Variable<string>();
        const seen : Function[] = [];
        removers.push(addCallbackHook({ before : (callback, source) => { if (source === "await" && variable.get() === "n") seen.push(callback); } }));
        async function named() : Promise<void> {
            await null;
        }
        const anonymous = [async () : Promise<void> => { await null; }][0] as () => Promise<void>;
        await variable.run("n", named);
        await variable.run("n", anonymous);
        expect(seen.map((callback) => callback.name)).toEqual(["named", ""]);
        for (const callback of seen) {
            expect(Object.getOwnPropertyDescriptor(callback, "name")).toMatchObject({ writable : false, enumerable : false, configurable : true });
        }
    });

    it.skipIf(!preset)("gives the awaited values and the values of next() to an async function and an async generator that a hook starts", async () => {
        async function double(value : number) : Promise<number> {
            const awaited = await Promise.resolve(value);
            return awaited * 2;
        }
        async function* echo() : AsyncGenerator<string, void, string> {
            const received = yield "ready";
            yield `got ${received}`;
        }
        let doubled : Promise<number> | undefined;
        let generator : AsyncGenerator<string, void, string> | undefined;
        removers.push(addCallbackHook({
            before() {
                doubled ??= double(2);
                generator ??= echo();
            },
        }));
        await Promise.resolve().then(() => undefined);
        expect(await doubled).toBe(4);
        await generator?.next("first");
        expect(await generator?.next("x")).toEqual({ value : "got x", done : false });
    });

    it.skipIf(!preset)("gives the name of an async method and of an async arrow function in a variable", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const fetchPrice = async () : Promise<void> => { await null; };
        class Cart {
            async checkout() : Promise<void> {
                await fetchPrice();
            }
        }
        await variable.run("c", () => new Cart().checkout());
        const names = new Set(calls.filter((call) => call.source === "await").map((call) => call.name));
        expect(names).toEqual(new Set(["fetchPrice", "checkout"]));
    });

    it("calls the before methods in the order of registration, and the after methods in the opposite order", async () => {
        const variable = new Variable<string>();
        const order : string[] = [];
        for (const label of ["A", "B"]) {
            removers.push(addCallbackHook({
                before : () => { if (variable.get() === "o") order.push(`before ${label}`); },
                after : () => { if (variable.get() === "o") order.push(`after ${label}`); },
            }));
        }
        await variable.run("o", () => Promise.resolve().then(() => { order.push("callback"); }));
        expect(order).toEqual(["before A", "before B", "callback", "after B", "after A"]);
    });

    it("calls after also when the callback throws", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const result = variable.run("t", () => Promise.resolve().then(function fails() { throw new Error("boom"); }));
        await expect(result).rejects.toThrow("boom");
        expect(calls.map((call) => `${call.phase} ${call.name}`)).toEqual(["before fails", "after fails"]);
    });

    it("gives an error of a hook to reportError, and starts the callback as usual", async () => {
        const variable = new Variable<string>();
        const holder = globalThis as { reportError? : (error : unknown) => void };
        const nativeReportError = holder.reportError;
        const reported : unknown[] = [];
        holder.reportError = (error) => { reported.push(error); };
        try {
            const error = new Error("hook error");
            removers.push(addCallbackHook({ before : () => { if (variable.get() === "e") throw error; } }));
            const value = await variable.run("e", () => Promise.resolve().then(() => variable.get()));
            expect(value).toBe("e");
            expect(reported).toEqual([error]);
        } finally {
            if (nativeReportError === undefined) {
                delete holder.reportError;
            } else {
                holder.reportError = nativeReportError;
            }
        }
    });

    it("gives an error of an after method to reportError, and keeps the result of the callback", async () => {
        const variable = new Variable<string>();
        const holder = globalThis as { reportError? : (error : unknown) => void };
        const nativeReportError = holder.reportError;
        const reported : unknown[] = [];
        holder.reportError = (error) => { reported.push(error); };
        try {
            const error = new Error("after error");
            removers.push(addCallbackHook({ after : () => { if (variable.get() === "a") throw error; } }));
            const value = await variable.run("a", () => Promise.resolve().then(() => `${variable.get() ?? "none"} value`));
            expect(value).toBe("a value");
            expect(reported).toEqual([error]);
        } finally {
            if (nativeReportError === undefined) {
                delete holder.reportError;
            } else {
                holder.reportError = nativeReportError;
            }
        }
    });

    it("does not let a hook change the context of the callback", async () => {
        const storage = new AsyncLocalStorage<string>();
        removers.push(addCallbackHook({ before : () => { if (storage.getStore() === "mine") storage.enterWith("hook"); } }));
        const value = await storage.run("mine", () => Promise.resolve().then(() => storage.getStore()));
        expect(value).toBe("mine");
    });

    it("does not call the hooks for a callback that starts synchronously in a hook", async () => {
        const variable = new Variable<string>();
        const target = new EventTarget();
        const sources : string[] = [];
        let listenerCalls = 0;
        target.addEventListener("inner", () => { listenerCalls++; });
        removers.push(addCallbackHook({
            before : (_callback, source) => {
                if (variable.get() !== "r") {
                    return;
                }
                sources.push(source);
                target.dispatchEvent(new Event("inner"));
            },
        }));
        await variable.run("r", () => Promise.resolve().then(() => undefined));
        expect(sources).toEqual(["Promise.then"]);
        expect(listenerCalls).toBe(1);
    });

    it("starts the callback when a getter of a hook method throws, or when reportError throws", async () => {
        const variable = new Variable<string>();
        const holder = globalThis as { reportError? : (error : unknown) => void };
        const nativeReportError = holder.reportError;
        holder.reportError = () => { throw new Error("report failed"); };
        try {
            const hook = {} as CallbackHook;
            Object.defineProperty(hook, "before", { get() { if (variable.get() === "g") throw new Error("getter"); return undefined; } });
            removers.push(addCallbackHook(hook));
            removers.push(addCallbackHook({ after : () => { if (variable.get() === "g") throw new Error("after"); } }));
            const value = await variable.run("g", () => Promise.resolve().then(() => variable.get()));
            expect(value).toBe("g");
        } finally {
            if (nativeReportError === undefined) {
                delete holder.reportError;
            } else {
                holder.reportError = nativeReportError;
            }
        }
    });

    it("does not start the hooks for a callback that a hook schedules, so a hook cannot start itself without end", async () => {
        const variable = new Variable<string>();
        const sources : string[] = [];
        const scheduled = Promise.withResolvers<void>();
        removers.push(addCallbackHook({
            after : (_callback, source) => {
                if (variable.get() !== "s") {
                    return;
                }
                sources.push(source);
                // A flush that a hook schedules with a patched API
                setTimeout(() => scheduled.resolve(), 0);
            },
        }));
        await variable.run("s", () => Promise.resolve().then(() => undefined));
        await scheduled.promise;
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(sources).toEqual(["Promise.then"]);
    });

    it.skipIf(!preset)("does not start the hooks for the steps of an async function that a hook starts, so a hook cannot start itself without end", async () => {
        let afterSend = 0;
        async function send() : Promise<void> {
            await null;
            await null;
        }
        removers.push(addCallbackHook({
            after(callback, source) {
                if (source === "await" && callback.name === "send" && afterSend++ < 1000) {
                    void send();
                }
            },
        }));
        await send();
        await delay(10);
        // The two steps of the first call start the hooks. The calls that the hook starts are quiet.
        expect(afterSend).toBe(2);
    });

    it.skipIf(!preset)("does not start the hooks for the steps of an async generator that a hook makes", async () => {
        let afterTicks = 0;
        let generator : AsyncGenerator<number> | undefined;
        async function* ticks() : AsyncGenerator<number> {
            await null;
            yield 1;
            await null;
            yield 2;
        }
        removers.push(addCallbackHook({
            before() {
                generator ??= ticks();
            },
            after(callback, source) {
                if (source === "await" && callback.name === "ticks") {
                    afterTicks++;
                }
            },
        }));
        await Promise.resolve().then(() => undefined);
        const values : number[] = [];
        for await (const value of generator ?? ticks()) {
            values.push(value);
        }
        expect(values).toEqual([1, 2]);
        expect(afterTicks).toBe(0);
    });

    it.skipIf(!preset)("does not start the hooks for an async function that a quiet callback starts, also through a chain of callbacks", async () => {
        let afterSend = 0;
        async function send() : Promise<void> {
            await null;
        }
        removers.push(addCallbackHook({
            after(callback) {
                if (callback.name === "trigger") {
                    // A then callback that a hook registers is quiet, and so is the async function that it starts
                    void Promise.resolve().then(() => setTimeout(() => void send(), 0));
                }
                if (callback.name === "send") {
                    afterSend++;
                }
            },
        }));
        setTimeout(function trigger() { /* the first callback */ }, 0);
        await delay(30);
        expect(afterSend).toBe(0);
    });

    it("tells one time on the console when an older copy without hooks installed some patches", () => {
        const holder = globalThis as unknown as Record<symbol, unknown>;
        const store = holder[Symbol.for("async-browser-context/store/v1")] as { oldCopyPatches? : ReadonlySet<string> | undefined };
        const saved = store.oldCopyPatches;
        const warnings : unknown[] = [];
        const nativeWarn = console.warn;
        console.warn = (...args : unknown[]) => { warnings.push(args.join(" ")); };
        try {
            // Patches of version 0.2 and later start the hooks: no warning
            removers.push(addCallbackHook({}));
            expect(warnings).toEqual([]);
            // As if a copy of version 0.1 made the store and installed three patches
            store.oldCopyPatches = new Set(["timers", "Function.prototype.toString", "events"]);
            removers.push(addCallbackHook({}));
            removers.push(addCallbackHook({}));
        } finally {
            console.warn = nativeWarn;
            store.oldCopyPatches = saved;
        }
        expect(warnings).toHaveLength(1);
        expect(String(warnings[0])).toContain("older copy of the library");
        // The patch of toString has no callbacks
        expect(String(warnings[0])).toMatch(/: timers, events$/);
    });

    it("starts a callback that has its own call and apply properties", async () => {
        const variable = new Variable<string>();
        const callback = Object.assign((value : number) => value + 1, { call : 1, apply : 2 });
        expect(await variable.run("c", () => Promise.resolve(1).then(callback))).toBe(2);
        expect(await new Promise((resolve) => setTimeout(Object.assign(() => resolve("timer"), { apply : null }), 0))).toBe("timer");
    });

    it("stops the calls when the hook is removed, and keeps the other hooks", async () => {
        const variable = new Variable<string>();
        const first = record(variable, "first:");
        const second = record(variable, "second:");
        removers[0]?.();
        removers[0]?.();
        await variable.run("x", () => Promise.resolve().then(function step() { return 1; }));
        expect(first).toEqual([]);
        expect(second.map((call) => call.name)).toEqual(["second:step", "second:step"]);
    });

    it("shows the name asyncBrowserContextWrapper in the stack of a callback", async () => {
        const stack = await new Promise<string>((resolve) => setTimeout(() => resolve(new Error("stack").stack ?? ""), 1));
        expect(stack).toContain("asyncBrowserContextWrapper");
    });
});

describe.skipIf(runtime !== "browser" || !inBrowser)("callback hooks for the browser APIs (browser only)", () => {
    it("gives addEventListener and the event type, and the listener", () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const target = new EventTarget();
        function onPing() : void { /* The hook records the call */ }
        target.addEventListener("ping", onPing);
        variable.run("ev", () => target.dispatchEvent(new Event("ping")));
        expect(calls).toEqual([
            { phase : "before", source : "addEventListener:ping", name : "onPing", value : "ev" },
            { phase : "after", source : "addEventListener:ping", name : "onPing", value : "ev" },
        ]);
    });

    it("gives the handleEvent method of a listener object", () => {
        const variable = new Variable<string>();
        const seen : Function[] = [];
        removers.push(addCallbackHook({ before : (callback) => { if (variable.get() === "h") seen.push(callback); } }));
        const listener = { handleEvent() : void { /* The hook records the call */ } };
        const target = new EventTarget();
        target.addEventListener("ping", listener);
        variable.run("h", () => target.dispatchEvent(new Event("ping")));
        expect(seen).toEqual([listener.handleEvent]);
    });

    it("gives the name of the on... property for an event handler", () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const button = document.createElement("button");
        button.onclick = function onButtonClick() { /* The hook records the call */ };
        variable.run("click", () => button.click());
        expect(calls.map((call) => `${call.phase} ${call.source} ${call.name}`)).toEqual(["before onclick onButtonClick", "after onclick onButtonClick"]);
    });

    it("gives the name of the observer class", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const element = document.createElement("div");
        const done = deferred<void>();
        const observer = variable.run("m", () => new MutationObserver(function onMutation() { done.resolve(); }));
        observer.observe(element, { attributes : true });
        element.setAttribute("data-x", "1");
        await done.promise;
        observer.disconnect();
        expect(calls.map((call) => `${call.phase} ${call.source} ${call.name}`)).toEqual(["before MutationObserver onMutation", "after MutationObserver onMutation"]);
    });

    it("gives the stream class and the method of the underlying source", async () => {
        const variable = new Variable<string>();
        const calls = record(variable);
        const stream = variable.run("s", () => new ReadableStream<number>({
            pull(controller) {
                controller.enqueue(1);
                controller.close();
            },
        }));
        const reader = stream.getReader();
        expect((await reader.read()).value).toBe(1);
        expect(calls.filter((call) => call.source.startsWith("ReadableStream")).map((call) => `${call.phase} ${call.source} ${call.name}`))
            .toEqual(["before ReadableStream.pull pull", "after ReadableStream.pull pull"]);
    });
});
