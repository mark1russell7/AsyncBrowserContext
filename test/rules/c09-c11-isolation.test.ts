import { describe, expect, it, vi } from "vitest";
import { Snapshot, Variable } from "async-browser-context";
import { inBrowser, runtime } from "../helpers.js";

const STORE_KEY = Symbol.for("async-browser-context/store/v1");
const isBrowserRuntime = runtime === "browser";

describe.skipIf(!isBrowserRuntime)("rule C9: only code that has a Variable can read its values", () => {
    it("puts no global functions of the old runtime on globalThis", () => {
        expect("__getAsyncContext" in globalThis).toBe(false);
        expect("__setAsyncContext" in globalThis).toBe(false);
    });

    it("keeps no values in the global store or in the frames", () => {
        const variable = new Variable<{ secret : string }>();
        const secret = { secret : "password" };
        variable.run(secret, () => {
            const store = (globalThis as unknown as Record<symbol, { current : object }>)[STORE_KEY];
            expect(store).toBeDefined();
            const frame = store?.current ?? {};
            expect(Reflect.ownKeys(frame)).toEqual(["parent"]);
            expect(Object.isFrozen(frame)).toBe(true);
            expect(JSON.stringify(frame)).not.toContain("password");
        });
    });

    it("keeps no public properties on a snapshot", () => {
        const snapshot = new Variable<string>().run("value", () => new Snapshot());
        expect(Reflect.ownKeys(snapshot)).toEqual([]);
    });
});

// A browser cannot load a second instance of the same module graph without a second bundle
describe.skipIf(!isBrowserRuntime || inBrowser)("rule C10: two copies of the library use one context store", () => {
    it("shares the contexts and installs each patch one time", async () => {
        const then = Promise.prototype.then;
        const store = (globalThis as unknown as Record<symbol, { patches : Set<string> }>)[STORE_KEY];
        const patchCount = store?.patches.size;
        // A second copy of the library, as two versions in one bundle: new instances of all its modules
        vi.resetModules();
        const second = await import("async-browser-context");
        expect(second.Variable).not.toBe(Variable);
        expect(Promise.prototype.then).toBe(then);
        expect(store?.patches.size).toBe(patchCount);
        const fromSecond = new second.Variable<string>();
        const seen = await fromSecond.run("x", async () => {
            await null;
            return fromSecond.get();
        });
        expect(seen).toBe("x");
    });
});

describe("rule C11: the library does not change the identity of Promise", () => {
    class TrackedPromise<T> extends Promise<T> {
        tag() : string {
            return "tracked";
        }
    }

    it("keeps Promise subclasses", async () => {
        const tracked = new TrackedPromise<number>((resolve) => resolve(1));
        expect(tracked).toBeInstanceOf(TrackedPromise);
        expect(tracked.tag()).toBe("tracked");
        expect(TrackedPromise.resolve(1)).toBeInstanceOf(TrackedPromise);
        expect(tracked.then((value) => value)).toBeInstanceOf(TrackedPromise);
        expect(await tracked).toBe(1);
    });

    it("keeps the constructor of promises and the native source text", () => {
        expect(Promise.resolve(1).constructor).toBe(Promise);
        expect(Promise.prototype.constructor).toBe(Promise);
        expect(Function.prototype.toString.call(Promise)).toContain("[native code]");
        expect(Function.prototype.toString.call(Promise.prototype.then)).toContain("[native code]");
        // Node.js implements setTimeout in JavaScript, so its original source text is not "[native code]"
        const timerSource = Function.prototype.toString.call(setTimeout);
        expect(timerSource).toMatch(inBrowser ? /\[native code\]/ : /^function setTimeout\(/);
        expect(timerSource).not.toContain("store.current");
        expect(Function.prototype.toString.call(Function.prototype.toString)).toContain("[native code]");
    });

    it("keeps the name and the length of then, and the TypeError of Promise without new", () => {
        expect(Promise.prototype.then.name).toBe("then");
        expect(Promise.prototype.then.length).toBe(2);
        expect(() => (Promise as unknown as () => void)()).toThrow(TypeError);
    });
});
