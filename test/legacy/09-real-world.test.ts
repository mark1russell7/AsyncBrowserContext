import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { delay } from "../helpers.js";

describe("legacy 09: real world patterns", () => {
    it("keeps the request and user values through a handler chain, for two concurrent requests", async () => {
        const requestId = new Variable<string>();
        const userId = new Variable<string>();
        const records : string[] = [];
        const record = (stage : string) : void => {
            records.push(`${stage}:${requestId.get() ?? "none"}:${userId.get() ?? "none"}`);
        };
        const processRequest = async () : Promise<{ readonly success : boolean }> => {
            await delay(5);
            record("process");
            return { success : true };
        };
        const logRequest = async () : Promise<void> => {
            await delay(2);
            record("log");
        };
        const handleRequest = (request : string, user : string, ms : number) : Promise<{ readonly success : boolean }> =>
            requestId.run(request, () => userId.run(user, async () => {
                await delay(ms);
                record("auth");
                const result = await processRequest();
                await logRequest();
                return result;
            }));
        const results = await Promise.all([handleRequest("req-123", "user-456", 5), handleRequest("req-789", "user-012", 1)]);
        expect(results).toEqual([{ success : true }, { success : true }]);
        expect(records.filter((line) => line.includes("req-123")).sort()).toEqual(["auth:req-123:user-456", "log:req-123:user-456", "process:req-123:user-456"]);
        expect(records.filter((line) => line.includes("req-789")).sort()).toEqual(["auth:req-789:user-012", "log:req-789:user-012", "process:req-789:user-012"]);
    });

    it("gives each of five concurrent requests its own value in each middleware", async () => {
        const requestId = new Variable<string>();
        const seen = new Map<string, (string | undefined)[]>();
        const middleware = async (expected : string, ms : number) : Promise<void> => {
            await delay(ms);
            seen.get(expected)?.push(requestId.get());
        };
        const handleRequest = (id : string, index : number) : Promise<string | undefined> => requestId.run(id, async () => {
            seen.set(id, []);
            await delay(index % 3);
            await middleware(id, (index + 1) % 3);
            await middleware(id, (index + 2) % 3);
            await middleware(id, index % 2);
            return requestId.get();
        });
        const ids = ["req-1", "req-2", "req-3", "req-4", "req-5"];
        expect(await Promise.all(ids.map(handleRequest))).toEqual(ids);
        for (const id of ids) {
            expect(seen.get(id)).toEqual([id, id, id]);
        }
    });

    it("keeps the request value through retries that fail", async () => {
        const requestId = new Variable<string>();
        const seen : (string | undefined)[] = [];
        let attempts = 0;
        const fetchWithRetry = (id : string, maxRetries = 3) : Promise<{ readonly success : boolean; readonly attempts : number }> =>
            requestId.run(id, async () => {
                for (let index = 0; index < maxRetries; index++) {
                    attempts++;
                    try {
                        await delay(5);
                        seen.push(requestId.get());
                        if (index < 2) {
                            throw new Error("Network error");
                        }
                        return { success : true, attempts : index + 1 };
                    } catch (error) {
                        seen.push(requestId.get());
                        if (index === maxRetries - 1) {
                            throw error;
                        }
                    }
                }
                return { success : false, attempts };
            });
        const result = await fetchWithRetry("req-retry-123");
        expect(result).toEqual({ success : true, attempts : 3 });
        expect(attempts).toBe(3);
        expect(seen).toEqual(Array.from({ length : 5 }, () => "req-retry-123"));
    });

    it("gives each query the transaction of its caller, for two concurrent transactions", async () => {
        const transactionId = new Variable<string>();
        const queries : { readonly sql : string; readonly expected : string; readonly actual : string | undefined }[] = [];
        const query = async (sql : string, expected : string, ms : number) : Promise<void> => {
            await delay(ms);
            queries.push({ sql, expected, actual : transactionId.get() });
        };
        const runTransaction = (id : string, offset : number) : Promise<{ readonly committed : boolean; readonly id : string | undefined }> =>
            transactionId.run(id, async () => {
                await delay(2);
                await query("SELECT * FROM users", id, offset % 3);
                await query("INSERT INTO logs VALUES (...)", id, (offset + 1) % 3);
                await query("UPDATE accounts SET balance = ...", id, (offset + 2) % 3);
                await delay(2);
                return { committed : true, id : transactionId.get() };
            });
        const results = await Promise.all([runTransaction("tx-789", 0), runTransaction("tx-790", 1)]);
        expect(results).toEqual([{ committed : true, id : "tx-789" }, { committed : true, id : "tx-790" }]);
        expect(queries).toHaveLength(6);
        expect(queries.every((entry) => entry.actual === entry.expected)).toBe(true);
    });

    it("keeps the values of nested transactions with savepoints", async () => {
        const transaction = new Variable<string>();
        const seen : (string | undefined)[] = [];
        const run = <T>(name : string, fn : () => Promise<T>) : Promise<T> => transaction.run(name, async () => {
            await delay(2);
            const result = await fn();
            await delay(2);
            seen.push(`end ${transaction.get() ?? "none"}`);
            return result;
        });
        const result = await run("tx-outer", async () => {
            seen.push(transaction.get());
            const inner1 = await run("tx-inner-1", async () => {
                seen.push(transaction.get());
                await delay(3);
                return "inner1-result";
            });
            seen.push(transaction.get());
            const inner2 = await run("tx-inner-2", async () => {
                seen.push(transaction.get());
                await delay(3);
                return "inner2-result";
            });
            seen.push(transaction.get());
            return { inner1, inner2 };
        });
        expect(result).toEqual({ inner1 : "inner1-result", inner2 : "inner2-result" });
        expect(seen).toEqual(["tx-outer", "tx-inner-1", "end tx-inner-1", "tx-outer", "tx-inner-2", "end tx-inner-2", "tx-outer", "end tx-outer"]);
    });

    it("keeps the transaction value in the rollback after an error", async () => {
        const transactionId = new Variable<string>();
        const seen : (string | undefined)[] = [];
        const rollback = async () : Promise<void> => {
            await delay(2);
            seen.push(`rollback ${transactionId.get() ?? "none"}`);
        };
        const result = transactionId.run("tx-rollback-123", async () => {
            try {
                await delay(2);
                seen.push(transactionId.get());
                throw new Error("Constraint violation");
            } catch (error) {
                seen.push(transactionId.get());
                await rollback();
                throw error;
            }
        });
        await expect(result).rejects.toThrow("Constraint violation");
        expect(seen).toEqual(["tx-rollback-123", "tx-rollback-123", "rollback tx-rollback-123"]);
    });

    it("keeps the request value before and after next() in each middleware of a chain", async () => {
        const variable = new Variable<string>();
        const order : string[] = [];
        const middleware = (name : string) => async (next : () => Promise<{ readonly handled : boolean }>) : Promise<{ readonly handled : boolean }> => {
            order.push(`${name}-before:${variable.get() ?? "none"}`);
            await delay(2);
            const result = await next();
            await delay(2);
            order.push(`${name}-after:${variable.get() ?? "none"}`);
            return result;
        };
        const handler = async () : Promise<{ readonly handled : boolean }> => {
            order.push(`handler:${variable.get() ?? "none"}`);
            return { handled : true };
        };
        const result = await variable.run("request-context", () =>
            middleware("m1")(() => middleware("m2")(() => middleware("m3")(handler))));
        expect(result).toEqual({ handled : true });
        expect(order).toEqual([
            "m1-before:request-context", "m2-before:request-context", "m3-before:request-context", "handler:request-context",
            "m3-after:request-context", "m2-after:request-context", "m1-after:request-context",
        ]);
    });

    it("keeps the request value in a middleware that catches the error of the next middleware", async () => {
        const variable = new Variable<string>();
        const seen : (string | undefined)[] = [];
        const errorMiddleware = async (next : () => Promise<unknown>) : Promise<unknown> => {
            try {
                return await next();
            } catch (error) {
                seen.push(variable.get());
                return { error : (error as Error).message, recovered : true };
            }
        };
        const faultyMiddleware = async () : Promise<never> => {
            seen.push(variable.get());
            throw new Error("Middleware error");
        };
        const result = await variable.run("error-context", () => errorMiddleware(faultyMiddleware));
        expect(result).toEqual({ error : "Middleware error", recovered : true });
        expect(seen).toEqual(["error-context", "error-context"]);
    });

    it("gives each log line the trace and the span of its code", async () => {
        const traceId = new Variable<string>();
        const spanId = new Variable<string>();
        const logs : { readonly message : string; readonly traceId : string | undefined; readonly spanId : string | undefined }[] = [];
        const log = (message : string) : void => {
            logs.push({ message, traceId : traceId.get(), spanId : spanId.get() });
        };
        const operation = (name : string) : Promise<void> => spanId.run(name, async () => {
            log(`${name} started`);
            await delay(5);
            log(`${name} processing`);
            await delay(5);
            log(`${name} completed`);
        });
        await traceId.run("trace-abc-123", async () => {
            log("Request started");
            await operation("span-auth");
            await operation("span-query");
            await operation("span-render");
            log("Request completed");
        });
        expect(logs).toHaveLength(11);
        expect(logs.every((line) => line.traceId === "trace-abc-123")).toBe(true);
        expect(logs.map((line) => line.spanId)).toEqual([
            undefined,
            "span-auth", "span-auth", "span-auth",
            "span-query", "span-query", "span-query",
            "span-render", "span-render", "span-render",
            undefined,
        ]);
    });

    it("keeps the trace and changes the service name through three nested services", async () => {
        const traceId = new Variable<string>();
        const serviceName = new Variable<string>();
        const seen : string[] = [];
        const record = (stage : string) : void => {
            seen.push(`${stage}:${traceId.get() ?? "none"}:${serviceName.get() ?? "none"}`);
        };
        const serviceC = () : Promise<{ readonly fromC : boolean }> => serviceName.run("service-c", async () => {
            await delay(5);
            record("c");
            return { fromC : true };
        });
        const serviceB = () : Promise<{ readonly fromB : boolean; readonly fromC : { readonly fromC : boolean } }> => serviceName.run("service-b", async () => {
            await delay(5);
            record("b");
            return { fromB : true, fromC : await serviceC() };
        });
        const result = await traceId.run("distributed-trace-xyz", () => serviceName.run("service-a", async () => {
            await delay(5);
            record("a-before");
            const fromB = await serviceB();
            record("a-after");
            return { fromA : true, fromB };
        }));
        expect(result).toEqual({ fromA : true, fromB : { fromB : true, fromC : { fromC : true } } });
        expect(seen).toEqual([
            "a-before:distributed-trace-xyz:service-a",
            "b:distributed-trace-xyz:service-b",
            "c:distributed-trace-xyz:service-c",
            "a-after:distributed-trace-xyz:service-a",
        ]);
    });

    it("gives each log line of parallel operations the request of its group, for two concurrent groups", async () => {
        const requestId = new Variable<string>();
        const logs : { readonly group : string; readonly requestId : string | undefined }[] = [];
        const log = (group : string) : void => {
            logs.push({ group, requestId : requestId.get() });
        };
        const operation = async (group : string, ms : number) : Promise<string> => {
            log(group);
            await delay(ms);
            log(group);
            return `${group}-${ms}`;
        };
        const parallelOperations = (id : string) : Promise<string[]> => requestId.run(id, async () => {
            log(id);
            const results = await Promise.all([operation(id, 1), operation(id, 5), operation(id, 3)]);
            log(id);
            return results;
        });
        const results = await Promise.all([parallelOperations("req-parallel-789"), parallelOperations("req-parallel-790")]);
        expect(results).toEqual([
            ["req-parallel-789-1", "req-parallel-789-5", "req-parallel-789-3"],
            ["req-parallel-790-1", "req-parallel-790-5", "req-parallel-790-3"],
        ]);
        expect(logs).toHaveLength(16);
        expect(logs.every((line) => line.requestId === line.group)).toBe(true);
    });
});
