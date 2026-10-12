import { describe, expect, it } from "vitest";
import { Snapshot, Variable } from "async-browser-context";

/**
 * Rule C12: the library does not keep objects in memory after the program has
 * no reference to them. The project starts Node.js with `--expose-gc`.
 */
const gc = (globalThis as { gc? : () => void }).gc;

/** Runs the garbage collector, with tasks between the runs so that finalization can occur. */
async function collect() : Promise<void> {
    if (gc === undefined) {
        // Without the flag, each test fails: a skip hides a change of the configuration
        throw new Error("The memory tests need the garbage collector: start Node.js with --expose-gc");
    }
    for (let index = 0; index < 4; index++) {
        gc();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe("rule C12: the library does not keep objects in memory", () => {
    it("releases the first promise of a long then chain while the program keeps the last promise", async () => {
        let promise = Promise.resolve(0);
        const first = new WeakRef(promise);
        for (let index = 0; index < 100_000; index++) {
            promise = promise.then((value) => value + 1);
        }
        expect(await promise).toBe(100_000);
        await collect();
        expect(first.deref()).toBeUndefined();
        expect(promise).toBeInstanceOf(Promise);
    });

    it("releases the value of a synchronous run() after the run", async () => {
        const variable = new Variable<object>();
        const reference = ((): WeakRef<object> => {
            const value = {};
            variable.run(value, () => variable.get());
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeUndefined();
    });

    it("releases the value of an async run() after its last step", async () => {
        const variable = new Variable<object>();
        const reference = await (async () : Promise<WeakRef<object>> => {
            const value = {};
            await variable.run(value, async () => {
                await null;
                await new Promise((resolve) => setTimeout(resolve, 1));
                return variable.get();
            });
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeUndefined();
    });

    it("keeps the value while a snapshot exists, and releases it after", async () => {
        const variable = new Variable<object>();
        let snapshot : Snapshot | undefined;
        const reference = ((): WeakRef<object> => {
            const value = {};
            snapshot = variable.run(value, () => new Snapshot());
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeDefined();
        expect(snapshot?.run(() => variable.get())).toBe(reference.deref());
        snapshot = undefined;
        await collect();
        expect(reference.deref()).toBeUndefined();
    });

    it("releases the context of a timer after the timer is cleared", async () => {
        const variable = new Variable<object>();
        const reference = ((): WeakRef<object> => {
            const value = {};
            const id = variable.run(value, () => setTimeout(() => variable.get(), 60_000));
            clearTimeout(id);
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeUndefined();
    });

    it("releases the context of an event listener after removeEventListener, while the target lives", async () => {
        const variable = new Variable<object>();
        const target = new EventTarget();
        const reference = ((): WeakRef<object> => {
            const value = {};
            const listener = () : void => undefined;
            variable.run(value, () => target.addEventListener("ping", listener));
            target.removeEventListener("ping", listener);
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeUndefined();
        expect(target).toBeInstanceOf(EventTarget);
    });

    it("releases the context of a once listener after it operates, while the target lives", async () => {
        const variable = new Variable<object>();
        const target = new EventTarget();
        const reference = ((): WeakRef<object> => {
            const value = {};
            variable.run(value, () => target.addEventListener("ping", () => undefined, { once : true }));
            target.dispatchEvent(new Event("ping"));
            return new WeakRef(value);
        })();
        await collect();
        expect(reference.deref()).toBeUndefined();
        expect(target).toBeInstanceOf(EventTarget);
    });

    it("releases the target, the listener and the context of a listener with a signal that lives long", async () => {
        const variable = new Variable<object>();
        const controller = new AbortController();
        const references = ((): WeakRef<object>[] => {
            const value = {};
            const target = new EventTarget();
            const listener = () : void => undefined;
            variable.run(value, () => target.addEventListener("ping", listener, { signal : controller.signal }));
            return [new WeakRef(value), new WeakRef(target), new WeakRef(listener)];
        })();
        await collect();
        expect(references.map((reference) => reference.deref())).toEqual([undefined, undefined, undefined]);
        expect(controller.signal.aborted).toBe(false);
    });

    it("runs a FinalizationRegistry callback in the context of the construction", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const registry = variable.run("registry", () => new FinalizationRegistry<string>(() => {
            seen.push(variable.get());
        }));
        variable.run("other", () => {
            registry.register({}, "held");
        });
        await collect();
        expect(seen).toEqual(["registry"]);
    });
});
