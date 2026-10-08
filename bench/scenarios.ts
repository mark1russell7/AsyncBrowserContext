/**
 * The benchmark scenarios. The runner compiles this file three times: as
 * plain JavaScript, with the Babel preset and the browser runtime, and with
 * the Babel preset and the plain coroutine of the Node.js runtime. The
 * scenarios get a `Variable` class from the runner: a class without
 * propagation for plain JavaScript, or the class of the library.
 */

/** The part of the `Variable` API that the scenarios use. */
export interface VariableLike<T> {
    get() : T | undefined;
    run<R>(value : T, fn : () => R) : R;
}

export type VariableConstructor = new <T>() => VariableLike<T>;

export interface Scenario {
    readonly name : string;
    readonly description : string;
    readonly run : () => Promise<unknown>;
}

async function leaf(value : number) : Promise<number> {
    const result = await value;
    return result + 1;
}

/** A request handler: three awaited calls that read the context, as a small service does. */
async function handleRequest(variable : VariableLike<string>, id : number) : Promise<string> {
    const user = await Promise.resolve({ id });
    const rows = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);
    const log = `${variable.get() ?? "none"}:${user.id}:${rows.length}`;
    await null;
    return log;
}

export function createScenarios(Variable : VariableConstructor) : Scenario[] {
    const variable = new Variable<string>();
    return [
        {
            name : "await loop",
            description : "10,000 awaits in one async function",
            run : async () => {
                let sum = 0;
                for (let index = 0; index < 10_000; index++) {
                    sum += await index;
                }
                return sum;
            },
        },
        {
            name : "async calls",
            description : "10,000 calls of an async function with one await",
            run : async () => {
                let value = 0;
                for (let index = 0; index < 10_000; index++) {
                    value = await leaf(value);
                }
                return value;
            },
        },
        {
            name : "then chain",
            description : "A chain of 10,000 then calls",
            run : () => {
                let promise = Promise.resolve(0);
                for (let index = 0; index < 10_000; index++) {
                    promise = promise.then((value) => value + 1);
                }
                return promise;
            },
        },
        {
            name : "concurrent tasks",
            description : "1,000 tasks with 10 awaits each, in a context",
            run : () => variable.run("tasks", () => Promise.all(Array.from({ length : 1_000 }, async () => {
                for (let step = 0; step < 10; step++) {
                    await null;
                }
            }))),
        },
        {
            name : "request handlers",
            description : "1,000 request handlers in 1,000 contexts",
            run : () => Promise.all(Array.from({ length : 1_000 }, (_, id) => variable.run(`request-${id}`, () => handleRequest(variable, id)))),
        },
        {
            name : "get in nested contexts",
            description : "100,000 reads of a value 5 contexts deep",
            run : async () => {
                const other = new Variable<number>();
                return variable.run("outer", () => other.run(1, () => other.run(2, () => other.run(3, () => other.run(4, () => {
                    let length = 0;
                    for (let index = 0; index < 100_000; index++) {
                        length += variable.get()?.length ?? 0;
                    }
                    return length;
                })))));
            },
        },
    ];
}
