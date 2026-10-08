import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay, deferred } from "../helpers.js";

const hasWithResolvers = typeof (Promise as { withResolvers? : unknown }).withResolvers === "function";

describe("legacy 13: modern promises", () => {
    it.skipIf(!hasWithResolvers)("keeps the context after an await of Promise.withResolvers() that another context resolves (engines with withResolvers only)", async () => {
        const variable = new Variable<string>();
        const { promise, resolve } = Promise.withResolvers<string>();
        const result = variable.run("with-resolvers", async () => {
            const value = await promise;
            return { value, ctx : variable.get() };
        });
        variable.run("resolver", () => setTimeout(() => resolve("resolved"), 10));
        expect(await result).toEqual({ value : "resolved", ctx : "with-resolvers" });
    });

    it.skipIf(!hasWithResolvers)("keeps the context in a catch block after Promise.withResolvers() rejects (engines with withResolvers only)", async () => {
        const variable = new Variable<string>();
        const { promise, reject } = Promise.withResolvers<string>();
        const result = variable.run("with-reject", async () => {
            try {
                await promise;
                return "no error";
            } catch (error) {
                return `${variable.get() ?? "none"}: ${(error as Error).message}`;
            }
        });
        variable.run("rejecter", () => setTimeout(() => reject(new Error("test error")), 10));
        expect(await result).toBe("with-reject: test error");
    });

    it("runs a Promise executor in the current context, and a timer of the executor in the same context", async () => {
        const variable = new Variable<string>();
        const seen : (string | undefined)[] = [];
        await variable.run("constructor-test", async () => {
            await new Promise<void>((resolve) => {
                seen.push(variable.get());
                setTimeout(() => {
                    seen.push(variable.get());
                    resolve();
                }, 10);
            });
        });
        expect(seen).toEqual(["constructor-test", "constructor-test"]);
    });

    it("keeps the context after an await of a promise that the root context made", async () => {
        const variable = new Variable<string>();
        const pending = deferred<string>();
        const result = await variable.run("late-context", async () => {
            pending.resolve("resolved");
            const value = await pending.promise;
            return { value, ctx : variable.get() };
        });
        expect(result).toEqual({ value : "resolved", ctx : "late-context" });
    });

    it("keeps the contexts of a run() inside a Promise executor", async () => {
        const variable = new Variable<string>();
        const stages : string[] = [];
        await variable.run("outer", async () => {
            stages.push(`outer-start:${variable.get() ?? "none"}`);
            await new Promise<void>((resolve) => {
                stages.push(`constructor:${variable.get() ?? "none"}`);
                variable.run("inner", () => {
                    stages.push(`inner:${variable.get() ?? "none"}`);
                    resolve();
                });
                stages.push(`after-inner:${variable.get() ?? "none"}`);
            });
            stages.push(`outer-end:${variable.get() ?? "none"}`);
        });
        expect(stages).toEqual(["outer-start:outer", "constructor:outer", "inner:inner", "after-inner:outer", "outer-end:outer"]);
    });

    it("runs three then callbacks on one promise in the context of the then calls", async () => {
        const variable = new Variable<string>();
        const results = await variable.run("multi-then", () => {
            const promise = Promise.resolve("value");
            return Promise.all([1, 2, 3].map((handler) => promise.then((value) => `${handler}:${value}:${variable.get() ?? "none"}`)));
        });
        expect(results).toEqual(["1:value:multi-then", "2:value:multi-then", "3:value:multi-then"]);
    });

    it("runs three catch callbacks on one promise in the context of each catch call", async () => {
        const variable = new Variable<string>();
        const failed = variable.run("a", () => Promise.reject(new Error("test")));
        const results = await Promise.all(["catch-1", "catch-2", "catch-3"].map((value) =>
            variable.run(value, () => failed.catch(() => variable.get()))));
        expect(results).toEqual(["catch-1", "catch-2", "catch-3"]);
    });

    it("runs the then and finally callbacks of a fulfilled promise in their contexts, and no catch callback", async () => {
        const variable = new Variable<string>();
        const handlers : string[] = [];
        const promise = Promise.resolve("success");
        await Promise.all([
            variable.run("then-1", () => promise.then(() => { handlers.push(`then-1:${variable.get() ?? "none"}`); })),
            variable.run("catch-1", () => promise.catch(() => { handlers.push(`catch-1:${variable.get() ?? "none"}`); })),
            variable.run("then-2", () => promise.then(() => { handlers.push(`then-2:${variable.get() ?? "none"}`); })),
            variable.run("finally", () => promise.finally(() => { handlers.push(`finally:${variable.get() ?? "none"}`); })),
        ]);
        expect(handlers).toEqual(["then-1:then-1", "then-2:then-2", "finally:finally"]);
    });

    it("runs each handler of a shared promise in the context in which the code attached it", async () => {
        const variable = new Variable<string>();
        const promise = Promise.resolve("shared");
        const handlers : string[] = [];
        await Promise.all(["context-A", "context-B", "context-C"].map((value) => variable.run(value, async () => {
            void promise.then(() => {
                handlers.push(`${value}:${variable.get() ?? "none"}`);
            });
            await delay(10);
        })));
        expect(handlers).toEqual(["context-A:context-A", "context-B:context-B", "context-C:context-C"]);
    });

    it("keeps the context after an await of a promise that resolved before the await", async () => {
        const variable = new Variable<string>();
        const result = await variable.run("pre-resolved", async () => {
            const promise = Promise.resolve("immediate");
            await delay(10);
            const other = busyOther(variable, "other");
            const value = await promise;
            const seen = variable.get();
            await other;
            return { value, ctx : seen };
        });
        expect(result).toEqual({ value : "immediate", ctx : "pre-resolved" });
    });

    it("keeps the context in a catch block after an await of a promise that rejected before the await", async () => {
        const variable = new Variable<string>();
        const result = await variable.run("pre-rejected", async () => {
            const promise = Promise.reject(new Error("immediate"));
            // A handler prevents an unhandled rejection report during the delay
            promise.catch(() => undefined);
            await delay(10);
            try {
                await promise;
                return "no error";
            } catch (error) {
                return `${variable.get() ?? "none"}: ${(error as Error).message}`;
            }
        });
        expect(result).toBe("pre-rejected: immediate");
        expect(variable.get()).toBeUndefined();
    });

    it("lets a run() wait on a promise that never settles, while other code keeps its context", async () => {
        const variable = new Variable<string>();
        const result = await Promise.race([
            variable.run("never-resolves", async () => {
                await new Promise(() => undefined);
                return "should not reach";
            }),
            delay(50).then(() => "timeout"),
        ]);
        expect(result).toBe("timeout");
        expect(variable.get()).toBeUndefined();
        expect(await variable.run("after", async () => {
            await null;
            return variable.get();
        })).toBe("after");
    });

    it("keeps the context after an await of a thenable that a timer settles, while another context resumes first", async () => {
        const variable = new Variable<string>();
        const thenable = {
            then(onFulfilled : (value : string) => void) : void {
                setTimeout(() => onFulfilled("thenable-value"), 10);
            },
        };
        const result = await variable.run("thenable-test", async () => {
            const other = busyOther(variable, "other");
            const value = await thenable;
            const seen = variable.get();
            await other;
            return { value, ctx : seen };
        });
        expect(result).toEqual({ value : "thenable-value", ctx : "thenable-test" });
    });
});
