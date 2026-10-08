import { describe, expect, it } from "vitest";
import { AsyncLocalStorage, Snapshot, Variable } from "async-browser-context";
import { turns } from "../helpers.js";

describe("rule C8: a snapshot runs functions in the recorded context", () => {
    it("runs a function in the recorded context and sets the previous context again", () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("recorded", () => new Snapshot());
        variable.run("current", () => {
            expect(snapshot.run(() => variable.get())).toBe("recorded");
            expect(variable.get()).toBe("current");
        });
    });

    it("records the values of all variables", () => {
        const first = new Variable<string>();
        const second = new Variable<number>();
        const snapshot = first.run("one", () => second.run(2, () => new Snapshot()));
        expect(snapshot.run(() => [first.get(), second.get()])).toEqual(["one", 2]);
    });

    it("sends the arguments to the function and gives its result", () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("recorded", () => new Snapshot());
        expect(snapshot.run((a : number, b : number) => `${variable.get() ?? ""}${a + b}`, 1, 2)).toBe("recorded3");
    });

    it("sets the previous context again when the function throws", () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("recorded", () => new Snapshot());
        variable.run("current", () => {
            expect(() => snapshot.run(() => { throw new Error("stop"); })).toThrow("stop");
            expect(variable.get()).toBe("current");
        });
    });

    it("records the context after an await", async () => {
        const variable = new Variable<string>();
        const snapshot = await variable.run("recorded", async () => {
            await turns(2);
            return new Snapshot();
        });
        expect(snapshot.run(() => variable.get())).toBe("recorded");
    });

    it("gives the recorded context to async code that starts inside run()", async () => {
        const variable = new Variable<string>();
        const snapshot = variable.run("recorded", () => new Snapshot());
        const seen = await variable.run("current", () => snapshot.run(async () => {
            await turns(2);
            return variable.get();
        }));
        expect(seen).toBe("recorded");
    });

    it("wraps a function with Snapshot.wrap and keeps this, the arguments, the name and the length", () => {
        const variable = new Variable<string>();
        function named(this : { id : number }, a : number, b : number) : string {
            return `${this.id}:${a + b}:${variable.get() ?? ""}`;
        }
        const wrapped = variable.run("recorded", () => Snapshot.wrap(named));
        expect(variable.run("current", () => wrapped.call({ id : 7 }, 1, 2))).toBe("7:3:recorded");
        expect(wrapped.name).toBe("named");
        expect(wrapped.length).toBe(2);
    });

    it("throws a TypeError when Snapshot.wrap gets a value that is not a function", () => {
        expect(() => Snapshot.wrap(42 as unknown as () => void)).toThrow(TypeError);
    });

    it("gives the same rule to AsyncLocalStorage.bind and AsyncLocalStorage.snapshot", () => {
        const storage = new AsyncLocalStorage<string>();
        const bound = storage.run("recorded", () => AsyncLocalStorage.bind(() => storage.getStore()));
        const runInRecorded = storage.run("recorded", () => AsyncLocalStorage.snapshot());
        storage.run("current", () => {
            expect(bound()).toBe("recorded");
            expect(runInRecorded(() => storage.getStore())).toBe("recorded");
            expect(storage.getStore()).toBe("current");
        });
    });
});
