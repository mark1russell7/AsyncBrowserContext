import { AsyncContext as RealContext, AsyncLocalStorage as RealStorage } from "async-browser-context";
// The internal store of the library. The traced classes read the frame that run() makes.
import { store } from "../../../src/core/store";
import type { Tracer } from "./trace";

/**
 * The context implementation of one start of a scenario:
 * - "library": the real classes of the library.
 * - "global-restored": one global value. run() sets it, and sets the previous value again when fn ends.
 * - "global-kept": one global value. run() sets it and does not set it back.
 */
export type ContextMode = "library" | "global-restored" | "global-kept";

type Session = { tracer : Tracer; mode : ContextMode };
let session : Session | undefined;

/** This function sets the tracer and the mode of the next start of a scenario. */
export function setSession(next : Session | undefined) : void {
    session = next;
    clock.now = 0;
}

/**
 * A clock with virtual time for `sleep()`. The clock continues the sleeper with
 * the earliest time, one sleeper in each task. Thus each start of a scenario
 * gives the same order of steps, also when the computer is busy.
 */
const clock = { now : 0, count : 0, sleepers : [] as { at : number; order : number; resolve : () => void }[], scheduled : false };

function continueEarliest() : void {
    clock.scheduled = false;
    clock.sleepers.sort((a, b) => a.at - b.at || a.order - b.order);
    const next = clock.sleepers.shift();
    if (next === undefined) return;
    clock.now = next.at;
    next.resolve();
    if (clock.sleepers.length > 0) scheduleClock();
}

function scheduleClock() : void {
    if (clock.scheduled) return;
    clock.scheduled = true;
    setTimeout(continueEarliest, 0);
}

/** The trace object of the instrumented code. The build adds the calls (refer to `site/build/instrument.ts`). */
export const __trace = {
    at(line : number) : void {
        session?.tracer.at(line);
    },
    after<T>(value : T, line : number) : T {
        session?.tracer.after(line);
        return value;
    },
};

/** The operations of one variable, in one of the three modes. */
type Storage = {
    run<R>(value : unknown, fn : (...args : unknown[]) => R, args : unknown[]) : R;
    get() : unknown;
};

function isThenable(value : unknown) : value is PromiseLike<unknown> {
    return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then? : unknown }).then === "function";
}

function libraryStorage(name : string, defaultValue : unknown) : Storage {
    const real = new RealContext.Variable<unknown>({ name, defaultValue });
    const key = {};
    return {
        run(value, fn, args) {
            const tracer = session?.tracer;
            return real.run(value, () => {
                const frame = store.current;
                tracer?.enterFrame(frame, key, name, value);
                const end = () => tracer?.endFrame(frame);
                let result;
                try {
                    result = fn(...args);
                } catch (error) {
                    end();
                    throw error;
                }
                if (isThenable(result)) result.then(end, end);
                else end();
                return result;
            });
        },
        get() {
            const value = real.get();
            session?.tracer.lookup(key, name, value);
            return value;
        },
    };
}

function globalStorage(name : string, defaultValue : unknown, restore : boolean) : Storage {
    const key = {};
    let current = defaultValue;
    return {
        run(value, fn, args) {
            const previous = current;
            current = value;
            if (!restore) return fn(...args);
            try {
                return fn(...args);
            } finally {
                current = previous;
            }
        },
        get() {
            session?.tracer.lookup(key, name, current, true);
            return current;
        },
    };
}

let unnamed = 0;

function createStorage(name : string | undefined, defaultValue : unknown) : Storage {
    const label = name ?? `variable${++unnamed}`;
    switch (session?.mode ?? "library") {
        case "global-restored": return globalStorage(label, defaultValue, true);
        case "global-kept": return globalStorage(label, defaultValue, false);
        default: return libraryStorage(label, defaultValue);
    }
}

/** The `AsyncLocalStorage` class that the scenarios use. It records each run() and each getStore(). */
export class AsyncLocalStorage<T> {
    readonly #storage : Storage;

    constructor(options? : { name? : string; defaultValue? : T }) {
        this.#storage = createStorage(options?.name, options?.defaultValue);
    }

    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        return this.#storage.run(value, fn as (...args : unknown[]) => R, args);
    }

    getStore() : T | undefined {
        return this.#storage.get() as T | undefined;
    }

    static bind<F extends (...args : never[]) => unknown>(fn : F) : F {
        return RealStorage.bind(fn) as unknown as F;
    }

    static snapshot() : <R, A extends unknown[]>(fn : (...args : A) => R, ...args : A) => R {
        return RealStorage.snapshot();
    }
}

/** The `AsyncContext.Variable` class that the scenarios use. It records each run() and each get(). */
class Variable<T> {
    readonly #storage : Storage;
    readonly name : string;

    constructor(options? : { name? : string; defaultValue? : T }) {
        this.name = options?.name ?? "";
        this.#storage = createStorage(options?.name, options?.defaultValue);
    }

    run<R, A extends unknown[]>(value : T, fn : (...args : A) => R, ...args : A) : R {
        return this.#storage.run(value, fn as (...args : unknown[]) => R, args);
    }

    get() : T | undefined {
        return this.#storage.get() as T | undefined;
    }
}

export const AsyncContext = Object.freeze({ Variable, Snapshot : RealContext.Snapshot });
export { Variable };
export const Snapshot = RealContext.Snapshot;

/** The scenario writes a line to the console of the debugger. */
export function log(...parts : unknown[]) : void {
    session?.tracer.log(parts.map(part => typeof part === "string" ? part : String(part)).join(" "));
}

/** A promise that settles after `ms` milliseconds of the virtual clock. */
export function sleep(ms : number) : Promise<void> {
    return new Promise((resolve) => {
        clock.sleepers.push({ at : clock.now + ms, order : clock.count++, resolve });
        scheduleClock();
    });
}

const USERS : Readonly<Record<string, { name : string; delay : number }>> = {
    ada : { name : "Ada", delay : 30 },
    grace : { name : "Grace", delay : 12 },
    alan : { name : "Alan", delay : 20 },
    edsger : { name : "Edsger", delay : 8 },
};

/** A request to a server that does not exist. It gives the name of the user after a short time. Each user has a different time. */
export async function fetchUser(id : string) : Promise<string> {
    const user = USERS[id];
    await sleep(user?.delay ?? 15);
    return user?.name ?? id;
}

/** A write to a server that does not exist. */
export async function save(_value : unknown) : Promise<void> {
    await sleep(10);
}

/** A function of a module that the Vite plugin does not transform. Its native await loses the context. */
export { loadWithCallback as untransformedLoad } from "../explore/untransformed-dependency";
