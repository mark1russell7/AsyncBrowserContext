import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

/** The ids of the values that are not equal to the expected ids. */
function mismatches(values : readonly unknown[], expected : (index : number) => unknown) : number[] {
    return values.flatMap((value, index) => (value === expected(index) ? [] : [index]));
}

describe("legacy 16: extreme concurrency", () => {
    it("gives each of 5000 concurrent runs its own context", async () => {
        const variable = new Variable<string>();
        const results = await Promise.all(Array.from({ length : 5000 }, (_, index) => variable.run(`op-${index}`, async () => {
            // Five delays mix the order of the continuations
            await delay(index % 5);
            return variable.get();
        })));
        expect(mismatches(results, (index) => `op-${index}`)).toEqual([]);
    }, 30_000);

    it("gives the context of each level to 64 concurrent leaves of a binary recursion", async () => {
        const variable = new Variable<string>();
        const wrong : string[] = [];
        const recurse = async (depth : number, id : string) : Promise<unknown> => {
            if (depth === 0) {
                await null;
                return variable.get();
            }
            return variable.run(`${id}-${depth}`, async () => {
                const results = await Promise.all([recurse(depth - 1, `${id}-a`), recurse(depth - 1, `${id}-b`)]);
                if (variable.get() !== `${id}-${depth}`) {
                    wrong.push(`${id}-${depth}`);
                }
                return results;
            });
        };
        const result = await variable.run("root", async () => {
            const leaves = (await recurse(6, "r") as unknown[]).flat(10);
            return { leaves, ctx : variable.get() };
        });
        expect(result.ctx).toBe("root");
        expect(result.leaves).toHaveLength(64);
        expect(result.leaves.every((leaf) => typeof leaf === "string" && leaf.endsWith("-1"))).toBe(true);
        expect(wrong).toEqual([]);
    });

    it("gives the correct value in each of 10000 rapid synchronous runs", () => {
        const variable = new Variable<string>();
        const results = Array.from({ length : 10_000 }, (_, index) => variable.run(`sync-${index}`, () => variable.get()));
        expect(mismatches(results, (index) => `sync-${index}`)).toEqual([]);
        expect(variable.get()).toBeUndefined();
    });

    it("gives each of 1000 rapid async runs its context before and after a timer", async () => {
        const variable = new Variable<string>();
        const operations = Array.from({ length : 1000 }, (_, index) => variable.run(`rapid-${index}`, async () => {
            const before = variable.get();
            await delay(0);
            return `${before ?? "none"}/${variable.get() ?? "none"}`;
        }));
        const results = await Promise.all(operations);
        expect(mismatches(results, (index) => `rapid-${index}/rapid-${index}`)).toEqual([]);
    });

    it("keeps two variables apart in 1000 alternating runs", async () => {
        const first = new Variable<string>();
        const second = new Variable<string>();
        const operations : Promise<string>[] = [];
        for (let index = 0; index < 500; index++) {
            operations.push(first.run(`ctx1-${index}`, async () => {
                const before = `${first.get() ?? "none"}|${second.get() ?? "none"}`;
                await delay(0);
                return `${before}|${first.get() ?? "none"}|${second.get() ?? "none"}`;
            }));
            operations.push(second.run(`ctx2-${index}`, async () => {
                const before = `${first.get() ?? "none"}|${second.get() ?? "none"}`;
                await delay(0);
                return `${before}|${first.get() ?? "none"}|${second.get() ?? "none"}`;
            }));
        }
        const results = await Promise.all(operations);
        const expected = (index : number) : string => {
            const pair = Math.floor(index / 2);
            return index % 2 === 0
                ? `ctx1-${pair}|none|ctx1-${pair}|none`
                : `none|ctx2-${pair}|none|ctx2-${pair}`;
        };
        expect(mismatches(results, expected)).toEqual([]);
    });

    it("gives the correct value to reads between awaits of 100 interleaved runs", async () => {
        const variable = new Variable<string>();
        const reads = await Promise.all(Array.from({ length : 100 }, (_, index) => variable.run(`race-get-${index}`, async () => {
            const values : (string | undefined)[] = [];
            for (let step = 0; step < 10; step++) {
                values.push(variable.get());
                await null;
            }
            return values;
        })));
        const wrong = reads.flatMap((values, index) => values.filter((value) => value !== `race-get-${index}`));
        expect(wrong).toEqual([]);
    });

    it("gives each operation of ten waves of 100 operations its own context", async () => {
        const variable = new Variable<string>();
        const results : (string | undefined)[] = [];
        for (let wave = 0; wave < 10; wave++) {
            results.push(...await Promise.all(Array.from({ length : 100 }, (_, index) => variable.run(`wave-${wave}-${index}`, async () => {
                await delay((wave + index) % 4);
                return variable.get();
            }))));
            await delay(1);
        }
        expect(mismatches(results, (index) => `wave-${Math.floor(index / 100)}-${index % 100}`)).toEqual([]);
    });

    it("gives each of 500 short and 50 long concurrent runs its own context", async () => {
        const variable = new Variable<string>();
        const operations : Promise<string | undefined>[] = [];
        for (let index = 0; index < 500; index++) {
            operations.push(variable.run(`short-${index}`, async () => {
                await delay(1);
                return variable.get();
            }));
        }
        for (let index = 0; index < 50; index++) {
            operations.push(variable.run(`long-${index}`, async () => {
                await delay(50);
                return variable.get();
            }));
        }
        const results = await Promise.all(operations);
        expect(mismatches(results, (index) => (index < 500 ? `short-${index}` : `long-${index - 500}`))).toEqual([]);
    });

    it("gives each node of three levels of nested Promise.all its own context", async () => {
        const variable = new Variable<string>();
        interface Node {
            readonly id : string | undefined;
            readonly children : readonly (Node | string | undefined)[];
        }
        const level3 = (id : string) : Promise<string | undefined> => variable.run(`l3-${id}`, async () => {
            await delay(1);
            return variable.get();
        });
        const level2 = (id : string) : Promise<Node> => variable.run(`l2-${id}`, async () => {
            const children = await Promise.all([level3(`${id}-a`), level3(`${id}-b`), level3(`${id}-c`)]);
            return { id : variable.get(), children };
        });
        const level1 = (id : string) : Promise<Node> => variable.run(`l1-${id}`, async () => {
            const children = await Promise.all([level2(`${id}-a`), level2(`${id}-b`)]);
            return { id : variable.get(), children };
        });
        const tree = await variable.run("root", async () => {
            const children = await Promise.all([level1("a"), level1("b"), level1("c")]);
            return { id : variable.get(), children };
        });
        const expectedLevel2 = (id : string) : Node => ({ id : `l2-${id}`, children : ["a", "b", "c"].map((leaf) => `l3-${id}-${leaf}`) });
        const expectedLevel1 = (id : string) : Node => ({ id : `l1-${id}`, children : [expectedLevel2(`${id}-a`), expectedLevel2(`${id}-b`)] });
        expect(tree).toEqual({ id : "root", children : ["a", "b", "c"].map(expectedLevel1) });
    });

    it("gives the leaves of a pyramid the context of their parent level, 120 leaves in total", async () => {
        const variable = new Variable<string>();
        const wrong : string[] = [];
        let leaves = 0;
        const pyramid = async (levels : number, id : string) : Promise<void> => {
            if (levels === 0) {
                leaves++;
                if (variable.get()?.endsWith("-1") !== true) {
                    wrong.push(`leaf ${id}: ${variable.get() ?? "none"}`);
                }
                return;
            }
            await variable.run(`${id}-${levels}`, async () => {
                await Promise.all(Array.from({ length : levels }, (_, index) => pyramid(levels - 1, `${id}-${index}`)));
                if (variable.get() !== `${id}-${levels}`) {
                    wrong.push(`${id}-${levels}: ${variable.get() ?? "none"}`);
                }
            });
        };
        await variable.run("pyramid-root", () => pyramid(5, "p"));
        expect(leaves).toBe(120);
        expect(wrong).toEqual([]);
    });
});
