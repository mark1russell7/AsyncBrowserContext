import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay } from "../helpers.js";

function circularObject() : object {
    const circular : { name : string; self? : unknown } = { name : "circular" };
    circular.self = circular;
    return circular;
}

function circularArray() : unknown[] {
    const array : unknown[] = [1, 2, 3];
    array.push(array);
    return array;
}

function largeObject() : Record<string, string> {
    const object : Record<string, string> = {};
    for (let index = 0; index < 10_000; index++) {
        object[`key${index}`] = `value${index}`;
    }
    return object;
}

function deepObject() : object {
    let deep : { level : number; child? : unknown } = { level : 100 };
    for (let level = 99; level >= 0; level--) {
        deep = { level, child : deep };
    }
    return deep;
}

function weakMapWithEntry() : WeakMap<object, string> {
    const map = new WeakMap<object, string>();
    map.set({}, "value");
    return map;
}

/** The special values of the legacy edge case tests. Each value must stay the same value after an await. */
const VALUES : readonly (readonly [string, () => unknown])[] = [
    ["null", () => null],
    ["a Symbol", () => Symbol("test")],
    ["a Symbol.for symbol", () => Symbol.for("global-symbol")],
    ["an object with a circular reference", circularObject],
    ["an array with a circular reference", circularArray],
    ["an object with 10000 properties", largeObject],
    ["an array with 10000 elements", () => Array.from({ length : 10_000 }, (_, index) => index)],
    ["an object nested 100 levels deep", deepObject],
    ["a Date", () => new Date()],
    ["a RegExp", () => /test-\d+/giu],
    ["a Map", () => new Map([["key1", "value1"], ["key2", "value2"]])],
    ["a Set", () => new Set([1, 2, 3, 4, 5])],
    ["a WeakMap", weakMapWithEntry],
    ["a Proxy", () => new Proxy({ name : "target" }, { get : (target, property) => (property === "name" ? "proxied" : Reflect.get(target, property)) })],
    ["a frozen object", () => Object.freeze({ immutable : "value" })],
    ["a sealed object", () => Object.seal({ fixed : "structure" })],
    ["NaN", () => Number.NaN],
    ["Infinity", () => Number.POSITIVE_INFINITY],
    ["-Infinity", () => Number.NEGATIVE_INFINITY],
    ["a string of 1000000 characters", () => "x".repeat(1_000_000)],
    ["a BigInt", () => BigInt("123456789012345678901234567890")],
];

describe("legacy 14: edge cases", () => {
    for (const [name, make] of VALUES) {
        it(`keeps ${name} as the same value after an await, while another context resumes first`, async () => {
            const variable = new Variable<unknown>();
            const value = make();
            const seen = await variable.run(value, async () => {
                const before = variable.get();
                const other = busyOther(variable, "other");
                await null;
                const after = variable.get();
                await other;
                await delay(1);
                return [before, after, variable.get()];
            });
            expect(seen.every((item) => Object.is(item, value))).toBe(true);
        });
    }

    it("gives null in the outer run() after a nested run() with a string ends", async () => {
        const variable = new Variable<string | null>();
        const seen : (string | null | undefined)[] = [];
        await variable.run(null, async () => {
            seen.push(variable.get());
            await variable.run("defined", async () => {
                await null;
                seen.push(variable.get());
            });
            seen.push(variable.get());
        });
        expect(seen).toEqual([null, "defined", null]);
    });

    it("gives the same default object to three variables until run() of one variable sets a value", async () => {
        const defaultValue = { shared : "default" };
        const first = new Variable<unknown>({ defaultValue });
        const second = new Variable<unknown>({ defaultValue });
        const third = new Variable<unknown>({ defaultValue });
        expect([first.get(), second.get(), third.get()].every((value) => value === defaultValue)).toBe(true);
        const seen = await first.run("ctx1-value", async () => {
            await null;
            return [first.get(), second.get(), third.get()];
        });
        expect(seen[0]).toBe("ctx1-value");
        expect(seen[1]).toBe(defaultValue);
        expect(seen[2]).toBe(defaultValue);
    });

    it("gives the correct value in each of 1000 sequential async runs", async () => {
        const variable = new Variable<string>();
        const wrong : number[] = [];
        for (let index = 0; index < 1000; index++) {
            await variable.run(`ctx-${index}`, async () => {
                if (variable.get() !== `ctx-${index}`) {
                    wrong.push(index);
                }
            });
        }
        expect(wrong).toEqual([]);
        expect(variable.get()).toBeUndefined();
    });
});
