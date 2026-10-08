import { describe, expect, it } from "vitest";
import { AsyncLocalStorage } from "async-browser-context";
import { busyOther, runtime, turns } from "../helpers.js";
import { Variable } from "async-browser-context";

/**
 * These tests state the behavior of AsyncLocalStorage on Node.js. On the
 * Node.js projects, they examine the native class. On the browser runtime,
 * they examine the class of this library. Thus, the two classes agree.
 */
describe(`AsyncLocalStorage (${runtime} runtime)`, () => {
    it("gives undefined outside run(), or the default value of the options", () => {
        expect(new AsyncLocalStorage<number>().getStore()).toBeUndefined();
        expect(new AsyncLocalStorage({ defaultValue : 5 }).getStore()).toBe(5);
    });

    it("gives the name of the options, or the empty string", () => {
        expect(new AsyncLocalStorage({ name : "requests" }).name).toBe("requests");
        expect(new AsyncLocalStorage().name).toBe("");
    });

    it("sets the store in run(), sends the arguments and gives the result", () => {
        const storage = new AsyncLocalStorage<string>();
        const result = storage.run("store", (a : number, b : number) => `${storage.getStore() ?? ""}:${a + b}`, 1, 2);
        expect(result).toBe("store:3");
        expect(storage.getStore()).toBeUndefined();
    });

    it("keeps the store through await while another store resumes first", async () => {
        const storage = new AsyncLocalStorage<string>();
        const other = new Variable<string>();
        const seen = await storage.run("mine", async () => {
            const busy = storage.run("other", async () => {
                await turns(3);
            });
            const unrelated = busyOther(other, "unrelated");
            await null;
            const value = { first : await null, store : storage.getStore() };
            await busy;
            await unrelated;
            return value.store;
        });
        expect(seen).toBe("mine");
    });

    it("gives undefined in exit(), also with a default value, and gives the result of the callback", () => {
        const storage = new AsyncLocalStorage({ defaultValue : "default" });
        const seen = storage.run("store", () => {
            const inExit = storage.exit((a : number) => ({ store : storage.getStore(), a }), 7);
            return { inExit, after : storage.getStore() };
        });
        expect(seen).toEqual({ inExit : { store : undefined, a : 7 }, after : "store" });
    });

    it("keeps the store of enterWith() after await in the same async function", async () => {
        const storage = new AsyncLocalStorage<string>();
        const seen = await storage.run("outer", async () => {
            storage.enterWith("entered");
            await turns(2);
            return storage.getStore();
        });
        expect(seen).toBe("entered");
        expect(storage.getStore()).toBeUndefined();
    });

    it("ends the effect of enterWith() inside run() when run() returns", () => {
        const storage = new AsyncLocalStorage<string>();
        storage.run("outer", () => {
            storage.run("inner", () => {
                storage.enterWith("entered");
                expect(storage.getStore()).toBe("entered");
            });
            expect(storage.getStore()).toBe("outer");
        });
    });

    it("gives undefined after disable() until the next run()", () => {
        const storage = new AsyncLocalStorage<string>();
        storage.run("store", () => {
            storage.disable();
            expect(storage.getStore()).toBeUndefined();
        });
        expect(storage.run("again", () => storage.getStore())).toBe("again");
    });

    it("keeps the stores of two storages apart", () => {
        const first = new AsyncLocalStorage<string>();
        const second = new AsyncLocalStorage<string>();
        first.run("one", () => second.run("two", () => {
            expect([first.getStore(), second.getStore()]).toEqual(["one", "two"]);
        }));
    });

    it("gives the store to then callbacks and timers", async () => {
        const storage = new AsyncLocalStorage<string>();
        const fromThen = storage.run("then", () => Promise.resolve().then(() => storage.getStore()));
        const fromTimer = storage.run("timer", () => new Promise((resolve) => setTimeout(() => resolve(storage.getStore()), 1)));
        expect(await Promise.all([fromThen, fromTimer])).toEqual(["then", "timer"]);
    });
});
