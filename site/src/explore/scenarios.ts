import { ROOT, type ContextVariable } from "./implementations";
import type { RecordRead } from "./recorder";
import { loadWithCallback } from "./untransformed-dependency";

/**
 * One scenario of the context timeline. The `start` function is real code.
 * The Vite plugin of the library transforms it, so the scenario uses the real
 * runtime. The `code` text shows the same code in a short form.
 */
export type Scenario = {
    id : string;
    title : string;
    /** The context rule that the scenario shows, for example "C3". */
    rule : string;
    /** Two or three sentences that tell what the scenario does and what to look for. */
    summary : string;
    /** The lanes of the timeline, in order: one lane for each task. */
    lanes : readonly string[];
    code : string;
    start(variable : ContextVariable, record : RecordRead) : Promise<void>;
};

function add(first : number, second : number) : number {
    return first + second;
}

function delay(ms : number) : Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const awaitInExpression : Scenario = {
    id : "await-in-expression",
    title : "await in an expression",
    rule : "C3",
    summary : "Task B starts first, so it continues before task A after each microtask. Task A reads the variable in the same expression as an await, in call arguments and in an if block. A runtime that sets the context only at the start of the next statement gives B to these reads.",
    lanes : ["A", "B"],
    code : [
        "const taskB = variable.run(\"B\", async () => {",
        "    for (let step = 1; step <= 3; step++) {",
        "        await null;",
        "        record(\"B\");",
        "    }",
        "});",
        "const taskA = variable.run(\"A\", async () => {",
        "    const row = { first : await null, id : record(\"A\") };",
        "    const sum = add(await Promise.resolve(1), record(\"A\").length);",
        "    if (await true) record(\"A\");",
        "});",
        "await Promise.all([taskA, taskB]);",
    ].join("\n"),
    async start(variable, record) {
        const taskB = variable.run("B", async () => {
            for (let step = 1; step <= 3; step++) {
                await null;
                record("B", `After await number ${step}`, "B");
            }
        });
        const taskA = variable.run("A", async () => {
            const row = { first : await null, id : record("A", "In an object literal, after await", "A") };
            const sum = add(await Promise.resolve(1), record("A", "In the arguments of a function, after await", "A").length);
            if (await true) record("A", "In an if block, after await", "A");
            return [row, sum];
        });
        await Promise.all([taskA, taskB]);
    },
};

const sharedPromise : Scenario = {
    id : "shared-promise",
    title : "A cached promise",
    rule : "C4",
    summary : "Request A makes the promise and puts it in a cache. Request B and the root context get the same promise from the cache. Each then callback must get the context of its own then() use, not the context of request A.",
    lanes : ["A", "B", ROOT],
    code : [
        "const loadConfig = () => cache.get(\"config\") ?? cache.set(\"config\", fetchConfig()).get(\"config\");",
        "await Promise.all([",
        "    variable.run(\"A\", () => loadConfig().then(() => record(\"A\"))),",
        "    variable.run(\"B\", () => loadConfig().then(() => record(\"B\"))),",
        "    loadConfig().then(() => record(ROOT)),",
        "]);",
    ].join("\n"),
    async start(variable, record) {
        const cache = new Map<string, Promise<string>>();
        const loadConfig = () : Promise<string> => {
            let cached = cache.get("config");
            if (cached === undefined) {
                cached = delay(5).then(() => "config");
                cache.set("config", cached);
            }
            return cached;
        };
        await Promise.all([
            variable.run("A", () => loadConfig().then(() => record("A", "then callback of request A", "A"))),
            variable.run("B", () => loadConfig().then(() => record("B", "then callback of request B", "B"))),
            loadConfig().then(() => record(ROOT, "then callback in the root context", ROOT)),
        ]);
    },
};

const timers : Scenario = {
    id : "timers",
    title : "Timers and microtasks",
    rule : "C6",
    summary : "Three contexts schedule callbacks at the same time: a timer, an interval with three ticks and a microtask. Each callback must get the context of the code that scheduled it.",
    lanes : ["A", "B", "C"],
    code : [
        "variable.run(\"A\", () => setTimeout(() => record(\"A\"), 10));",
        "variable.run(\"B\", () => setInterval(() => record(\"B\"), 3)); // three ticks",
        "variable.run(\"C\", () => queueMicrotask(() => record(\"C\")));",
    ].join("\n"),
    async start(variable, record) {
        await Promise.all([
            variable.run("A", () => new Promise<void>((resolve) => {
                setTimeout(() => {
                    record("A", "setTimeout callback, 10 ms", "A");
                    resolve();
                }, 10);
            })),
            variable.run("B", () => new Promise<void>((resolve) => {
                let ticks = 0;
                const id = setInterval(() => {
                    ticks++;
                    record("B", `setInterval tick ${ticks}`, "B");
                    if (ticks === 3) {
                        clearInterval(id);
                        resolve();
                    }
                }, 3);
            })),
            variable.run("C", () => new Promise<void>((resolve) => {
                queueMicrotask(() => {
                    record("C", "queueMicrotask callback", "C");
                    resolve();
                });
            })),
        ]);
    },
};

const clickEvent : Scenario = {
    id : "click-event",
    title : "A click event",
    rule : "C13",
    summary : "Request A adds a listener and request B sets onclick. Then a timer in the root context dispatches a click, and code in context C dispatches a click. A dispatch from the root context gives the registration context. A dispatch from context C gives C.",
    lanes : ["listener of A", "onclick of B"],
    code : [
        "variable.run(\"A\", () => button.addEventListener(\"click\", () => record()));",
        "variable.run(\"B\", () => { button.onclick = () => record(); });",
        "setTimeout(() => button.click(), 0);          // dispatch in the root context",
        "variable.run(\"C\", () => button.click());      // dispatch in context C",
    ].join("\n"),
    async start(variable, record) {
        const button = document.createElement("button");
        let source = "";
        let expected = (registered : string) : string => registered;
        variable.run("A", () => {
            button.addEventListener("click", () => {
                record("listener of A", `Click dispatched ${source}`, expected("A"));
            });
        });
        variable.run("B", () => {
            button.onclick = () => {
                record("onclick of B", `Click dispatched ${source}`, expected("B"));
            };
        });
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                source = "in the root context";
                expected = (registered) => registered;
                button.click();
                resolve();
            }, 0);
        });
        variable.run("C", () => {
            source = "in context C";
            expected = () => "C";
            button.click();
        });
    },
};

let recordInGenerator : RecordRead | undefined;

/** The generator of the generator scenario. The preset binds it to the context of its creation. */
function* pages() : Generator<string> {
    yield recordInGenerator?.("generator body", "Body, at the first next()", "A") ?? "";
    yield recordInGenerator?.("generator body", "Body, at the second next()", "A") ?? "";
}

const generator : Scenario = {
    id : "generator",
    title : "A generator",
    rule : "C5",
    summary : "Context A makes the generator. Context B and context C each start one step of it. The body of the generator must get context A, and the code after next() must get the context of its caller.",
    lanes : ["generator body", "B", "C"],
    code : [
        "function* pages() {",
        "    yield record(\"A\");",
        "    yield record(\"A\");",
        "}",
        "const iterator = variable.run(\"A\", () => pages());",
        "variable.run(\"B\", () => { iterator.next(); record(\"B\"); });",
        "variable.run(\"C\", () => { iterator.next(); record(\"C\"); });",
    ].join("\n"),
    async start(variable, record) {
        recordInGenerator = record;
        try {
            const iterator = variable.run("A", () => pages());
            variable.run("B", () => {
                iterator.next();
                record("B", "After next(), in B", "B");
            });
            await null;
            variable.run("C", () => {
                iterator.next();
                record("C", "After next(), in C", "C");
            });
        } finally {
            recordInGenerator = undefined;
        }
    },
};

const untransformedDependency : Scenario = {
    id : "untransformed-dependency",
    title : "A dependency that the plugin does not transform",
    rule : "C7",
    summary : "Request A gives a callback to a dependency with a native await. Request B continues between the steps of the dependency. The library cannot know the context after a native await, so the callback gets the root context. It does not get the context of request B.",
    lanes : ["A", "B"],
    code : [
        "// untransformed-dependency.ts: the plugin does not transform this file",
        "export async function loadWithCallback(callback) {",
        "    await null;",
        "    await null;",
        "    return callback();",
        "}",
        "",
        "const taskA = variable.run(\"A\", () => loadWithCallback(() => record(\"A\")));",
        "const taskB = variable.run(\"B\", async () => {",
        "    await null;",
        "    record(\"B\");",
        "    await null;",
        "    record(\"B\");",
        "});",
    ].join("\n"),
    async start(variable, record) {
        const taskA = variable.run("A", () => loadWithCallback(() => record("A", "Callback in the dependency, after a native await", "A")));
        const taskB = variable.run("B", async () => {
            await null;
            record("B", "After await number 1", "B");
            await null;
            record("B", "After await number 2", "B");
        });
        await Promise.all([taskA, taskB]);
    },
};

/** The scenarios of the context timeline, in the order of the picker. */
export const SCENARIOS : readonly Scenario[] = [
    awaitInExpression,
    sharedPromise,
    timers,
    clickEvent,
    generator,
    untransformedDependency,
];

export function scenarioById(id : string) : Scenario {
    return SCENARIOS.find(scenario => scenario.id === id) ?? awaitInExpression;
}
