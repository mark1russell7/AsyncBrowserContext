import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { deferred, inBrowser } from "../helpers.js";

function after<T>(schedule : (callback : () => void) => void, read : () => T) : Promise<T> {
    const done = deferred<T>();
    schedule(() => done.resolve(read()));
    return done.promise;
}

describe("rule C6: a timer callback runs in the context of the call that scheduled it", () => {
    it("applies the rule to setTimeout with two contexts", async () => {
        const variable = new Variable<string>();
        const fromA = variable.run("a", () => after((callback) => setTimeout(callback, 5), () => variable.get()));
        const fromB = variable.run("b", () => after((callback) => setTimeout(callback, 1), () => variable.get()));
        expect(await Promise.all([fromA, fromB])).toEqual(["a", "b"]);
    });

    it("sends the extra arguments of setTimeout to the callback", async () => {
        const variable = new Variable<string>();
        const done = deferred<string>();
        variable.run("a", () => setTimeout((first : string, second : string) => done.resolve(`${first}${second}${variable.get() ?? ""}`), 1, "x", "y"));
        expect(await done.promise).toBe("xya");
    });

    it("applies the rule to each call of a setInterval callback", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const done = deferred();
        variable.run("interval", () => {
            const id = setInterval(() => {
                seen.push(variable.get());
                if (seen.length === 3) {
                    clearInterval(id);
                    done.resolve();
                }
            }, 1);
        });
        await variable.run("other", async () => {
            await done.promise;
        });
        expect(seen).toEqual(["interval", "interval", "interval"]);
    });

    it("applies the rule to queueMicrotask", async () => {
        const variable = new Variable<string>();
        const fromA = variable.run("a", () => after(queueMicrotask, () => variable.get()));
        const fromB = variable.run("b", () => after(queueMicrotask, () => variable.get()));
        expect(await Promise.all([fromA, fromB])).toEqual(["a", "b"]);
    });

    it.skipIf(typeof setImmediate !== "function")("applies the rule to setImmediate where it exists", async () => {
        const variable = new Variable<string>();
        expect(await variable.run("a", () => after(setImmediate, () => variable.get()))).toBe("a");
    });

    it("lets clearTimeout stop a callback", async () => {
        const variable = new Variable<string>();
        let called = false;
        const id = variable.run("a", () => setTimeout(() => { called = true; }, 1));
        clearTimeout(id);
        await after((callback) => setTimeout(callback, 10), () => undefined);
        expect(called).toBe(false);
    });

    it("gives a string callback to the native setTimeout without a change", async () => {
        const schedule = setTimeout as unknown as (handler : string, timeout : number) => unknown;
        if (inBrowser) {
            // A browser evaluates the string as a script
            const holder = globalThis as unknown as Record<string, unknown>;
            schedule("globalThis.__asyncBrowserContextStringTimer = 'ran';", 0);
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(holder["__asyncBrowserContextStringTimer"]).toBe("ran");
            delete holder["__asyncBrowserContextStringTimer"];
        } else {
            // Node.js refuses a string, also through the patch
            const native = process.getBuiltinModule("node:timers").setTimeout as unknown as (handler : string, timeout : number) => unknown;
            expect(() => native("1", 0)).toThrow(TypeError);
            expect(() => schedule("1", 0)).toThrow(TypeError);
        }
    });

    it("keeps the names and lengths of the timer functions", () => {
        expect(setTimeout.name).toBe("setTimeout");
        expect(setInterval.name).toBe("setInterval");
        expect(queueMicrotask.name).toBe("queueMicrotask");
        // The browsers use the lengths of WebIDL. On Node.js, the module node:timers keeps the unpatched functions.
        const timers = inBrowser ? undefined : process.getBuiltinModule("node:timers");
        expect(setTimeout.length).toBe(timers?.setTimeout.length ?? 1);
        expect(setInterval.length).toBe(timers?.setInterval.length ?? 1);
        expect(queueMicrotask.length).toBe(1);
    });
});
