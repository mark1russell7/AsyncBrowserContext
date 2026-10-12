import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import { libraryGenerator } from "../fixtures/untransformed.js";
import { lowered, preset } from "../helpers.js";

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
    it.skipIf(lowered)("runs a finally block with await and yield on return(), and then gives the value of return() (not with SWC or esbuild, which end the generator at the await)", async () => {
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
    it.skipIf(lowered)("gives an object that is its own async iterator, with the tag AsyncGenerator (not with SWC or esbuild)", async () => {
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

    it("gives the objects of a delegate through yield* without a change", async () => {
        const first = { id : 1 };
        const second = { id : 2 };
        async function* rows() : AsyncGenerator<{ id : number }> {
            yield first;
            await null;
            yield second;
        }
        async function* all() : AsyncGenerator<{ id : number }> {
            yield* rows();
        }
        const values : unknown[] = [];
        for await (const row of all()) {
            values.push(row);
        }
        expect(values).toHaveLength(2);
        expect(values[0]).toBe(first);
        expect(values[1]).toBe(second);
    });

    // The helpers of SWC and esbuild do not await the value of return() at a yield
    it.skipIf(lowered)("awaits the value of return() at a yield before the finally block, and throws a rejection into the body (not with SWC or esbuild)", async () => {
        const log : string[] = [];
        async function* guarded() : AsyncGenerator<string> {
            try {
                yield "first";
            } catch (error) {
                log.push(`caught ${String(error)}`);
                yield "after catch";
            } finally {
                log.push("finally");
            }
        }
        const pending = guarded();
        await pending.next();
        let settle! : (value : string) => void;
        const done = pending.return(new Promise<string>((resolve) => { settle = resolve; }) as unknown as string);
        await Promise.resolve();
        await Promise.resolve();
        expect(log).toEqual([]);
        settle("stop");
        expect(await done).toEqual({ value : "stop", done : true });
        expect(log).toEqual(["finally"]);

        const rejected = guarded();
        await rejected.next();
        expect(await rejected.return(Promise.reject("x") as unknown as string)).toEqual({ value : "after catch", done : false });
        expect(log).toEqual(["finally", "caught x"]);
    });

    // The helpers of SWC and esbuild resume the body for next() of a complete generator
    it.skipIf(lowered)("settles next() of a complete generator before a later microtask, as a native async generator does (not with SWC or esbuild)", async () => {
        async function* empty() : AsyncGenerator<number> {
            // An empty body
        }
        const generator = empty();
        await generator.next();
        const order : string[] = [];
        const next = generator.next().then(() => order.push("next"));
        const turn = Promise.resolve().then(() => order.push("turn"));
        await Promise.all([next, turn]);
        expect(order).toEqual(["next", "turn"]);
    });

    // The helpers of SWC and esbuild throw
    it.skipIf(lowered)("rejects, and does not throw, when a method starts on an object that is not an async generator (not with SWC or esbuild)", async () => {
        async function* one() : AsyncGenerator<number> {
            yield 1;
        }
        const prototype = Object.getPrototypeOf(one()) as AsyncGenerator<number>;
        let promise : Promise<unknown> | undefined;
        expect(() => { promise = prototype.next.call({} as AsyncGenerator<number>); }).not.toThrow();
        await expect(promise).rejects.toThrow(TypeError);
    });

    // SWC and esbuild make their own async generator objects
    it.skipIf(lowered)("has no enumerable properties, and has Symbol.asyncDispose as a native async generator has (not with SWC or esbuild)", async () => {
        async function* one() : AsyncGenerator<number> {
            yield 1;
        }
        const generator = one();
        const keys : string[] = [];
        for (const key in generator) {
            keys.push(key);
        }
        expect(keys).toEqual([]);
        // A native async generator of a module that the transform does not change
        const native = libraryGenerator(() => 1);
        const dispose = (Symbol as { asyncDispose? : symbol }).asyncDispose;
        if (dispose !== undefined) {
            expect(typeof (generator as unknown as Record<symbol, unknown>)[dispose]).toBe(typeof (native as unknown as Record<symbol, unknown>)[dispose]);
        }
        await native.return(undefined);
    });
});
