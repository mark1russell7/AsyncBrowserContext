import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

/** Runs `fn` in a run() of `value` after `ms` milliseconds, and gives the value of the variable then. */
function readAfter(variable : Variable<string>, value : string, ms : number) : Promise<string | undefined> {
    return variable.run(value, async () => {
        await delay(ms);
        return variable.get();
    });
}

function failAfter(variable : Variable<string>, value : string, ms : number, message : string) : Promise<never> {
    return variable.run(value, async () => {
        await delay(ms);
        throw new Error(`${message} in ${variable.get() ?? "none"}`);
    });
}

describe("legacy 03: Promise combinators", () => {
    it("gives each input of Promise.all its own context", async () => {
        const variable = new Variable<string>();
        const results = await Promise.all([readAfter(variable, "A", 10), readAfter(variable, "B", 5), readAfter(variable, "C", 15)]);
        expect(results).toEqual(["A", "B", "C"]);
    });

    it("keeps the outer context after an await of Promise.all", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("outer", async () => {
            const results = await Promise.all([readAfter(variable, "inner-1", 5), readAfter(variable, "inner-2", 5)]);
            return { outer : variable.get(), results };
        });
        expect(seen).toEqual({ outer : "outer", results : ["inner-1", "inner-2"] });
    });

    it("keeps the contexts of nested Promise.all calls", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("root", async () => {
            const outer = await Promise.all([
                variable.run("branch-1", async () => {
                    const leaves = await Promise.all([readAfter(variable, "leaf-1a", 5), readAfter(variable, "leaf-1b", 5)]);
                    return { branch : variable.get(), leaves };
                }),
                readAfter(variable, "branch-2", 5),
            ]);
            return { root : variable.get(), outer };
        });
        expect(seen).toEqual({ root : "root", outer : [{ branch : "branch-1", leaves : ["leaf-1a", "leaf-1b"] }, "branch-2"] });
    });

    it("gives the winner of Promise.race its own context", async () => {
        const variable = new Variable<string>();
        const racers = [readAfter(variable, "slow", 20), readAfter(variable, "fast", 5), readAfter(variable, "slowest", 30)];
        expect(await Promise.race(racers)).toBe("fast");
        expect(await Promise.all(racers)).toEqual(["slow", "fast", "slowest"]);
    });

    it("keeps the outer context after an await of Promise.race", async () => {
        const variable = new Variable<string>();
        const racers : Promise<string | undefined>[] = [];
        const seen = await variable.run("outer-race", async () => {
            racers.push(readAfter(variable, "racer-1", 10), readAfter(variable, "racer-2", 5));
            const winner = await Promise.race(racers);
            return { winner, outer : variable.get() };
        });
        await Promise.all(racers);
        expect(seen).toEqual({ winner : "racer-2", outer : "outer-race" });
    });

    it("rejects Promise.race with the error of the first rejection, and keeps the outer context in the catch block", async () => {
        const variable = new Variable<string>();
        const slow = readAfter(variable, "resolve-slow", 20);
        const seen = await variable.run("race-reject", async () => {
            try {
                await Promise.race([failAfter(variable, "reject-fast", 5, "fast rejection"), slow]);
                return "no error";
            } catch (error) {
                return `${variable.get() ?? "none"}: ${(error as Error).message}`;
            }
        });
        expect(seen).toBe("race-reject: fast rejection in reject-fast");
        expect(await slow).toBe("resolve-slow");
    });

    it("gives each input of Promise.allSettled its own context", async () => {
        const variable = new Variable<string>();
        const results = await Promise.allSettled([readAfter(variable, "success-1", 5), readAfter(variable, "success-2", 10)]);
        expect(results).toEqual([{ status : "fulfilled", value : "success-1" }, { status : "fulfilled", value : "success-2" }]);
    });

    it("gives the context of each input to the values and reasons of Promise.allSettled", async () => {
        const variable = new Variable<string>();
        const results = await Promise.allSettled([
            readAfter(variable, "success", 5),
            failAfter(variable, "failure", 5, "Failed"),
            readAfter(variable, "success-2", 5),
        ]);
        expect(results[0]).toEqual({ status : "fulfilled", value : "success" });
        expect(results[1]?.status).toBe("rejected");
        expect(((results[1] as PromiseRejectedResult).reason as Error).message).toBe("Failed in failure");
        expect(results[2]).toEqual({ status : "fulfilled", value : "success-2" });
    });

    it("keeps the outer context after an await of Promise.allSettled", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("outer-settled", async () => {
            const results = await Promise.allSettled([
                variable.run("inner-1", async () => variable.get()),
                variable.run("inner-2", async () => {
                    throw new Error("inner error");
                }),
            ]);
            return { outer : variable.get(), statuses : results.map((result) => result.status) };
        });
        expect(seen).toEqual({ outer : "outer-settled", statuses : ["fulfilled", "rejected"] });
    });

    it("gives the first fulfilled input of Promise.any its own context", async () => {
        const variable = new Variable<string>();
        const inputs = [failAfter(variable, "reject-1", 5, "reject-1"), readAfter(variable, "resolve-first", 10), readAfter(variable, "resolve-second", 15)];
        expect(await Promise.any(inputs)).toBe("resolve-first");
        await Promise.allSettled(inputs);
    });

    it("rejects Promise.any with an AggregateError of the errors in each context", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("all-reject", async () => {
            try {
                await Promise.any([
                    failAfter(variable, "reject-1", 5, "error"),
                    failAfter(variable, "reject-2", 10, "error"),
                    failAfter(variable, "reject-3", 15, "error"),
                ]);
                return { outer : variable.get(), errors : [] as string[] };
            } catch (error) {
                expect(error).toBeInstanceOf(AggregateError);
                return { outer : variable.get(), errors : (error as AggregateError).errors.map((item : Error) => item.message) };
            }
        });
        expect(seen).toEqual({ outer : "all-reject", errors : ["error in reject-1", "error in reject-2", "error in reject-3"] });
    });

    it("keeps the outer context after an await of Promise.any", async () => {
        const variable = new Variable<string>();
        const inputs : Promise<string | undefined>[] = [];
        const seen = await variable.run("outer-any", async () => {
            inputs.push(readAfter(variable, "any-1", 20), readAfter(variable, "any-2", 5));
            const winner = await Promise.any(inputs);
            return { winner, outer : variable.get() };
        });
        await Promise.all(inputs);
        expect(seen).toEqual({ winner : "any-2", outer : "outer-any" });
    });
});
