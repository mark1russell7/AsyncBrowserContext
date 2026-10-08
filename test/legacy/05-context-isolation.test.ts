import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

describe("legacy 05: context isolation", () => {
    it("gives each of 20 sequential runs its own context after an await", async () => {
        const variable = new Variable<string>();
        const results : (string | undefined)[] = [];
        for (let index = 0; index < 20; index++) {
            await variable.run(`ctx-${index}`, async () => {
                await delay(1);
                results.push(variable.get());
            });
        }
        expect(results).toEqual(Array.from({ length : 20 }, (_, index) => `ctx-${index}`));
        expect(variable.get()).toBeUndefined();
    });

    it("gives each of 1000 concurrent runs its own context", async () => {
        const variable = new Variable<string>();
        const operations = Array.from({ length : 1000 }, (_, index) => variable.run(`op-${index}`, async () => {
            // Three delays (0, 1 and 2 ms) mix the order of the continuations
            await delay(index % 3);
            return variable.get();
        }));
        const results = await Promise.all(operations);
        expect(results).toEqual(Array.from({ length : 1000 }, (_, index) => `op-${index}`));
    });

    it("keeps the contexts apart in two concurrent groups of nested runs", async () => {
        const variable = new Variable<string>();
        const group = (outer : string) : Promise<{ readonly outer : string | undefined; readonly inner : (string | undefined)[] }> =>
            variable.run(outer, async () => {
                const inner = await Promise.all([1, 2].map((index) => variable.run(`${outer}-${index}`, async () => {
                    await delay(5);
                    return variable.get();
                })));
                return { outer : variable.get(), inner };
            });
        const results = await Promise.all([group("outer-A"), group("outer-B")]);
        expect(results).toEqual([
            { outer : "outer-A", inner : ["outer-A-1", "outer-A-2"] },
            { outer : "outer-B", inner : ["outer-B-1", "outer-B-2"] },
        ]);
    });

    it("gives each interleaved operation its own context at its start and its end", async () => {
        const variable = new Variable<string>();
        const timeline : { readonly event : string; readonly id : string; readonly ctx : string | undefined }[] = [];
        const operation = (id : string, ms : number) : Promise<string | undefined> => variable.run(id, async () => {
            timeline.push({ event : "start", id, ctx : variable.get() });
            await delay(ms);
            timeline.push({ event : "end", id, ctx : variable.get() });
            return variable.get();
        });
        const results = await Promise.all([operation("fast", 5), operation("medium", 10), operation("slow", 15)]);
        expect(results).toEqual(["fast", "medium", "slow"]);
        expect(timeline).toHaveLength(6);
        expect(timeline.every((entry) => entry.ctx === entry.id)).toBe(true);
    });
});
