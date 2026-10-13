import { describe, expect, it } from "vitest";
// @ts-expect-error The fixture is plain JavaScript without types
import { libraryGenerator } from "../../test/fixtures/untransformed.js";
import { asyncGeneratorDelegate, asyncIteratorPrototypeOf, createAsyncGenerator, makeAsyncGeneratorPrototype, OverloadYield, type ResumeKey } from "./async-generator.js";

/** This function gives the step function of `body` for `createAsyncGenerator`, as the Node.js runtime gives it. */
function stepOf(body : Generator<unknown, unknown, unknown>) : (key : ResumeKey, argument : unknown) => IteratorResult<unknown, unknown> {
    return (key, argument) => Reflect.apply(body[key], body, [argument]) as IteratorResult<unknown, unknown>;
}

function* echo() : Generator<unknown, unknown, unknown> {
    const received : unknown = yield Promise.resolve("first");
    return `got ${String(received)}`;
}

/** The prototype of the native async generator objects. */
const nativePrototype = Object.getPrototypeOf((libraryGenerator as Function).prototype as object) as object;

describe("createAsyncGenerator", () => {
    it("awaits the values of the body without a prepare function, as on the Node.js runtime", async () => {
        const generator = createAsyncGenerator(stepOf(echo()), Promise);
        expect(await generator.next()).toEqual({ value : "first", done : false });
        expect(await generator.next("x")).toEqual({ value : "got x", done : true });
    });

    it("rejects a method that starts on another object with a TypeError that names the method", async () => {
        const prototype = Object.getPrototypeOf(createAsyncGenerator(stepOf(echo()), Promise)) as Record<ResumeKey, (this : unknown) => Promise<unknown>>;
        for (const key of ["next", "throw", "return"] as const) {
            await expect(prototype[key].call({})).rejects.toThrow(new TypeError(`AsyncGenerator.prototype.${key} started on an object that is not an async generator`));
        }
    });
});

describe("the prototype of the async generator objects", () => {
    it("finds %AsyncIteratorPrototype% from a native async generator function", () => {
        const expected = Object.getPrototypeOf(nativePrototype) as Record<symbol, unknown>;
        // Compare booleans: the formatter of a failed assertion starts the methods of a generator prototype
        expect(asyncIteratorPrototypeOf(libraryGenerator as Function) === expected).toBe(true);
        expect(typeof expected[Symbol.asyncIterator]).toBe("function");
    });

    it("gives undefined for a function without a prototype, with a short prototype chain, or without Symbol.asyncIterator in the chain", () => {
        class Base {}
        class Derived extends Base {}
        expect(asyncIteratorPrototypeOf(() => undefined)).toBeUndefined();
        expect(asyncIteratorPrototypeOf(function plain() { /* A function with a plain prototype object */ })).toBeUndefined();
        expect(asyncIteratorPrototypeOf(Derived)).toBeUndefined();
    });

    it("has the property attributes of the native prototype, and no own Symbol.asyncIterator", () => {
        const parent = Object.getPrototypeOf(nativePrototype) as object;
        const prototype = makeAsyncGeneratorPrototype(parent);
        expect(Object.getPrototypeOf(prototype) === parent).toBe(true);
        for (const key of ["next", "throw", "return", Symbol.toStringTag]) {
            const { value : _native, ...expected } = Object.getOwnPropertyDescriptor(nativePrototype, key) ?? {};
            const { value : _own, ...actual } = Object.getOwnPropertyDescriptor(prototype, key) ?? {};
            expect(actual).toEqual(expected);
        }
        expect((prototype as Record<symbol, unknown>)[Symbol.toStringTag]).toBe("AsyncGenerator");
        expect(Object.prototype.hasOwnProperty.call(prototype, Symbol.asyncIterator)).toBe(false);
    });

    it("gives the prototype its own Symbol.asyncIterator method when the engine has no %AsyncIteratorPrototype%", () => {
        const prototype = makeAsyncGeneratorPrototype(undefined);
        expect(Object.getPrototypeOf(prototype) === Object.prototype).toBe(true);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.asyncIterator);
        expect(descriptor).toMatchObject({ writable : true, enumerable : false, configurable : true });
        const object = Object.create(prototype) as object;
        expect((descriptor?.value as (this : object) => unknown).call(object) === object).toBe(true);
    });
});

describe("asyncGeneratorDelegate", () => {
    /** An async iterator that gives the result of each method. */
    const inner = {
        next : () => Promise.resolve({ value : "next", done : false }),
        throw : () => Promise.resolve({ value : "throw", done : false }),
        return : () => Promise.resolve({ value : "return", done : true }),
    };

    it("marks the steps of next() and throw() with kind 1, and a step of return() with kind 2", () => {
        const delegate = asyncGeneratorDelegate(inner) as Required<Iterator<unknown, unknown, unknown>>;
        const kinds : unknown[] = [];
        for (const key of ["next", "throw", "return"] as const) {
            const step = delegate[key](undefined);
            const marker = step.value as OverloadYield;
            kinds.push(marker instanceof OverloadYield ? marker.k : "none");
            // The driver gives the result back
            expect(delegate[key === "return" ? "return" : "next"]("result")).toBe("result");
        }
        expect(kinds).toEqual([1, 1, 2]);
    });

    it("gives no throw and return methods when the inner iterator has none", () => {
        const delegate = asyncGeneratorDelegate({ next : inner.next });
        expect("throw" in delegate).toBe(false);
        expect("return" in delegate).toBe(false);
    });
});
