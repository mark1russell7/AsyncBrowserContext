import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay } from "../helpers.js";

describe("legacy 01: core", () => {
    it("keeps the values of two variables after an await, while other contexts resume first", async () => {
        const first = new Variable<string>();
        const second = new Variable<string>();
        const seen = await first.run("value-1", () => second.run("value-2", async () => {
            const values : (string | undefined)[] = [];
            const others = [busyOther(first, "other-1"), busyOther(second, "other-2")];
            await null;
            values.push(first.get(), second.get());
            await delay(5);
            values.push(first.get(), second.get());
            await Promise.all(others);
            return values;
        }));
        expect(seen).toEqual(["value-1", "value-2", "value-1", "value-2"]);
    });

    it("keeps the context in an async then callback that nests run() (regression of the old runtime)", async () => {
        const variable = new Variable({ defaultValue : 0 });
        const seen : (number | undefined)[] = [];
        await variable.run(1, async () => {
            seen.push(variable.get());
            await Promise.resolve().then(async () => {
                seen.push(variable.get());
                await variable.run(2, async () => {
                    seen.push(variable.get());
                    await Promise.resolve();
                    seen.push(variable.get());
                });
                seen.push(variable.get());
            });
            seen.push(variable.get());
        });
        expect(seen).toEqual([1, 1, 2, 2, 1, 1]);
        expect(variable.get()).toBe(0);
    });
});
