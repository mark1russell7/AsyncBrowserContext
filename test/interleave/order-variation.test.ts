import { describe, expect, it } from "vitest";
import { Snapshot, Variable } from "async-browser-context";
import { delay, runtime, transformed } from "../helpers.js";

/**
 * Order variation. Many tasks run at the same time. Each task has its own
 * context and does a random sequence of asynchronous operations. After each
 * operation, the task reads its context. A fixed seed makes each order
 * repeatable: a failure message gives the seed.
 */

/** A small random generator with a seed (mulberry32). */
function random(seed : number) : () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

const generatorsBound = !(runtime === "node" && !transformed);

type Operation = (variable : Variable<string>, other : Variable<string>, next : () => number) => Promise<unknown>;

/** Each operation gives the value of `variable` that it read after an asynchronous step. */
const OPERATIONS : readonly Operation[] = [
    async (v) => { await null; return v.get(); },
    async (v, _o, next) => { await delay(Math.floor(next() * 3)); return v.get(); },
    async (v) => Promise.resolve().then(() => v.get()),
    async (v) => new Promise((resolve) => setTimeout(() => resolve(v.get()), 0)),
    async (v) => new Promise((resolve) => queueMicrotask(() => resolve(v.get()))),
    async (v, o) => o.run("nested", async () => { await null; return v.get(); }),
    async (v) => { const snapshot = new Snapshot(); await null; return snapshot.run(() => v.get()); },
    async (v) => { const record = { first : await null, value : v.get() }; return record.value; },
    async (v) => {
        async function* values() : AsyncGenerator<unknown> {
            await null;
            yield v.get();
        }
        let last : unknown;
        for await (const value of values()) {
            last = value;
        }
        return generatorsBound ? last : v.get();
    },
    async (v) => {
        const shared = Promise.resolve();
        await null;
        return shared.then(() => v.get());
    },
];

async function runSeed(seed : number, tasks : number, steps : number) : Promise<string[]> {
    const next = random(seed);
    const variable = new Variable<string>();
    const other = new Variable<string>();
    const failures : string[] = [];
    await Promise.all(Array.from({ length : tasks }, (_, task) => variable.run(`task-${task}`, async () => {
        for (let step = 0; step < steps; step++) {
            const index = Math.floor(next() * OPERATIONS.length);
            const operation = OPERATIONS[index] as Operation;
            const seen = await operation(variable, other, next);
            if (seen !== `task-${task}`) {
                failures.push(`seed ${seed}, task ${task}, step ${step}, operation ${index}: saw ${String(seen)}`);
            }
            if (variable.get() !== `task-${task}`) {
                failures.push(`seed ${seed}, task ${task}, step ${step}, operation ${index}: after the operation saw ${String(variable.get())}`);
            }
        }
    })));
    return failures;
}

describe("order variation with fixed seeds", () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
        it(`keeps each context in 40 tasks with 15 random operations (seed ${seed})`, async () => {
            const failures = await runSeed(seed, 40, 15);
            expect(failures).toEqual([]);
        });
    }
});
