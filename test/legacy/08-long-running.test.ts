import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay, turns } from "../helpers.js";

describe("legacy 08: long running operations", () => {
    it("keeps the context in two concurrent loops that await single delays and Promise.all of delays", async () => {
        const variable = new Variable<string>();
        const loop = (value : string, offset : number) : Promise<(string | undefined)[]> => variable.run(value, async () => {
            const seen : (string | undefined)[] = [];
            for (let index = 0; index < 10; index++) {
                await delay((index + offset) % 4);
                seen.push(variable.get());
                await Promise.all([delay((index + offset) % 3), delay(index % 2), delay(1)]);
                seen.push(variable.get());
            }
            return seen;
        });
        const [first, second] = await Promise.all([loop("loop-A", 0), loop("loop-B", 1)]);
        expect(first).toEqual(Array.from({ length : 20 }, () => "loop-A"));
        expect(second).toEqual(Array.from({ length : 20 }, () => "loop-B"));
    });

    it("keeps the context through 100 levels of async recursion", async () => {
        const variable = new Variable<string>();
        const wrong : number[] = [];
        const recurse = async (depth : number) : Promise<number> => {
            if (depth >= 100) {
                return depth;
            }
            if (variable.get() !== "deep-recursive") {
                wrong.push(depth);
            }
            await (depth % 10 === 0 ? delay(1) : turns(1));
            return recurse(depth + 1);
        };
        const finalDepth = await variable.run("deep-recursive", () => recurse(0));
        expect(finalDepth).toBe(100);
        expect(wrong).toEqual([]);
    });

    it("keeps the context of each level in a recursion that nests runs", async () => {
        const variable = new Variable<string>();
        const path : string[] = [];
        const recurse = async (depth : number) : Promise<void> => {
            if (depth >= 10) {
                return;
            }
            await variable.run(`level-${depth}`, async () => {
                await delay(1);
                path.push(`in ${variable.get() ?? "none"}`);
                await recurse(depth + 1);
                path.push(`out ${variable.get() ?? "none"}`);
            });
        };
        await recurse(0);
        const levels = Array.from({ length : 10 }, (_, index) => index);
        expect(path).toEqual([...levels.map((level) => `in level-${level}`), ...[...levels].reverse().map((level) => `out level-${level}`)]);
    });
});
