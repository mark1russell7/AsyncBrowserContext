import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, compiler, delay, lowered, turns } from "../helpers.js";

function pick<T>(_first : unknown, second : T) : T {
    return second;
}

async function* letters() : AsyncGenerator<string> {
    yield "a";
    await null;
    yield "b";
}

class Base {
    describe() : string {
        return "base";
    }
}

class Service extends Base {
    readonly prefix = "service";

    override describe() : string {
        return "service";
    }

    async read(variable : Variable<string>, ...rest : unknown[]) : Promise<string> {
        await null;
        return `${this.prefix}:${super.describe()}:${rest.length}:${variable.get() ?? "none"}`;
    }
}

type Body = (variable : Variable<string>) => Promise<unknown>;

/** Each case reads the variable at a different place after an `await`. */
const CASES : readonly (readonly [string, Body])[] = [
    ["the next statement", async (v) => { await null; return v.get(); }],
    ["an object literal", async (v) => { const record = { first : await null, id : v.get() }; return record.id; }],
    ["the arguments of a call", async (v) => pick(await null, v.get())],
    ["a template literal", async (v) => `${String(await null)}|${v.get() ?? ""}`.split("|")[1]],
    ["an array literal", async (v) => [await null, v.get()][1]],
    ["a conditional expression", async (v) => (await true) ? v.get() : "unreachable"],
    ["a logical expression", async (v) => (await null) ?? v.get()],
    ["an if block", async (v) => { if (await true) { return v.get(); } return "unreachable"; }],
    ["a while condition", async (v) => { let count = 0; while ((await count) < 2) { count++; } return v.get(); }],
    ["the body of a for-of loop with await in its head", async (v) => { for (const _ of await [1]) { return v.get(); } return "unreachable"; }],
    ["a catch block after a rejection", async (v) => { try { await Promise.reject(new Error("stop")); } catch { return v.get(); } return "unreachable"; }],
    ["a finally block", async (v) => { let seen : unknown; try { await null; } finally { seen = v.get(); } return seen; }],
    ["a destructuring default value", async (v) => { const { id = v.get() } = await ({} as { id? : string }); return id; }],
    ["the code after await of a value that is not a promise", async (v) => { await 42; return v.get(); }],
    ["the code after await of a thenable", async (v) => { await { then(resolve : (value : number) => void) { resolve(1); } }; return v.get(); }],
    ["the code after await of a timer", async (v) => { await delay(1); return v.get(); }],
    ["the code after 50 awaits", async (v) => { for (let index = 0; index < 50; index++) { await null; } return v.get(); }],
    ["an async arrow function", async (v) => { const read = async () : Promise<unknown> => { await null; return v.get(); }; return read(); }],
    ["an async method with this, super and rest arguments", async (v) => (await new Service().read(v, 1, 2)).split(":")[3]],
    ["a for await loop over an async generator", async (v) => { const seen = new Set<unknown>(); for await (const _ of letters()) { seen.add(v.get()); } return [...seen].join(","); }],
    ["a for await loop over an array of promises", async (v) => { let last : unknown; for await (const _ of [Promise.resolve(1), 2]) { last = v.get(); } return last; }],
    ["a recursive async function", async (v) => { const down = async (depth : number) : Promise<unknown> => { await null; return depth === 0 ? v.get() : down(depth - 1); }; return down(10); }],
];

describe("rule C3: an async function keeps the context of its call", () => {
    for (const [place, body] of CASES) {
        it(`keeps the context in ${place}, while another context resumes first`, async () => {
            const variable = new Variable<string>();
            const seen = await variable.run("mine", async () => {
                const other = busyOther(variable, "other");
                const value = await body(variable);
                await other;
                return value;
            });
            expect(seen).toBe("mine");
        });
    }

    it("keeps the context of the call when the caller awaits it in another context", async () => {
        const variable = new Variable<string>();
        const started = variable.run("a", () => (async () => {
            await turns(2);
            return variable.get();
        })());
        const seen = await variable.run("b", async () => await started);
        expect(seen).toBe("a");
    });

    it("gives each of 100 concurrent calls its own context after each await", async () => {
        const variable = new Variable<number>();
        const tasks = Array.from({ length : 100 }, (_, id) => variable.run(id, async () => {
            const seen : number[] = [];
            for (let step = 0; step < 5; step++) {
                await (step % 2 === 0 ? null : delay(id % 3));
                seen.push(variable.get() ?? -1);
            }
            return seen;
        }));
        const results = await Promise.all(tasks);
        results.forEach((seen, id) => expect(seen).toEqual([id, id, id, id, id]));
    });

    it("rejects the promise of the call when the body throws before the first await", async () => {
        const variable = new Variable<string>();
        const failing = async () : Promise<never> => {
            throw new Error("early");
        };
        await variable.run("a", async () => {
            await expect(failing()).rejects.toThrow("early");
            expect(variable.get()).toBe("a");
        });
    });

    it("keeps the context after an await in a finally block, after a return and after a throw", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const afterReturn = async () : Promise<string> => {
            try {
                return "result";
            } finally {
                const other = busyOther(variable, "other");
                await null;
                seen.push(variable.get());
                await other;
            }
        };
        const afterThrow = async () : Promise<never> => {
            try {
                throw new Error("thrown");
            } finally {
                await new Promise((resolve) => setTimeout(resolve, 1));
                seen.push(variable.get());
            }
        };
        expect(await variable.run("returns", afterReturn)).toBe("result");
        await expect(variable.run("throws", afterThrow)).rejects.toThrow("thrown");
        expect(seen).toEqual(["returns", "throws"]);
    });

    // SWC changes `async (a = f()) => body` into `(a = f()) => helper(body)`, so the default value throws outside the promise
    it.skipIf(compiler === "swc-es2016")("rejects the promise of the call when a parameter default or a parameter destructuring throws (not with SWC, which evaluates the parameters of an async arrow function outside the promise)", async () => {
        const fail = () : never => {
            throw new Error("default");
        };
        const withDefault = async (value : unknown = fail()) : Promise<unknown> => value;
        const withDestructuring = async ({ id } : { id : string }) : Promise<string> => id;
        let promise : Promise<unknown> | undefined;
        expect(() => { promise = withDefault(); }).not.toThrow();
        await expect(promise).rejects.toThrow("default");
        expect(() => { promise = withDestructuring(undefined as unknown as { id : string }); }).not.toThrow();
        await expect(promise).rejects.toThrow(TypeError);
    });

    it("takes one microtask turn for each await of a value or of a native promise, as a native await", async () => {
        const order : string[] = [];
        const resolved = Promise.resolve();
        const body = async () : Promise<void> => {
            await null;
            order.push("after await of a value");
            await resolved;
            order.push("after await of a promise");
        };
        const done = body();
        const turnsDone = resolved.then(() => order.push("turn 1")).then(() => order.push("turn 2")).then(() => order.push("turn 3"));
        await Promise.all([done, turnsDone]);
        expect(order).toEqual(["after await of a value", "turn 1", "after await of a promise", "turn 2", "turn 3"]);
    });

    it("reads the then property of an awaited object in the context of the body", async () => {
        const variable = new Variable<string>();
        let seen : string | undefined;
        const thenable = {
            get then() {
                seen = variable.get();
                return (resolve : (value : number) => void) : void => resolve(1);
            },
        };
        const value = await variable.run("body", async () => await thenable);
        expect(value).toBe(1);
        expect(seen).toBe("body");
    });

    /** A thenable that records the context of the read of `then` and of the call of `then`, as a query builder that starts its work in `then`. */
    function recordingThenable(variable : Variable<string>, seen : string[]) : PromiseLike<number> {
        return {
            get then() {
                seen.push(`read ${variable.get() ?? "none"}`);
                return (resolve : (value : number) => void) : void => {
                    seen.push(`call ${variable.get() ?? "none"}`);
                    resolve(1);
                };
            },
        } as unknown as PromiseLike<number>;
    }

    // SWC and esbuild resolve the thenable in a promise job without the context, so the call of then gets the root context
    it.skipIf(lowered)("reads and calls the then method of an awaited thenable in the context of the body, also after an await (not with SWC or esbuild)", async () => {
        const variable = new Variable<string>();
        const seen : string[] = [];
        const value = await variable.run("body", async () => {
            await null;
            const other = busyOther(variable, "other");
            const result = await recordingThenable(variable, seen);
            await other;
            return result;
        });
        expect(value).toBe(1);
        expect(seen).toEqual(["read body", "call body"]);
    });

    it.skipIf(lowered)("reads and calls the then method of a returned thenable in the context of the body (not with SWC or esbuild)", async () => {
        const variable = new Variable<string>();
        const seen : string[] = [];
        const value = await variable.run("body", async () => {
            await null;
            return recordingThenable(variable, seen);
        });
        expect(value).toBe(1);
        expect(seen).toEqual(["read body", "call body"]);
    });

    it("throws the error of a then getter into the body at the await", async () => {
        const failing = { get then() { throw new Error("then getter"); } };
        const caught = await (async () => {
            await null;
            try {
                await failing;
                return "no error";
            } catch (error) {
                return (error as Error).message;
            }
        })();
        expect(caught).toBe("then getter");
    });

    it("runs the body synchronously until the first await", () => {
        const variable = new Variable<string>();
        const order : string[] = [];
        const body = async () : Promise<void> => {
            order.push(`body:${variable.get() ?? "none"}`);
            await null;
            order.push("after await");
        };
        variable.run("a", () => {
            void body();
            order.push("caller");
        });
        expect(order).toEqual(["body:a", "caller"]);
    });
});

describe("rule C3 in static class members", () => {
    it("keeps this and super of an async arrow function of a static field and of a static block", async () => {
        class Base {
            static label() : string {
                return "base";
            }
        }
        class Service extends Base {
            static load = async () : Promise<unknown[]> => {
                await null;
                return [this === Service, super.label()];
            };
            static fromBlock : () => Promise<boolean>;
            static {
                this.fromBlock = async () : Promise<boolean> => {
                    await null;
                    return this === Service;
                };
            }
        }
        expect(await Service.load()).toEqual([true, "base"]);
        expect(await Service.fromBlock()).toBe(true);
    });

    // SWC and esbuild change the class fields with their own helpers, which give other names
    it.skipIf(lowered)("keeps the name and the length of an async arrow function in a class field (not with SWC or esbuild)", () => {
        class Service {
            static load = async (_first : number, _second : number) : Promise<void> => {
                await null;
            };
            save = async (_value : string) : Promise<void> => {
                await null;
            };
        }
        expect([Service.load.name, Service.load.length]).toEqual(["load", 2]);
        const service = new Service();
        expect([service.save.name, service.save.length]).toEqual(["save", 1]);
    });

    it.skipIf(lowered)("keeps the result and the name of class fields with the names _ref, eval, arguments and a string key (not with SWC or esbuild)", async () => {
        class Fields {
            _ref = async (value : number) : Promise<number> => value + 1;
            eval = async (value : number) : Promise<number> => value * 2;
            arguments = async function (value : number) : Promise<number> {
                return value * 3;
            };
            "my-handler" = async (value : number) : Promise<number> => value * 4;
        }
        const fields = new Fields();
        expect([await fields._ref(1), await fields.eval(1), await fields.arguments(1), await fields["my-handler"](1)]).toEqual([2, 2, 3, 4]);
        expect([fields._ref.name, fields.eval.name, fields.arguments.name, fields["my-handler"].name]).toEqual(["_ref", "eval", "arguments", "my-handler"]);
    });
});
