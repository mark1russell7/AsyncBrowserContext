import { AsyncLocalStorage as NodeAsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import { createCompatibleStorage } from "./compatible-storage.js";

/**
 * The subclass of Node.js 22 gets the same tests as the native class of
 * Node.js 24 in test/api/async-local-storage.test.ts. The subclass works on
 * each Node.js version, so these tests run also on Node.js 24 and later.
 */
const AsyncLocalStorage = createCompatibleStorage(NodeAsyncLocalStorage);

describe("the AsyncLocalStorage subclass for Node.js 22", () => {
    it("gives undefined outside run(), or the default value of the options", () => {
        expect(new AsyncLocalStorage<number>().getStore()).toBeUndefined();
        expect(new AsyncLocalStorage({ defaultValue : 5 } as never).getStore()).toBe(5);
    });

    it("gives the name of the options, or the empty string", () => {
        expect(new AsyncLocalStorage({ name : "requests" } as never).name).toBe("requests");
        expect(new AsyncLocalStorage().name).toBe("");
    });

    it("sets the store in run(), sends the arguments and gives the result", () => {
        const storage = new AsyncLocalStorage<string>();
        expect(storage.run("store", (a : number, b : number) => `${storage.getStore() ?? ""}:${a + b}`, 1, 2)).toBe("store:3");
        expect(storage.getStore()).toBeUndefined();
    });

    it("gives undefined in exit(), also with a default value", () => {
        const storage = new AsyncLocalStorage<string>({ defaultValue : "default" } as never);
        storage.run("store", () => {
            storage.exit(() => {
                expect(storage.getStore()).toBeUndefined();
            });
            expect(storage.getStore()).toBe("store");
        });
        expect(storage.getStore()).toBe("default");
    });

    it("gives an explicit undefined store, not the default value", () => {
        const storage = new AsyncLocalStorage<string | undefined>({ defaultValue : "default" } as never);
        expect(storage.run(undefined, () => storage.getStore())).toBeUndefined();
    });

    it("keeps the store of enterWith() after await in the same async function", async () => {
        const storage = new AsyncLocalStorage<string>();
        const seen = await storage.run("outer", async () => {
            storage.enterWith("entered");
            await null;
            return storage.getStore();
        });
        expect(seen).toBe("entered");
    });

    it("gives undefined after disable() until the next run(), also with a default value", () => {
        const storage = new AsyncLocalStorage<string>({ defaultValue : "default" } as never);
        storage.run("store", () => {
            storage.disable();
            expect(storage.getStore()).toBeUndefined();
        });
        expect(storage.run("again", () => storage.getStore())).toBe("again");
    });

    it("keeps the store through await while another store resumes first", async () => {
        const storage = new AsyncLocalStorage<string>();
        const other = storage.run("other", async () => {
            await null;
            await null;
        });
        const seen = await storage.run("mine", async () => ({ first : await null, store : storage.getStore() }).store);
        await other;
        expect(seen).toBe("mine");
    });
});
