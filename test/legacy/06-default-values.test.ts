import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

describe("legacy 06: default values", () => {
    it("replaces the default value in run(), also after an await, and gives the default value after run()", async () => {
        const variable = new Variable({ defaultValue : "default" });
        const seen = await variable.run("custom", async () => {
            const before = variable.get();
            await delay(5);
            return [before, variable.get()];
        });
        expect(seen).toEqual(["custom", "custom"]);
        expect(variable.get()).toBe("default");
    });

    it("keeps the default values of the other variables in run() of one variable", async () => {
        const first = new Variable({ defaultValue : "default-1" });
        const second = new Variable({ defaultValue : "default-2" });
        const third = new Variable<string>();
        expect([first.get(), second.get(), third.get()]).toEqual(["default-1", "default-2", undefined]);
        const seen = await first.run("custom-1", async () => {
            await null;
            return [first.get(), second.get(), third.get()];
        });
        expect(seen).toEqual(["custom-1", "default-2", undefined]);
    });

    it("gives the outer value after a nested run() ends, and the default value after the outer run() ends", async () => {
        const variable = new Variable({ defaultValue : "default" });
        const seen : (string | undefined)[] = [];
        await variable.run("outer", async () => {
            seen.push(variable.get());
            await variable.run("inner", async () => {
                await null;
                seen.push(variable.get());
            });
            seen.push(variable.get());
        });
        seen.push(variable.get());
        expect(seen).toEqual(["outer", "inner", "outer", "default"]);
    });

    it("gives the default value to an async function in the root context while runs are concurrent", async () => {
        const variable = new Variable({ defaultValue : "default" });
        const results = await Promise.all([
            variable.run("A", async () => {
                await delay(5);
                return variable.get();
            }),
            variable.run("B", async () => {
                await delay(5);
                return variable.get();
            }),
            (async () => {
                await delay(5);
                return variable.get();
            })(),
        ]);
        expect(results).toEqual(["A", "B", "default"]);
    });
});
