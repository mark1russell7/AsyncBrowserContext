import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay } from "../helpers.js";

class CustomError extends Error {
    readonly code : string;

    constructor(message : string, code : string) {
        super(message);
        this.name = "CustomError";
        this.code = code;
    }
}

/** The legacy error type tests. Each case throws one value; the coroutine must give the same value to the caller. */
const THROWN : readonly (readonly [string, () => unknown, (thrown : unknown) => void])[] = [
    ["a TypeError of the engine", () => (null as unknown as { method() : void }).method(), (thrown) => expect(thrown).toBeInstanceOf(TypeError)],
    ["a RangeError of the engine", () => new Array(-1), (thrown) => expect(thrown).toBeInstanceOf(RangeError)],
    ["a ReferenceError", () => { throw new ReferenceError("nonExistentVariable is not defined"); }, (thrown) => expect(thrown).toBeInstanceOf(ReferenceError)],
    ["a custom error class", () => { throw new CustomError("custom message", "ERR_CUSTOM"); }, (thrown) => {
        expect(thrown).toBeInstanceOf(CustomError);
        expect((thrown as CustomError).code).toBe("ERR_CUSTOM");
    }],
    ["a string", () => { throw "string error"; }, (thrown) => expect(thrown).toBe("string error")],
    ["a number", () => { throw 42; }, (thrown) => expect(thrown).toBe(42)],
    ["a plain object", () => { throw { custom : "error", code : 500 }; }, (thrown) => expect(thrown).toEqual({ custom : "error", code : 500 })],
];

describe("legacy 15: advanced errors", () => {
    it("rejects with the error of a finally callback, and runs it in the context of the finally call", async () => {
        const variable = new Variable<string>();
        let finallyContext : string | undefined;
        const result = variable.run("finally-error", async () => Promise.resolve("success").finally(() => {
            finallyContext = variable.get();
            throw new Error("finally error");
        }));
        await expect(result).rejects.toThrow("finally error");
        expect(finallyContext).toBe("finally-error");
    });

    it("runs three chained finally callbacks in the context of their calls when the second throws", async () => {
        const variable = new Variable<string>();
        const contexts : (string | undefined)[] = [];
        const result = variable.run("nested-finally", () => Promise.resolve("value")
            .finally(() => {
                contexts.push(variable.get());
            })
            .finally(() => {
                contexts.push(variable.get());
                throw new Error("second finally");
            })
            .finally(() => {
                contexts.push(variable.get());
            }));
        await expect(result).rejects.toThrow("second finally");
        expect(contexts).toEqual(["nested-finally", "nested-finally", "nested-finally"]);
    });

    it("gives the context of the run() to a catch block after an error of three nested async functions", async () => {
        const variable = new Variable<string>();
        const level3 = async () : Promise<never> => {
            await delay(5);
            throw new Error("level 3 error");
        };
        const level2 = async () : Promise<void> => {
            await delay(5);
            await level3();
        };
        const level1 = async () : Promise<void> => {
            await delay(5);
            await level2();
        };
        const seen = await variable.run("nested-error", async () => {
            const other = busyOther(variable, "other", 20);
            try {
                await level1();
                return "no error";
            } catch (error) {
                return `${variable.get() ?? "none"}: ${(error as Error).message}`;
            } finally {
                await other;
            }
        });
        expect(seen).toBe("nested-error: level 3 error");
    });

    it("rejects Promise.all with the first error of parallel operations, and keeps the context in the catch block", async () => {
        const variable = new Variable<string>();
        const operations : Promise<unknown>[] = [];
        const seen = await variable.run("parallel-errors", async () => {
            operations.push(
                (async () => {
                    await delay(5);
                    throw new Error("error-1");
                })(),
                (async () => {
                    await delay(10);
                    return `completed-2:${variable.get() ?? "none"}`;
                })(),
                (async () => {
                    await delay(15);
                    throw new Error("error-3");
                })(),
            );
            try {
                await Promise.all(operations);
                return "no error";
            } catch (error) {
                return `${variable.get() ?? "none"}: ${(error as Error).message}`;
            }
        });
        expect(seen).toBe("parallel-errors: error-1");
        const settled = await Promise.allSettled(operations);
        expect(settled.map((result) => result.status)).toEqual(["rejected", "fulfilled", "rejected"]);
        expect((settled[1] as PromiseFulfilledResult<unknown>).value).toBe("completed-2:parallel-errors");
    });

    it("gives the default value after an async run() rejects", async () => {
        const variable = new Variable<string>();
        const result = variable.run("async-error-in-run", async () => {
            await delay(5);
            throw new Error("async error");
        });
        await expect(result).rejects.toThrow("async error");
        expect(variable.get()).toBeUndefined();
    });

    it("keeps the context after each of five caught rejections", async () => {
        const variable = new Variable<string>();
        const errors = await variable.run("multi-recovery", async () => {
            const caught : string[] = [];
            for (let index = 0; index < 5; index++) {
                const other = busyOther(variable, `other-${index}`);
                try {
                    await Promise.reject(new Error(`error-${index}`));
                } catch (error) {
                    caught.push(`${(error as Error).message}:${variable.get() ?? "none"}`);
                }
                await other;
                caught.push(`after:${variable.get() ?? "none"}`);
            }
            return caught;
        });
        const expected : string[] = [];
        for (let index = 0; index < 5; index++) {
            expected.push(`error-${index}:multi-recovery`, "after:multi-recovery");
        }
        expect(errors).toEqual(expected);
    });

    it("keeps the context after an await of Promise.allSettled with rejections", async () => {
        const variable = new Variable<string>();
        const result = await variable.run("allsettled-recovery", async () => {
            const results = await Promise.allSettled([
                Promise.resolve("success"),
                Promise.reject(new Error("error-1")),
                Promise.resolve("success-2"),
                Promise.reject(new Error("error-2")),
            ]);
            return { ctx : variable.get(), statuses : results.map((item) => item.status) };
        });
        expect(result).toEqual({ ctx : "allsettled-recovery", statuses : ["fulfilled", "rejected", "fulfilled", "rejected"] });
    });

    for (const [name, fail, check] of THROWN) {
        it(`gives ${name} unchanged to the caller of an async run(), and keeps the context in its catch block`, async () => {
            const variable = new Variable<string>();
            const inner = variable.run("thrower", async () => {
                await null;
                fail();
                return "no error";
            });
            const seen = await variable.run("catcher", async () => {
                try {
                    await inner;
                    return { thrown : undefined as unknown, ctx : "no error" };
                } catch (thrown) {
                    return { thrown, ctx : variable.get() };
                }
            });
            expect(seen.ctx).toBe("catcher");
            check(seen.thrown);
        });
    }
});
