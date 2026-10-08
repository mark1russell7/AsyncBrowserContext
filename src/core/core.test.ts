import { describe, expect, it } from "vitest";
import { AsyncLocalStorage } from "./async-local-storage.js";
import { bindGenerator, coroutine } from "./coroutine.js";
import { Snapshot } from "./snapshot.js";
import { bindOneArgument, bindToFrame, createFrame, enter, findValue, NOT_FOUND, store } from "./store.js";
import { enterValue, Variable } from "./variable.js";

describe("the context store", () => {
    it("is one object on globalThis with a Symbol.for key, which code cannot replace", () => {
        const key = Symbol.for("async-browser-context/store/v1");
        expect((globalThis as unknown as Record<symbol, unknown>)[key]).toBe(store);
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
        expect(descriptor?.writable).toBe(false);
        expect(descriptor?.configurable).toBe(false);
        expect(descriptor?.enumerable).toBe(false);
    });

    it("makes frames that show only their parent", () => {
        const variable = {};
        const frame = createFrame(store.root, variable, "secret");
        expect(frame.parent).toBe(store.root);
        expect(Reflect.ownKeys(frame)).toEqual(["parent"]);
        expect(findValue(frame, variable)).toBe("secret");
        expect(findValue(frame, {})).toBe(NOT_FOUND);
        expect(store.root.parent).toBeNull();
    });

    it("skips the frames of another copy of the library", () => {
        const variable = {};
        const inner = createFrame(store.root, variable, "inner");
        const foreign = { parent : inner };
        expect(findValue(foreign, variable)).toBe("inner");
    });

    it("gives the previous frame from enter()", () => {
        const frame = createFrame(store.root, {}, 0);
        const previous = enter(frame);
        try {
            expect(store.current).toBe(frame);
        } finally {
            enter(previous);
        }
        expect(store.current).toBe(previous);
    });

    it("keeps this, the arguments and the result in bindToFrame and bindOneArgument", () => {
        const frame = createFrame(store.root, {}, 0);
        const many = bindToFrame(frame, function (this : { id : number }, a : number, b : number) : string {
            return `${this.id}:${a + b}:${store.current === frame ? "frame" : "other"}`;
        });
        const one = bindOneArgument(frame, function (this : { id : number }, a : number) : string {
            return `${this.id}:${a}:${store.current === frame ? "frame" : "other"}`;
        });
        expect(many.call({ id : 1 }, 2, 3)).toBe("1:5:frame");
        expect(one.call({ id : 4 }, 5)).toBe("4:5:frame");
        expect(store.current).toBe(store.root);
    });

    it("records the native functions before a patch replaces them", () => {
        expect(store.intrinsics.promiseThen).not.toBe(Promise.prototype.then);
        expect(store.intrinsics.Promise).toBe(Promise);
    });
});

describe("Variable lookup", () => {
    it("finds a value in a parent frame that another variable does not hide", () => {
        const variable = new Variable<string>();
        const other = new Variable<string>();
        variable.run("outer", () => {
            other.run("x", () => other.run("y", () => {
                expect(variable.get()).toBe("outer");
                expect(other.get()).toBe("y");
            }));
        });
    });

    it("finds the nearest frame when two frames set the same variable", () => {
        const variable = new Variable<string>();
        const other = new Variable<string>();
        variable.run("far", () => other.run("x", () => variable.run("near", () => other.run("y", () => {
            expect(variable.get()).toBe("near");
        }))));
    });

    it("gives the default value when no frame in the chain sets the variable", () => {
        const variable = new Variable({ defaultValue : "default" });
        const other = new Variable<string>();
        other.run("x", () => other.run("y", () => {
            expect(variable.get()).toBe("default");
        }));
    });

    it("sets a new current frame with enterValue", () => {
        const variable = new Variable<string>();
        const previous = store.current;
        enterValue(variable, "entered");
        try {
            expect(variable.get()).toBe("entered");
            expect(store.current.parent).toBe(previous);
        } finally {
            enter(previous);
        }
    });
});

describe("coroutine", () => {
    it("gives this and the arguments to the generator function", async () => {
        const run = coroutine(function* (this : { id : number }, a : number) : Generator<unknown, string, unknown> {
            const value = (yield a) as number;
            return `${this.id}:${value}`;
        });
        expect(await run.call({ id : 7 }, 3)).toBe("7:3");
    });

    it("gives a rejected promise when the body throws before the first yield", async () => {
        // eslint-disable-next-line require-yield
        const run = coroutine(function* () : Generator<unknown, never, unknown> {
            throw new Error("early");
        });
        await expect(run()).rejects.toThrow("early");
    });

    it("throws the rejection into the body, and the body can catch it", async () => {
        const run = coroutine(function* () : Generator<unknown, string, unknown> {
            try {
                yield Promise.reject(new Error("stop"));
                return "not caught";
            } catch (error) {
                return (error as Error).message;
            }
        });
        expect(await run()).toBe("stop");
    });

    it("adopts a thenable that the body gives back", async () => {
        const run = coroutine(function* () : Generator<unknown, unknown, unknown> {
            yield null;
            return { then(resolve : (value : string) => void) { resolve("adopted"); } };
        });
        expect(await run()).toBe("adopted");
    });

    it("reads the then property of an awaited thenable in the context of the body", async () => {
        const variable = new Variable<string>();
        let seen : unknown;
        const thenable = {
            get then() {
                seen = variable.get();
                return (resolve : (value : number) => void) => resolve(1);
            },
        };
        const run = coroutine(function* () : Generator<unknown, unknown, unknown> {
            return yield thenable;
        });
        expect(await variable.run("body", () => run())).toBe(1);
        expect(seen).toBe("body");
    });

    it("keeps the store of enterWith in the next steps of the body, as the TC39 draft does for await", async () => {
        const storage = new AsyncLocalStorage<string>();
        const run = coroutine(function* () : Generator<unknown, unknown, unknown> {
            storage.enterWith("entered");
            yield null;
            return storage.getStore();
        });
        expect(await storage.run("outer", () => run())).toBe("entered");
        expect(store.current).toBe(store.root);
    });
});

describe("bindGenerator", () => {
    it("runs next, throw and return in the context of the creation", () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        function* body() : Generator<number, string, unknown> {
            try {
                seen.push(variable.get());
                yield 1;
                seen.push(variable.get());
                yield 2;
                return "end";
            } finally {
                seen.push(`finally:${variable.get() ?? "none"}`);
            }
        }
        const generator = variable.run("created", () => bindGenerator(body()));
        variable.run("caller", () => {
            generator.next();
            generator.next();
            expect(generator.return("stopped")).toEqual({ value : "stopped", done : true });
            expect(variable.get()).toBe("caller");
        });
        expect(seen).toEqual(["created", "created", "finally:created"]);
    });

    it("keeps the context that the body had at its last yield", () => {
        const storage = new AsyncLocalStorage<string>();
        function* body() : Generator<string | undefined> {
            storage.enterWith("entered");
            yield storage.getStore();
            yield storage.getStore();
        }
        const generator = storage.run("created", () => bindGenerator(body()));
        expect(generator.next().value).toBe("entered");
        expect(generator.next().value).toBe("entered");
        expect(storage.getStore()).toBeUndefined();
    });

    it("inherits from the prototype of the generator", () => {
        function* body() : Generator<number> {
            yield 1;
        }
        const inner = body();
        const bound = bindGenerator(inner);
        // Compare booleans: the formatter of a failed assertion calls the methods of a generator prototype
        expect(Object.getPrototypeOf(bound) === Object.getPrototypeOf(inner)).toBe(true);
        expect(Object.prototype.toString.call(bound)).toBe("[object Generator]");
        expect(bound[Symbol.iterator]() === bound).toBe(true);
        for (const method of ["next", "throw", "return"] as const) {
            const descriptor = Object.getOwnPropertyDescriptor(bound, method);
            expect(descriptor?.writable).toBe(true);
            expect(descriptor?.configurable).toBe(true);
            expect(descriptor?.enumerable).toBe(false);
        }
        expect(bound.next.name).toBe("next");
        expect(bound.throw.name).toBe("throw");
        expect(bound.return.name).toBe("return");
    });
});

describe("Snapshot.wrap", () => {
    it("throws a TypeError with a message for a value that is not a function", () => {
        expect(() => Snapshot.wrap(1 as unknown as () => void)).toThrow(new TypeError("Snapshot.wrap: the argument is not a function"));
    });

    it("gives a wrapper with a configurable name and length", () => {
        const wrapped = Snapshot.wrap(function sum(a : number, b : number) : number {
            return a + b;
        });
        expect(Object.getOwnPropertyDescriptor(wrapped, "name")).toMatchObject({ value : "sum", configurable : true });
        expect(Object.getOwnPropertyDescriptor(wrapped, "length")).toMatchObject({ value : 2, configurable : true });
    });
});
