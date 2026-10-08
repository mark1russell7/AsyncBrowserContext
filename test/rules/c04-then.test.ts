import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { deferred, turns } from "../helpers.js";

/** A promise that the module makes when it loads, in the root context. */
const moduleReady = Promise.resolve("ready");

function capture<T>(variable : Variable<T>) : () => T | undefined {
    return () => variable.get();
}

describe("rule C4: a then callback runs in the context of the then call", () => {
    it("uses the context of the then call, not of the promise creation", async () => {
        const variable = new Variable<string>();
        const shared = variable.run("a", () => Promise.resolve(1));
        const fromB = variable.run("b", () => shared.then(capture(variable)));
        const fromC = variable.run("c", () => shared.then(capture(variable)));
        expect(await fromB).toBe("b");
        expect(await fromC).toBe("c");
    });

    it("uses the context of the then call on a cached promise", async () => {
        const variable = new Variable<string>();
        const cache = new Map<string, Promise<object>>();
        const getConfig = () : Promise<object> => {
            let cached = cache.get("config");
            if (cached === undefined) {
                cached = Promise.resolve({});
                cache.set("config", cached);
            }
            return cached;
        };
        expect(await variable.run("request-a", () => getConfig().then(capture(variable)))).toBe("request-a");
        expect(await variable.run("request-b", () => getConfig().then(capture(variable)))).toBe("request-b");
    });

    it("uses the context of the then call on a promise that the module made when it loaded", async () => {
        const variable = new Variable<string>();
        expect(await variable.run("request-c", () => moduleReady.then(capture(variable)))).toBe("request-c");
    });

    it("does not give the inner context of run() to a then call outside run()", async () => {
        const variable = new Variable<string>();
        const result = variable.run("inner", async () => 1);
        expect(await result.then(capture(variable))).toBeUndefined();
    });

    it("uses the context of the then call when another context settles the promise", async () => {
        const variable = new Variable<string>();
        const pending = deferred<number>();
        const seen = variable.run("waiter", () => pending.promise.then(capture(variable)));
        variable.run("settler", () => pending.resolve(1));
        expect(await seen).toBe("waiter");
    });

    it("applies the rule to catch and finally", async () => {
        const variable = new Variable<string>();
        const failed = variable.run("a", () => Promise.reject(new Error("stop")));
        const caught = variable.run("b", () => failed.catch(capture(variable)));
        let finallySeen : unknown;
        const done = variable.run("c", () => Promise.resolve().finally(() => { finallySeen = variable.get(); }));
        expect(await caught).toBe("b");
        await done;
        expect(finallySeen).toBe("c");
    });

    it("applies the rule to each callback of a then chain", async () => {
        const variable = new Variable<string>();
        const seen : unknown[] = [];
        const chain = variable.run("a", () => Promise.resolve()
            .then(() => { seen.push(variable.get()); })
            .then(() => { seen.push(variable.get()); }));
        await variable.run("b", async () => {
            await turns(3);
        });
        await chain;
        expect(seen).toEqual(["a", "a"]);
    });

    it("applies the rule to the results of Promise.all, race, allSettled and any", async () => {
        const variable = new Variable<string>();
        const inputs = variable.run("a", () => [Promise.resolve(1), Promise.resolve(2)]);
        const results = await variable.run("b", () => Promise.all([
            Promise.all(inputs).then(capture(variable)),
            Promise.race(inputs).then(capture(variable)),
            Promise.allSettled(inputs).then(capture(variable)),
            Promise.any(inputs).then(capture(variable)),
        ]));
        expect(results).toEqual(["b", "b", "b", "b"]);
    });

    it("applies the rule to a then call inside a then callback", async () => {
        const variable = new Variable<string>();
        const seen = await variable.run("a", () => Promise.resolve().then(() =>
            variable.run("b", () => Promise.resolve().then(capture(variable)))));
        expect(seen).toBe("b");
    });

    it("gives the root context to a then call in the root context", async () => {
        const variable = new Variable<string>();
        const shared = variable.run("a", () => Promise.resolve());
        expect(await shared.then(capture(variable))).toBeUndefined();
    });
});
