import { describe, expect, it } from "vitest";
import { AsyncContext, Variable } from "async-browser-context";
import { delay } from "../helpers.js";

const { Snapshot } = AsyncContext;
type Snapshot = InstanceType<typeof Snapshot>;

describe("legacy 07: AsyncContext.Snapshot", () => {
    it("restores the recorded context outside run(), also from inside another context", async () => {
        const variable = new Variable<string>();
        const snapshot = await variable.run("capture-ctx", async () => {
            await delay(5);
            return new Snapshot();
        });
        expect(snapshot.run(() => variable.get())).toBe("capture-ctx");
        expect(variable.run("other", () => snapshot.run(() => variable.get()))).toBe("capture-ctx");
        expect(variable.get()).toBeUndefined();
    });

    it("restores a context that a nested run() recorded", async () => {
        const variable = new Variable<string>();
        let inner : Snapshot | undefined;
        const outerAfter = await variable.run("outer", async () => {
            await variable.run("inner", async () => {
                inner = new Snapshot();
            });
            return variable.get();
        });
        expect(outerAfter).toBe("outer");
        expect(inner?.run(() => variable.get())).toBe("inner");
    });

    it("keeps each of three snapshots apart", async () => {
        const variable = new Variable<string>();
        const snapshots : Snapshot[] = [];
        for (const value of ["snap-1", "snap-2", "snap-3"]) {
            await variable.run(value, async () => {
                snapshots.push(new Snapshot());
            });
        }
        expect(snapshots.map((snapshot) => snapshot.run(() => variable.get()))).toEqual(["snap-1", "snap-2", "snap-3"]);
    });

    it("restores the recorded context in an async function that snapshot.run() starts later", async () => {
        const variable = new Variable<string>();
        let snapshot : Snapshot | undefined;
        await variable.run("original", async () => {
            snapshot = new Snapshot();
            await delay(5);
        });
        await delay(10);
        const result = await snapshot?.run(async () => {
            await delay(5);
            return variable.get();
        });
        expect(result).toBe("original");
    });

    it("restores nested snapshots and sets the outer context again after the inner one", async () => {
        const variable = new Variable<string>();
        let outer : Snapshot | undefined;
        let inner : Snapshot | undefined;
        await variable.run("outer", async () => {
            outer = new Snapshot();
            await variable.run("inner", async () => {
                inner = new Snapshot();
            });
        });
        const seen : (string | undefined)[] = [];
        outer?.run(() => {
            seen.push(variable.get());
            inner?.run(() => {
                seen.push(variable.get());
            });
            seen.push(variable.get());
        });
        expect(seen).toEqual(["outer", "inner", "outer"]);
    });

    it("keeps the recorded context through awaits and a nested run() in snapshot.run()", async () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("snap-ctx", () => new Snapshot());
        const seen : (string | undefined)[] = [];
        const result = await snapshot.run(async () => {
            seen.push(variable.get());
            await delay(5);
            seen.push(variable.get());
            await variable.run("nested-in-restore", async () => {
                seen.push(variable.get());
            });
            seen.push(variable.get());
            return variable.get();
        });
        expect(result).toBe("snap-ctx");
        expect(seen).toEqual(["snap-ctx", "snap-ctx", "nested-in-restore", "snap-ctx"]);
    });

    it("restores the same snapshot five times", async () => {
        const variable = new Variable<string>();
        const snapshot = await variable.run("reusable", async () => new Snapshot());
        const results = Array.from({ length : 5 }, () => snapshot.run(() => variable.get()));
        expect(results).toEqual(["reusable", "reusable", "reusable", "reusable", "reusable"]);
    });

    it("records the values of two variables", async () => {
        const first = new Variable<string>();
        const second = new Variable<string>();
        const snapshot = await first.run("value-1", () => second.run("value-2", async () => {
            await null;
            return new Snapshot();
        }));
        expect(snapshot.run(() => [first.get(), second.get()])).toEqual(["value-1", "value-2"]);
    });

    it("records no value for a variable that the context does not set", async () => {
        const first = new Variable<string>();
        const second = new Variable<string>();
        const snapshot = await first.run("only-ctx1", async () => new Snapshot());
        expect(second.run("later", () => snapshot.run(() => [first.get(), second.get()]))).toEqual(["only-ctx1", undefined]);
    });

    it("gives the default value of a variable that the recorded context does not set", async () => {
        const first = new Variable({ defaultValue : "default-1" });
        const second = new Variable({ defaultValue : "default-2" });
        const snapshot = await first.run("custom-1", async () => new Snapshot());
        expect(snapshot.run(() => [first.get(), second.get()])).toEqual(["custom-1", "default-2"]);
    });
});
