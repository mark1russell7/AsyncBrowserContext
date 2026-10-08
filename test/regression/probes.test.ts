import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import { libraryCall } from "../fixtures/untransformed.js";
import { inBrowser, runtime, transformed } from "../helpers.js";

/**
 * The probes of the review of 2026-10-08 (docs/remediation-plan.md,
 * Appendix B). Each test has the name of its probe and states the target
 * result. The old runtime failed each of them.
 */

async function* numbers() : AsyncGenerator<number> {
    yield 1;
    yield 2;
    yield 3;
}

// P10: a top-level for await in a module
const topLevel : number[] = [];
for await (const value of numbers()) {
    topLevel.push(value);
}

const needsTransform = runtime === "node" && !transformed;

describe("regression probes of the review", () => {
    it("P01: a task that starts after request A ends does not see request A", async () => {
        const variable = new Variable<string>();
        await variable.run("request-a", async () => {
            await null;
        });
        const seen = await new Promise((resolve) => {
            if (inBrowser) {
                const channel = new MessageChannel();
                channel.port2.onmessage = () => {
                    channel.port1.close();
                    resolve(variable.get());
                };
                channel.port1.postMessage(null);
            } else {
                process.nextTick(() => resolve(variable.get()));
            }
        });
        expect(seen).toBeUndefined();
    });

    it("P02: a callback of an untransformed dependency in request A never sees request B", async () => {
        const variable = new Variable<string>();
        const fromA = variable.run("A", async () => await (libraryCall as (callback : () => unknown) => Promise<unknown>)(() => variable.get()));
        const fromB = variable.run("B", async () => {
            await null;
            await null;
        });
        const [seen] = await Promise.all([fromA, fromB]);
        expect(seen).not.toBe("B");
        expect(seen).toBe(runtime === "node" ? "A" : undefined);
    });

    it("P03: then callbacks use the context of the then call", async () => {
        const variable = new Variable<string>();
        const cached = variable.run("A", () => Promise.resolve({}));
        expect(await variable.run("A", () => cached.then(() => variable.get()))).toBe("A");
        expect(await variable.run("B", () => cached.then(() => variable.get()))).toBe("B");
        const result = variable.run("inner", async () => 1);
        expect(await result.then(() => variable.get())).toBeUndefined();
    });

    it("P04: Promise subclasses keep their class", () => {
        class Tracked<T> extends Promise<T> {}
        expect(new Tracked((resolve) => resolve(1))).toBeInstanceOf(Tracked);
        expect(Tracked.resolve(1)).toBeInstanceOf(Tracked);
        expect(Promise.resolve(1).constructor).toBe(Promise);
    });

    it("P05: for await iterates a sync iterable", async () => {
        const seen : number[] = [];
        for await (const value of [Promise.resolve(1), 2]) {
            seen.push(value);
        }
        expect(seen).toEqual([1, 2]);
    });

    it("P06: for await accepts destructuring", async () => {
        async function* pairs() : AsyncGenerator<[number, string]> {
            yield [1, "a"];
            yield [2, "b"];
        }
        const seen : string[] = [];
        for await (const [count, letter] of pairs()) {
            seen.push(`${count}${letter}`);
        }
        expect(seen).toEqual(["1a", "2b"]);
    });

    it("P07: break in for await closes the iterator", async () => {
        let closed = false;
        async function* resource() : AsyncGenerator<number> {
            try {
                yield 1;
                yield 2;
            } finally {
                closed = true;
            }
        }
        for await (const value of resource()) {
            if (value === 1) {
                break;
            }
        }
        expect(closed).toBe(true);
    });

    it("P08: closures in for await capture one binding for each iteration", async () => {
        const readers : (() => number)[] = [];
        for await (const value of numbers()) {
            readers.push(() => value);
        }
        expect(readers.map((read) => read())).toEqual([1, 2, 3]);
    });

    it("P09: a labeled for await accepts continue with the label", async () => {
        const seen : string[] = [];
        outer: for await (const first of numbers()) {
            for (const second of [1, 2]) {
                if (second === 2) {
                    continue outer;
                }
                seen.push(`${first}${second}`);
            }
        }
        expect(seen).toEqual(["11", "21", "31"]);
    });

    it("P10: a top-level for await in a module completes", () => {
        expect(topLevel).toEqual([1, 2, 3]);
    });

    it("P11 and P12: var keeps its function scope with await", async () => {
        const redeclared = async () : Promise<number> => {
            // A second var declaration of one name is valid JavaScript
            var value = await 1;
            var value = await 2;
            return value;
        };
        const inBlock = async (flag : boolean) : Promise<number | undefined> => {
            if (flag) {
                var value : number | undefined = await 42;
            }
            return value;
        };
        expect(await redeclared()).toBe(2);
        expect(await inBlock(true)).toBe(42);
    });

    it("P13 and P14: destructuring defaults after await", async () => {
        const { a = 1, b } = await ({ b : 2 } as { a? : number; b : number });
        const [c = 1, d] = await ([undefined, 2] as [number | undefined, number]);
        expect([a + b, c + d]).toEqual([3, 3]);
    });

    it("P15: a declaration with two declarators and await", async () => {
        const read = async () : Promise<number> => {
            const first = 1, second = await 2;
            return first + second;
        };
        expect(await read()).toBe(3);
    });

    it("P16: the context is correct in the same expression after await", async () => {
        const variable = new Variable<string>();
        const other = async () : Promise<void> => {
            await null;
            await null;
        };
        const forms : (() => Promise<unknown>)[] = [
            async () => ({ user : await null, id : variable.get() }).id,
            async () => [await null, variable.get()][1],
            async () => ((await true) ? variable.get() : "no"),
            async () => { for (const _ of await [1]) { return variable.get(); } return "no"; },
        ];
        for (const form of forms) {
            void variable.run("B", other);
            expect(await variable.run("A", form)).toBe("A");
        }
    });

    it("P17: an async function that an unrelated task starts does not see a finished request", async () => {
        const variable = new Variable<string>();
        await variable.run("request-A", async () => {
            await null;
        });
        const handler = async () : Promise<unknown> => {
            await null;
            return variable.get();
        };
        const seen = await new Promise((resolve) => {
            if (inBrowser) {
                const channel = new MessageChannel();
                channel.port2.onmessage = () => {
                    channel.port1.close();
                    resolve(handler());
                };
                channel.port1.postMessage(null);
            } else {
                process.nextTick(() => resolve(handler()));
            }
        });
        expect(seen).toBeUndefined();
    });

    it.skipIf(needsTransform)("P18 and P23: generators keep the context of their creation", async () => {
        const variable = new Variable<string>();
        function* sync() : Generator<string | undefined> {
            yield variable.get();
            yield variable.get();
        }
        async function* async_() : AsyncGenerator<string | undefined> {
            yield variable.get();
            yield variable.get();
        }
        const syncGenerator = variable.run("created-in-A", () => sync());
        expect(variable.run("B", () => syncGenerator.next().value)).toBe("created-in-A");
        expect(syncGenerator.next().value).toBe("created-in-A");
        const asyncGenerator = variable.run("created-in-A", () => async_());
        expect((await variable.run("B", () => asyncGenerator.next())).value).toBe("created-in-A");
        expect((await variable.run("C", () => asyncGenerator.next())).value).toBe("created-in-A");
    });

    it("P20: the constructor takes an options object with defaultValue", () => {
        expect(new Variable({ defaultValue : 0 }).get()).toBe(0);
    });

    it("P22: then on a module-level promise uses the context of the then call", async () => {
        const variable = new Variable<string>();
        const fromPromiseResolve = Promise.resolve("ready");
        const fromAsyncFunction = (async () => "ready")();
        expect(await variable.run("C", () => fromPromiseResolve.then(() => variable.get()))).toBe("C");
        expect(await variable.run("C", () => fromAsyncFunction.then(() => variable.get()))).toBe("C");
    });
});
