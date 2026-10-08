import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay, turns } from "../helpers.js";

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
