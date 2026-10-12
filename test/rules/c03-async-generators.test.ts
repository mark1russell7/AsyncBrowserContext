import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { compiler, preset } from "../helpers.js";

/**
 * The preset gives each async generator to the driver of the runtime
 * (`src/core/async-generator.ts`). These tests examine the behavior of async
 * generators. The project without a transform runs them on native async
 * generators, so the expected values are the values of the engine.
 */
describe("async generators: the driver keeps the behavior of native async generators", () => {
    it("gives the yielded values and the return value, and awaits a yielded promise", async () => {
        async function* numbers() : AsyncGenerator<number, number> {
            yield 1;
            yield Promise.resolve(2) as unknown as number;
            await null;
            return 3;
        }
        const generator = numbers();
        const results = [await generator.next(), await generator.next(), await generator.next(), await generator.next()];
        expect(results).toEqual([
            { value : 1, done : false },
            { value : 2, done : false },
            { value : 3, done : true },
            { value : undefined, done : true },
        ]);
    });

    it("queues the requests of the consumer and settles them in order", async () => {
        const order : string[] = [];
        async function* slow() : AsyncGenerator<string> {
            for (const name of ["a", "b", "c"]) {
                await new Promise((resolve) => setTimeout(resolve, 1));
                order.push(`yield ${name}`);
                yield name;
            }
        }
        const generator = slow();
        const results = await Promise.all([generator.next(), generator.next(), generator.next(), generator.next()]);
        expect(results.map((result) => result.value)).toEqual(["a", "b", "c", undefined]);
        expect(order).toEqual(["yield a", "yield b", "yield c"]);
    });

    it("gives a value that the consumer sends with next() to the yield", async () => {
        async function* echo() : AsyncGenerator<string, void, string> {
            const first = yield "ready";
            await null;
            yield `got ${first}`;
        }
        const generator = echo();
        await generator.next();
        expect(await generator.next("x")).toEqual({ value : "got x", done : false });
    });

    it("throws a rejected yielded promise into the body at the yield", async () => {
        async function* failing() : AsyncGenerator<string> {
            try {
                yield Promise.reject(new Error("rejected")) as unknown as string;
            } catch (error) {
                yield `caught ${(error as Error).message}`;
            }
        }
        expect(await failing().next()).toEqual({ value : "caught rejected", done : false });
    });

    it("throws the error of throw() into the body, and rejects throw() after the end", async () => {
        async function* catching() : AsyncGenerator<string> {
            try {
                yield "first";
            } catch (error) {
                await null;
                yield `caught ${String(error)}`;
            }
        }
        const generator = catching();
        await generator.next();
        expect(await generator.throw("boom")).toEqual({ value : "caught boom", done : false });
        expect(await generator.next()).toEqual({ value : undefined, done : true });
        await expect(generator.throw("again")).rejects.toBe("again");
    });

    it("rejects next() when the body throws after an await", async () => {
        async function* broken() : AsyncGenerator<number> {
            yield 1;
            await null;
            throw new Error("broken");
        }
        const generator = broken();
        await generator.next();
        await expect(generator.next()).rejects.toThrow("broken");
        expect(await generator.next()).toEqual({ value : undefined, done : true });
    });

    // The helpers of SWC and esbuild end the generator at the first await of the finally block
    it.skipIf(compiler === "swc-es2016" || compiler === "esbuild-es2016")("runs a finally block with await and yield on return(), and then gives the value of return() (not with SWC or esbuild, which end the generator at the await)", async () => {
        const log : string[] = [];
        async function* cleaning() : AsyncGenerator<number | string> {
            try {
                yield 1;
                yield 2;
            } finally {
                await null;
                log.push("cleanup");
                yield "in finally";
            }
        }
        const generator = cleaning();
        await generator.next();
        expect(await generator.return(7)).toEqual({ value : "in finally", done : false });
        expect(await generator.next()).toEqual({ value : 7, done : true });
        expect(log).toEqual(["cleanup"]);
    });

    it("completes without the body on return() before the first next(), and awaits the value of return()", async () => {
        let started = false;
        async function* never() : AsyncGenerator<number> {
            started = true;
            yield 1;
        }
        const generator = never();
        expect(await generator.return(Promise.resolve(5) as unknown as number)).toEqual({ value : 5, done : true });
        expect(started).toBe(false);
    });

    it("delegates with yield* to an async iterable, and gives its return value", async () => {
        async function* inner() : AsyncGenerator<string, string> {
            yield "a";
            await null;
            yield "b";
            return "inner done";
        }
        async function* outer() : AsyncGenerator<string, string> {
            const result = yield* inner();
            return `outer got ${result}`;
        }
        const values : unknown[] = [];
        const generator = outer();
        for (let result = await generator.next(); ; result = await generator.next()) {
            values.push(result.value);
            if (result.done === true) break;
        }
        expect(values).toEqual(["a", "b", "outer got inner done"]);
    });

    it("forwards return() and throw() through yield* to the delegate", async () => {
        const log : string[] = [];
        async function* inner() : AsyncGenerator<string> {
            try {
                yield "a";
                yield "b";
            } catch (error) {
                yield `inner caught ${String(error)}`;
            } finally {
                log.push("inner closed");
            }
        }
        async function* outer() : AsyncGenerator<string> {
            yield* inner();
        }
        const thrown = outer();
        await thrown.next();
        expect(await thrown.throw("boom")).toEqual({ value : "inner caught boom", done : false });
        const returned = outer();
        await returned.next();
        expect(await returned.return("stop")).toEqual({ value : "stop", done : true });
        expect(log).toEqual(["inner closed"]);
    });

    // SWC and esbuild make their own async generator objects, without Symbol.toStringTag
    it.skipIf(compiler === "swc-es2016" || compiler === "esbuild-es2016")("gives an object that is its own async iterator, with the tag AsyncGenerator (not with SWC or esbuild)", async () => {
        async function* one() : AsyncGenerator<number> {
            yield 1;
        }
        const generator = one();
        expect(generator[Symbol.asyncIterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe("[object AsyncGenerator]");
    });

    it.skipIf(!preset)("keeps the creation context in each step after an await, while other contexts run (Babel preset only)", async () => {
        const variable = new Variable<string>();
        async function* reader() : AsyncGenerator<string | undefined> {
            for (let index = 0; index < 3; index++) {
                await new Promise((resolve) => setTimeout(resolve, 1));
                yield variable.get();
            }
        }
        const generator = variable.run("created", () => reader());
        const seen = await variable.run("consumer", async () => {
            const values : unknown[] = [];
            for await (const value of generator) {
                values.push(value);
                expect(variable.get()).toBe("consumer");
            }
            return values;
        });
        expect(seen).toEqual(["created", "created", "created"]);
    });
});
