import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
// @ts-expect-error The fixture is plain JavaScript without types
import { libraryGenerator } from "../fixtures/untransformed.js";
import { compiler, lowered, preset } from "../helpers.js";

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

    // The helpers of SWC and esbuild throw
    it.skipIf(lowered)("rejects with a TypeError when a method starts on undefined, null or a primitive value (not with SWC or esbuild)", async () => {
        async function* one() : AsyncGenerator<number> {
            yield 1;
        }
        const prototype = Object.getPrototypeOf(one()) as AsyncGenerator<number>;
        for (const target of [undefined, null, 1]) {
            let promise : Promise<unknown> | undefined;
            expect(() => { promise = prototype.next.call(target as unknown as AsyncGenerator<number>); }).not.toThrow();
            await expect(promise).rejects.toThrow(TypeError);
        }
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

/** This function starts a chain of `count` then callbacks. Each callback adds its number to `log`, one microtask turn after the callback before it. */
function microtaskChain(log : unknown[], count = 6) : Promise<void> {
    let promise = Promise.resolve();
    for (let index = 1; index <= count; index++) {
        promise = promise.then(() => { log.push(index); });
    }
    return promise;
}

/** This function gives an async iterable that gives `iterator`. */
function iterable(iterator : Partial<AsyncIterator<unknown>>) : AsyncIterable<unknown> {
    return { [Symbol.asyncIterator] : () => iterator as AsyncIterator<unknown> };
}

/**
 * These tests examine the requests in each state of the body, and `yield*` to delegates with
 * unusual results. The expected values are the values of native async generators.
 */
describe("async generators: the requests and yield* keep the protocol of native async generators", () => {
    // The helpers of SWC and esbuild take other microtask turns
    it.skipIf(lowered)("settles return() before the first next() after one microtask turn, and completes without the body (not with SWC or esbuild)", async () => {
        let started = false;
        async function* never() : AsyncGenerator<number> {
            started = true;
            yield 1;
        }
        const generator = never();
        const log : unknown[] = [];
        const returned = generator.return(5).then((result) => { log.push(`return ${String(result.value)}`); });
        await Promise.all([returned, microtaskChain(log)]);
        expect(log).toEqual([1, "return 5", 2, 3, 4, 5, 6]);
        expect(await generator.next()).toEqual({ value : undefined, done : true });
        expect(started).toBe(false);
    });

    it.skipIf(lowered)("rejects throw() before the first next() at once, and completes without the body (not with SWC or esbuild)", async () => {
        let started = false;
        async function* never() : AsyncGenerator<number> {
            started = true;
            yield 1;
        }
        const generator = never();
        const log : unknown[] = [];
        const thrown = generator.throw(new Error("early")).catch((error : unknown) => { log.push(`throw ${(error as Error).message}`); });
        const next = generator.next().then((result) => { log.push(`next ${String(result.done)}`); });
        await Promise.all([thrown, next, microtaskChain(log, 2)]);
        expect(log).toEqual(["throw early", "next true", 1, 2]);
        expect(started).toBe(false);
    });

    it.skipIf(lowered)("settles next() after the body threw before a later microtask (not with SWC or esbuild)", async () => {
        async function* failing() : AsyncGenerator<number> {
            await null;
            throw new Error("failed");
        }
        const generator = failing();
        await expect(generator.next()).rejects.toThrow("failed");
        const log : unknown[] = [];
        const next = generator.next().then((result) => { log.push(`next ${String(result.done)}`); });
        await Promise.all([next, microtaskChain(log, 2)]);
        expect(log).toEqual(["next true", 1, 2]);
    });

    it("gives a promise that next() sends to the yield without an await", async () => {
        let received : unknown;
        async function* echo() : AsyncGenerator<number, void, unknown> {
            received = yield 1;
        }
        const generator = echo();
        await generator.next();
        const sent = Promise.resolve(2);
        await generator.next(sent);
        expect(received).toBe(sent);
    });

    it("reads the then property of an object without a then method one time for an await and for a yield", async () => {
        let reads = 0;
        const plain = { get then() { reads++; return undefined; } };
        async function* reader() : AsyncGenerator<unknown> {
            const awaited : unknown = await plain;
            yield awaited === plain;
            yield plain;
        }
        const generator = reader();
        expect((await generator.next()).value).toBe(true);
        expect(reads).toBe(1);
        expect((await generator.next()).value).toBe(plain);
        expect(reads).toBe(2);
    });

    it.skipIf(compiler === "swc-es2016")("reads done and value of each result of the delegate one time, as a native yield* (not with SWC, whose helper reads done two times)", async () => {
        const reads : string[] = [];
        const result = (value : string, done : boolean) : IteratorResult<string> => ({
            get done() { reads.push(`done ${value}`); return done; },
            get value() { reads.push(`value ${value}`); return value; },
        } as IteratorResult<string>);
        let calls = 0;
        const delegate = iterable({ next : () => Promise.resolve(++calls === 1 ? result("a", false) : result("end", true)) });
        async function* outer() : AsyncGenerator<unknown> {
            const last : unknown = yield* delegate;
            reads.push(`last ${String(last)}`);
        }
        const generator = outer();
        expect((await generator.next()).value).toBe("a");
        expect((await generator.next()).done).toBe(true);
        expect(reads).toEqual(["done a", "value a", "done end", "value end", "last end"]);
    });

    it.skipIf(compiler === "esbuild-es2016")("gives a promise that the delegate gives as a value through yield* without an await (not with esbuild, whose helper awaits it)", async () => {
        const promise = Promise.resolve("inner");
        let given = false;
        const delegate = iterable({
            next : () => {
                const result = given ? { value : undefined, done : true } : { value : promise, done : false };
                given = true;
                return Promise.resolve(result);
            },
        });
        async function* outer() : AsyncGenerator<unknown> {
            yield* delegate;
        }
        const first = await outer().next();
        expect(first.value).toBe(promise);
        expect(first.done).toBe(false);
    });

    it("throws a rejection of next() of the delegate into the body at the yield*, and does not start throw() or return() of the delegate", async () => {
        const log : string[] = [];
        let calls = 0;
        const delegate = iterable({
            next : () => ++calls === 1 ? Promise.resolve({ value : "a", done : false }) : Promise.reject(new Error("next failed")),
            throw : () => { log.push("throw"); return Promise.resolve({ value : undefined, done : true }); },
            return : () => { log.push("return"); return Promise.resolve({ value : undefined, done : true }); },
        });
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* delegate;
            } catch (error) {
                yield `caught ${(error as Error).message}`;
            }
        }
        const generator = outer();
        expect([await generator.next(), await generator.next(), await generator.next()]).toEqual([
            { value : "a", done : false },
            { value : "caught next failed", done : false },
            { value : undefined, done : true },
        ]);
        expect(log).toEqual([]);
    });

    // The helper of SWC stops, and the helper of esbuild throws outside the body
    it.skipIf(lowered)("throws a TypeError into the body at the yield* when the delegate gives a result that is not an object (not with SWC or esbuild)", async () => {
        for (const bad of [5, undefined, null]) {
            const delegate = iterable({ next : () => Promise.resolve(bad as unknown as IteratorResult<unknown>) });
            async function* outer() : AsyncGenerator<unknown> {
                try {
                    yield* delegate;
                } catch (error) {
                    yield `caught ${(error as Error).constructor.name}`;
                }
            }
            expect(await outer().next()).toEqual({ value : "caught TypeError", done : false });
        }
    });

    it.skipIf(compiler === "esbuild-es2016")("closes a delegate without a throw method on throw(), and throws a TypeError into the body at the yield* (not with esbuild, whose helper throws the error of throw())", async () => {
        const log : string[] = [];
        const delegate = iterable({
            next : () => Promise.resolve({ value : "a", done : false }),
            return : (value? : unknown) => {
                log.push(`return ${String(value)}`);
                return Promise.resolve({ value : "r", done : true });
            },
        });
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* delegate;
            } catch (error) {
                log.push(`caught ${(error as Error).constructor.name}`);
                yield "after";
            }
        }
        const generator = outer();
        await generator.next();
        expect(await generator.throw(new Error("boom"))).toEqual({ value : "after", done : false });
        expect(log).toEqual(["return undefined", "caught TypeError"]);
    });

    it.skipIf(lowered)("awaits return() of a delegate without a throw method on throw(), and throws its rejection into the body (not with SWC or esbuild)", async () => {
        const log : string[] = [];
        const delegate = iterable({
            next : () => Promise.resolve({ value : "a", done : false }),
            return : () => Promise.reject(new Error("close failed")),
        });
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* delegate;
            } catch (error) {
                log.push(`caught ${(error as Error).message}`);
            }
        }
        const generator = outer();
        await generator.next();
        // As AsyncIteratorClose: the error of return() goes into the body, in place of the TypeError
        expect(await generator.throw(new Error("boom"))).toEqual({ value : undefined, done : true });
        expect(log).toEqual(["caught close failed"]);
    });

    it.skipIf(lowered)("settles return() at a yield in the same microtask turn as a native async generator (not with SWC or esbuild)", async () => {
        const order : string[] = [];
        async function* values() : AsyncGenerator<number> {
            try {
                yield 1;
            } finally {
                order.push("finally");
            }
        }
        const generator = values();
        await generator.next();
        const returned = generator.return(5).then((result) => { order.push(`return ${String(result.value)}`); });
        void Promise.resolve().then(() => order.push("turn 1")).then(() => order.push("turn 2")).then(() => order.push("turn 3"));
        await returned;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(order).toEqual(["finally", "turn 1", "return 5", "turn 2", "turn 3"]);
    });

    it("completes on return() through yield* to a delegate without a return method, after the finally block of the body", async () => {
        const log : string[] = [];
        const delegate = iterable({ next : () => Promise.resolve({ value : "a", done : false }) });
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* delegate;
            } finally {
                log.push("finally");
            }
        }
        const generator = outer();
        await generator.next();
        expect(await generator.return(Promise.resolve("v"))).toEqual({ value : "v", done : true });
        expect(log).toEqual(["finally"]);
    });

    // The helpers of SWC and esbuild end the generator at a yield in a finally block
    it.skipIf(lowered)("continues after return() through yield* when the delegate yields in its finally block (not with SWC or esbuild)", async () => {
        const log : string[] = [];
        async function* inner() : AsyncGenerator<string> {
            try {
                yield "a";
                yield "b";
            } finally {
                yield "cleanup";
                log.push("inner end");
            }
        }
        async function* outer() : AsyncGenerator<string> {
            try {
                yield* inner();
            } finally {
                log.push("outer finally");
            }
        }
        const generator = outer();
        expect([await generator.next(), await generator.return("stop"), await generator.next(), await generator.next()]).toEqual([
            { value : "a", done : false },
            { value : "cleanup", done : false },
            { value : undefined, done : true },
            { value : undefined, done : true },
        ]);
        expect(log).toEqual(["inner end", "outer finally"]);
    });

    it.skipIf(lowered)("runs a yield* in a finally block after return() to its end, and then completes with the value of return() (not with SWC or esbuild)", async () => {
        const log : unknown[] = [];
        async function* complete() : AsyncGenerator<string, string> {
            return "x";
        }
        async function* withYield() : AsyncGenerator<string, string> {
            yield "a";
            return "y";
        }
        async function* direct() : AsyncGenerator<unknown> {
            try {
                yield 1;
            } finally {
                log.push(yield* complete());
            }
        }
        async function* afterAwait() : AsyncGenerator<unknown> {
            try {
                yield 1;
            } finally {
                await null;
                log.push(yield* complete());
                log.push(yield* withYield());
            }
        }
        const first = direct();
        await first.next();
        expect(await first.return(7)).toEqual({ value : 7, done : true });
        const second = afterAwait();
        await second.next();
        expect([await second.return(8), await second.next(), await second.next()]).toEqual([
            { value : "a", done : false },
            { value : 8, done : true },
            { value : undefined, done : true },
        ]);
        expect(log).toEqual(["x", "x", "y"]);
    });

    it.skipIf(lowered)("runs a yield* in the body after return() through an earlier yield* ended the delegate (not with SWC or esbuild)", async () => {
        const log : unknown[] = [];
        async function* inner() : AsyncGenerator<string> {
            yield "a";
        }
        async function* complete() : AsyncGenerator<string, string> {
            return "x";
        }
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* inner();
            } finally {
                log.push(yield* complete());
            }
        }
        const generator = outer();
        await generator.next();
        expect(await generator.return("stop")).toEqual({ value : "stop", done : true });
        expect(log).toEqual(["x"]);
    });

    it.skipIf(lowered)("throws a rejection of return() of the delegate into the body at the yield*, and the body can delegate again (not with SWC or esbuild)", async () => {
        const log : string[] = [];
        const failing = iterable({
            next : () => Promise.resolve({ value : "a", done : false }),
            return : () => {
                log.push("return");
                return Promise.reject(new Error("return failed"));
            },
        });
        async function* complete() : AsyncGenerator<string, string> {
            return "x";
        }
        async function* outer() : AsyncGenerator<unknown> {
            try {
                yield* failing;
            } catch (error) {
                log.push(`caught ${(error as Error).message}`);
                log.push(`delegated ${yield* complete()}`);
                yield "after";
            }
        }
        const generator = outer();
        expect([await generator.next(), await generator.return("stop"), await generator.next()]).toEqual([
            { value : "a", done : false },
            { value : "after", done : false },
            { value : undefined, done : true },
        ]);
        expect(log).toEqual(["return", "caught return failed", "delegated x"]);
    });
});
