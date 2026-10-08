import { describe, expect, it } from "vitest";
import { Snapshot, Variable } from "async-browser-context";

/**
 * Rule C12: the library does not keep objects in memory after the program has
 * no reference to them. The project starts Node.js with `--expose-gc`.
 */
const gc = (globalThis as { gc? : () => void }).gc;

/** Runs the garbage collector, with tasks between the runs so that finalization can occur. */
async function collect() : Promise<void> {
    for (let index = 0; index < 4; index++) {
        gc?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe.skipIf(gc === undefined)("rule C12: the library does not keep objects in memory", () => {
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
