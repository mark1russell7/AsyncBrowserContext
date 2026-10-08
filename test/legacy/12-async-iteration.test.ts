import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

async function* numbers() : AsyncGenerator<number> {
    yield 1;
    await delay(5);
    yield 2;
    await delay(5);
    yield 3;
}

describe("legacy 12: async iteration", () => {
    it("keeps the context in a for await body that awaits, before and after its await", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("multi-iteration", async () => {
            const values : (string | undefined)[] = [];
            for await (const _ of numbers()) {
                values.push(variable.get());
                await delay(5);
                values.push(variable.get());
            }
            return values;
        });
        expect(seen).toEqual(Array.from({ length : 6 }, () => "multi-iteration"));
    });

    it("keeps the context in nested for await loops", async () => {
        const variable = new Variable<string>();
        async function* letters() : AsyncGenerator<string> {
            yield "A";
            yield "B";
        }
        async function* digits() : AsyncGenerator<number> {
            yield 1;
            yield 2;
        }
        const seen = await variable.run("nested-for-await", async () => {
            const results : string[] = [];
            for await (const letter of letters()) {
                for await (const digit of digits()) {
                    results.push(`${letter}${digit}:${variable.get() ?? "none"}`);
                }
            }
            return results;
        });
        expect(seen).toEqual(["A1", "A2", "B1", "B2"].map((pair) => `${pair}:nested-for-await`));
    });

    it("gives each of two concurrent for await loops its own context", async () => {
        const variable = new Variable<string>();
        async function* generator(id : string) : AsyncGenerator<string> {
            yield `${id}-1`;
            await delay(5);
            yield `${id}-2`;
        }
        const loop = (value : string, id : string) : Promise<string[]> => variable.run(value, async () => {
            const items : string[] = [];
            for await (const item of generator(id)) {
                items.push(`${item}:${variable.get() ?? "none"}`);
            }
            return items;
        });
        expect(await Promise.all([loop("loop-A", "A"), loop("loop-B", "B")])).toEqual([
            ["A-1:loop-A", "A-2:loop-A"],
            ["B-1:loop-B", "B-2:loop-B"],
        ]);
    });

    it("gives the body of an async generator the context of the loop that makes and reads it", async () => {
        const variable = new Variable<string>();
        const inside : (string | undefined)[] = [];
        async function* contextAware() : AsyncGenerator<number> {
            inside.push(variable.get());
            yield 1;
            await delay(5);
            inside.push(variable.get());
            yield 2;
            await delay(5);
            inside.push(variable.get());
            yield 3;
        }
        const outside = await variable.run("generator-context", async () => {
            const values : (string | undefined)[] = [];
            for await (const _ of contextAware()) {
                values.push(variable.get());
            }
            return values;
        });
        expect(inside).toEqual(["generator-context", "generator-context", "generator-context"]);
        expect(outside).toEqual(["generator-context", "generator-context", "generator-context"]);
    });

    it("rejects the loop with the error of the generator, and keeps the contexts", async () => {
        const variable = new Variable<string>();
        async function* faulty() : AsyncGenerator<number> {
            yield 1;
            await delay(5);
            throw new Error("Generator error");
        }
        const inLoop : (string | undefined)[] = [];
        const result = variable.run("faulty-gen", async () => {
            for await (const _ of faulty()) {
                inLoop.push(variable.get());
            }
        });
        await expect(result).rejects.toThrow("Generator error");
        expect(inLoop).toEqual(["faulty-gen"]);
        expect(variable.get()).toBeUndefined();
    });

    it("ends a for await loop on the return of the generator, and keeps the context", async () => {
        const variable = new Variable<string>();
        async function* withReturn() : AsyncGenerator<number, string> {
            yield 1;
            await delay(5);
            return "final";
        }
        const values = await variable.run("gen-return", async () => {
            const items : string[] = [];
            for await (const value of withReturn()) {
                items.push(`${value}:${variable.get() ?? "none"}`);
            }
            items.push(`after:${variable.get() ?? "none"}`);
            return items;
        });
        expect(values).toEqual(["1:gen-return", "after:gen-return"]);
    });

    it("keeps the context in a loop over an async generator that delegates with yield*", async () => {
        const variable = new Variable<string>();
        async function* sub() : AsyncGenerator<string> {
            yield "a";
            await delay(5);
            yield "b";
        }
        async function* main() : AsyncGenerator<string> {
            yield* sub();
            yield "c";
        }
        const values = await variable.run("yield-star", async () => {
            const items : string[] = [];
            for await (const value of main()) {
                items.push(`${value}:${variable.get() ?? "none"}`);
            }
            return items;
        });
        expect(values).toEqual(["a:yield-star", "b:yield-star", "c:yield-star"]);
    });

    it("keeps the context in a loop over an object with an async generator method", async () => {
        const variable = new Variable<string>();
        const iterable = {
            async *[Symbol.asyncIterator]() : AsyncGenerator<number> {
                yield 1;
                await delay(5);
                yield 2;
                await delay(5);
                yield 3;
            },
        };
        const values = await variable.run("custom-iterator", async () => {
            const items : string[] = [];
            for await (const value of iterable) {
                items.push(`${value}:${variable.get() ?? "none"}`);
            }
            return items;
        });
        expect(values).toEqual(["1:custom-iterator", "2:custom-iterator", "3:custom-iterator"]);
    });

    it("calls return() of a custom async iterator one time when the loop breaks, and keeps the context", async () => {
        const variable = new Variable<string>();
        let returnCalls = 0;
        let current = 0;
        const iterator : AsyncIterableIterator<number> = {
            async next() : Promise<IteratorResult<number>> {
                await delay(5);
                current++;
                return current <= 3 ? { value : current, done : false } : { value : undefined, done : true };
            },
            async return(value? : unknown) : Promise<IteratorResult<number>> {
                returnCalls++;
                return { value : value as number, done : true };
            },
            [Symbol.asyncIterator]() : AsyncIterableIterator<number> {
                return this;
            },
        };
        const values = await variable.run("iterator-methods", async () => {
            const items : string[] = [];
            for await (const value of iterator) {
                items.push(`${value}:${variable.get() ?? "none"}`);
                if (value === 2) {
                    break;
                }
            }
            items.push(`after:${variable.get() ?? "none"}`);
            return items;
        });
        expect(values).toEqual(["1:iterator-methods", "2:iterator-methods", "after:iterator-methods"]);
        expect(returnCalls).toBe(1);
    });

    it("runs the finally block of an endless async generator when the loop breaks", async () => {
        const variable = new Variable<string>();
        let closed = false;
        async function* endless() : AsyncGenerator<number> {
            let index = 0;
            try {
                while (true) {
                    yield index++;
                    await delay(1);
                }
            } finally {
                closed = true;
            }
        }
        const values = await variable.run("infinite-iter", async () => {
            const items : string[] = [];
            for await (const value of endless()) {
                items.push(`${value}:${variable.get() ?? "none"}`);
                if (items.length >= 5) {
                    break;
                }
            }
            return items;
        });
        expect(values).toEqual([0, 1, 2, 3, 4].map((value) => `${value}:infinite-iter`));
        expect(closed).toBe(true);
    });

    it("runs no loop body for an async generator that yields nothing", async () => {
        const variable = new Variable<string>();
        async function* empty() : AsyncGenerator<number> {
            // This generator yields no value
        }
        const result = await variable.run("empty-gen", async () => {
            let iterations = 0;
            for await (const _ of empty()) {
                iterations++;
            }
            return { iterations, ctx : variable.get() };
        });
        expect(result).toEqual({ iterations : 0, ctx : "empty-gen" });
    });

    it("runs no loop body for an async generator that only awaits and returns", async () => {
        const variable = new Variable<string>();
        async function* delayed() : AsyncGenerator<number, string> {
            await delay(10);
            return "done";
        }
        const result = await variable.run("no-yield", async () => {
            let iterations = 0;
            for await (const _ of delayed()) {
                iterations++;
            }
            return { iterations, ctx : variable.get() };
        });
        expect(result).toEqual({ iterations : 0, ctx : "no-yield" });
    });

    it("keeps the context in a pipeline of two async generators", async () => {
        const variable = new Variable<string>();
        async function* source() : AsyncGenerator<number> {
            yield 1;
            yield 2;
            yield 3;
        }
        async function* multiply(iterable : AsyncIterable<number>, factor : number) : AsyncGenerator<number> {
            for await (const value of iterable) {
                await delay(5);
                yield value * factor;
            }
        }
        const values = await variable.run("pipeline", async () => {
            const items : string[] = [];
            for await (const value of multiply(source(), 10)) {
                items.push(`${value}:${variable.get() ?? "none"}`);
            }
            return items;
        });
        expect(values).toEqual(["10:pipeline", "20:pipeline", "30:pipeline"]);
    });
});
