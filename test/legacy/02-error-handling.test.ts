import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay } from "../helpers.js";

function messageOf(error : unknown) : string {
    return error instanceof Error ? error.message : String(error);
}

describe("legacy 02: error handling", () => {
    it("gives the outer context in a catch block after an inner run() rejects, while another context resumes first", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("outer-ctx", async () => {
            const other = busyOther(variable, "other");
            let inCatch = "";
            try {
                await variable.run("inner-ctx", async () => {
                    throw new Error("inner error");
                });
            } catch (error) {
                inCatch = `${variable.get() ?? "none"}:${messageOf(error)}`;
            }
            await other;
            return [inCatch, variable.get()];
        });
        expect(seen).toEqual(["outer-ctx:inner error", "outer-ctx"]);
    });

    it("keeps the contexts of a run() nested in a catch block", async () => {
        const variable = new Variable<string>();
        const seen : (string | undefined)[] = [];
        await variable.run("outer", async () => {
            try {
                throw new Error("test");
            } catch {
                seen.push(variable.get());
                await variable.run("inner-catch", async () => {
                    seen.push(variable.get());
                    await delay(5);
                    seen.push(variable.get());
                });
                seen.push(variable.get());
            }
        });
        expect(seen).toEqual(["outer", "inner-catch", "inner-catch", "outer"]);
    });

    it("runs a finally callback on a rejected promise in the context of the finally call", async () => {
        const variable = new Variable<string>();
        const failed = variable.run("a", () => Promise.reject(new Error("test")));
        let seen : string | undefined;
        const settled = variable.run("finally-reject", () => failed.finally(() => {
            seen = variable.get();
        }));
        await expect(settled).rejects.toThrow("test");
        expect(seen).toBe("finally-reject");
    });

    it("rejects with the error of a finally callback that throws, and runs it in the context of the finally call", async () => {
        const variable = new Variable<string>();
        let seen : string | undefined;
        const result = variable.run("finally-throw", () => Promise.resolve("success").finally(() => {
            seen = variable.get();
            throw new Error("finally error");
        }));
        await expect(result).rejects.toThrow("finally error");
        expect(seen).toBe("finally-throw");
    });

    it("keeps the context before a throw that follows an await, while another context resumes first", async () => {
        const variable = new Variable<string>();
        const seen : (string | undefined)[] = [];
        const result = variable.run("throw-after-await", async () => {
            seen.push(variable.get());
            const other = busyOther(variable, "other");
            await null;
            seen.push(variable.get());
            await other;
            throw new Error("throw after await");
        });
        await expect(result).rejects.toThrow("throw after await");
        expect(seen).toEqual(["throw-after-await", "throw-after-await"]);
        expect(variable.get()).toBeUndefined();
    });

    it("runs a catch callback on a rejected Promise.all in the context of the catch call", async () => {
        const variable = new Variable<string>();
        const inputs = variable.run("a", () => [Promise.resolve(1), Promise.reject(new Error("rejected")), Promise.resolve(3)]);
        let seen : string | undefined;
        const result = variable.run("promise-all-reject", () => Promise.all(inputs).catch((error : unknown) => {
            seen = variable.get();
            throw error;
        }));
        await expect(result).rejects.toThrow("rejected");
        expect(seen).toBe("promise-all-reject");
    });

    it("gives each level its context when errors pass through three nested runs", async () => {
        const variable = new Variable<string>();
        const seen : string[] = [];
        await variable.run("level-1", async () => {
            seen.push(variable.get() ?? "none");
            try {
                await variable.run("level-2", async () => {
                    seen.push(variable.get() ?? "none");
                    try {
                        await variable.run("level-3", async () => {
                            seen.push(variable.get() ?? "none");
                            throw new Error("level-3 error");
                        });
                    } catch (error) {
                        seen.push(`${variable.get() ?? "none"}:${messageOf(error)}`);
                        throw new Error("level-2 error");
                    }
                });
            } catch (error) {
                seen.push(`${variable.get() ?? "none"}:${messageOf(error)}`);
            }
            seen.push(variable.get() ?? "none");
        });
        expect(seen).toEqual(["level-1", "level-2", "level-3", "level-2:level-3 error", "level-1:level-2 error", "level-1"]);
    });

    it("keeps the context in each callback of a then chain that rejects", async () => {
        const variable = new Variable<string>();
        const seen : (string | undefined)[] = [];
        let reached = false;
        const result = variable.run("then-chain-error", () => Promise.resolve(1)
            .then((value) => {
                seen.push(variable.get());
                return value * 2;
            })
            .then(() => {
                seen.push(variable.get());
                throw new Error("then chain error");
            })
            .then(() => {
                reached = true;
            }));
        await expect(result).rejects.toThrow("then chain error");
        expect(seen).toEqual(["then-chain-error", "then-chain-error"]);
        expect(reached).toBe(false);
    });

    it("records the context of each level when an error passes out of three nested runs", async () => {
        const variable = new Variable<string>();
        const path : (string | undefined)[] = [];
        const result = variable.run("ctx-A", async () => {
            path.push(variable.get());
            await variable.run("ctx-B", async () => {
                path.push(variable.get());
                await variable.run("ctx-C", async () => {
                    path.push(variable.get());
                    throw new Error("bubble error");
                });
            });
        });
        await expect(result).rejects.toThrow("bubble error");
        expect(path).toEqual(["ctx-A", "ctx-B", "ctx-C"]);
    });

    it("runs each catch callback in the context of its catch call, while the promises reject in other contexts", async () => {
        const variable = new Variable<string>();
        const errors : { readonly ctx : string | undefined; readonly error : string }[] = [];
        const record = (error : unknown) : never => {
            errors.push({ ctx : variable.get(), error : messageOf(error) });
            throw error;
        };
        let second : Promise<unknown> = Promise.resolve();
        const all = variable.run("concurrent-errors", async () => {
            const first = variable.run("err-1", async () => {
                await delay(5);
                throw new Error("error-1");
            }).catch(record);
            second = variable.run("err-2", async () => {
                await delay(10);
                throw new Error("error-2");
            }).catch(record);
            return Promise.all([first, second]);
        });
        await expect(all).rejects.toThrow("error-1");
        await expect(second).rejects.toThrow("error-2");
        expect(errors).toEqual([
            { ctx : "concurrent-errors", error : "error-1" },
            { ctx : "concurrent-errors", error : "error-2" },
        ]);
    });
});
