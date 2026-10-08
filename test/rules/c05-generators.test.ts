import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { runtime, transformed } from "../helpers.js";

/**
 * Native generators run in the context of the caller of `next()`. The rule
 * needs the Babel preset, so the tests skip the Node.js project without the
 * transform.
 */
const needsTransform = runtime === "node" && !transformed;

const variable = new Variable<string>();

function* readTwice() : Generator<string | undefined> {
    yield variable.get();
    yield variable.get();
}

async function* readTwiceAsync() : AsyncGenerator<string | undefined> {
    yield variable.get();
    await null;
    yield variable.get();
}

const expression = function* () : Generator<string | undefined> {
    yield variable.get();
};

const holder = {
    prefix : "object",
    *read() : Generator<string> {
        yield `${this.prefix}:${variable.get() ?? "none"}`;
    },
};

class Base {
    label() : string {
        return "base";
    }
}

class Reader extends Base {
    static *staticRead() : Generator<string | undefined> {
        yield variable.get();
    }

    #secret = "secret";

    override label() : string {
        return "reader";
    }

    *read(...rest : number[]) : Generator<string> {
        yield `${super.label()}:${this.#secret}:${rest.length}:${variable.get() ?? "none"}`;
    }

    *#privateRead() : Generator<string | undefined> {
        yield variable.get();
    }

    readPrivate() : Generator<string | undefined> {
        return this.#privateRead();
    }

    async *readAsync() : AsyncGenerator<string> {
        await null;
        yield `${super.label()}:${variable.get() ?? "none"}`;
    }
}

describe.skipIf(needsTransform)("rule C5: a generator body runs in the context of the call that made the generator", () => {
    it("keeps the creation context when another context calls next()", () => {
        const generator = variable.run("created", () => readTwice());
        expect(variable.run("b", () => generator.next().value)).toBe("created");
        expect(generator.next().value).toBe("created");
    });

    it("sets the context of the caller again after each step", () => {
        const generator = variable.run("created", () => readTwice());
        variable.run("caller", () => {
            generator.next();
            expect(variable.get()).toBe("caller");
        });
    });

    it("keeps the creation context in for-of, spread and Array.from", () => {
        const fromLoop : unknown[] = [];
        variable.run("b", () => {
            for (const value of variable.run("created", () => readTwice())) {
                fromLoop.push(value);
            }
        });
        expect(fromLoop).toEqual(["created", "created"]);
        expect(variable.run("b", () => [...variable.run("created", () => readTwice())])).toEqual(["created", "created"]);
        expect(variable.run("b", () => Array.from(variable.run("created", () => readTwice())))).toEqual(["created", "created"]);
    });

    it("keeps the creation context for a function expression, an object method and class methods", () => {
        expect(variable.run("b", () => variable.run("created", () => expression()).next().value)).toBe("created");
        expect(variable.run("b", () => variable.run("created", () => holder.read()).next().value)).toBe("object:created");
        const reader = new Reader();
        expect(variable.run("b", () => variable.run("created", () => reader.read(1, 2)).next().value)).toBe("base:secret:2:created");
        expect(variable.run("b", () => variable.run("created", () => Reader.staticRead()).next().value)).toBe("created");
        expect(variable.run("b", () => variable.run("created", () => reader.readPrivate()).next().value)).toBe("created");
    });

    it("runs the finally block of return() and throw() in the creation context", () => {
        const seen : unknown[] = [];
        function* guarded() : Generator<number> {
            try {
                yield 1;
                yield 2;
            } finally {
                seen.push(variable.get());
            }
        }
        const first = variable.run("created", () => guarded());
        first.next();
        variable.run("b", () => first.return(0));
        const second = variable.run("created", () => guarded());
        second.next();
        expect(() => variable.run("b", () => second.throw(new Error("stop")))).toThrow("stop");
        expect(seen).toEqual(["created", "created"]);
    });

    it("keeps the creation context through yield*", () => {
        function* outer() : Generator<string | undefined> {
            yield variable.get();
            yield* readTwice();
        }
        const generator = variable.run("created", () => outer());
        expect(variable.run("b", () => [...generator])).toEqual(["created", "created", "created"]);
    });

    it("keeps the creation context of an async generator after await, in for await", async () => {
        const generator = variable.run("created", () => readTwiceAsync());
        const seen = await variable.run("b", async () => {
            const values : unknown[] = [];
            for await (const value of generator) {
                values.push(value);
                expect(variable.get()).toBe("b");
            }
            return values;
        });
        expect(seen).toEqual(["created", "created"]);
    });

    it("keeps the creation context of an async generator method with super", async () => {
        const generator = variable.run("created", () => new Reader().readAsync());
        const result = await variable.run("b", () => generator.next());
        expect(result.value).toBe("base:created");
    });

    it("keeps the generator objects usable: Symbol.iterator, Symbol.toStringTag and the return value", () => {
        function* counted() : Generator<number, string> {
            yield 1;
            return "done";
        }
        const generator = counted();
        expect(generator[Symbol.iterator]()).toBe(generator);
        expect(Object.prototype.toString.call(generator)).toBe("[object Generator]");
        expect(generator.next()).toEqual({ value : 1, done : false });
        expect(generator.next()).toEqual({ value : "done", done : true });
    });

    it("throws parameter errors when the program makes the generator, as native generators do", () => {
        function* needsObject({ id } : { id : number }) : Generator<number> {
            yield id;
        }
        expect(() => needsObject(undefined as unknown as { id : number })).toThrow(TypeError);
    });
});
