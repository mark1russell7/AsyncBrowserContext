import { describe, expect, it } from "vitest";
import { Variable } from "async-browser-context";
import { busyOther, delay } from "../helpers.js";

describe("legacy 04: deep nesting", () => {
    it("keeps the context at each of three nested levels, before and after an await", async () => {
        const variable = new Variable<string>();
        const path : (string | undefined)[] = [];
        await variable.run("L1", async () => {
            path.push(variable.get());
            await variable.run("L2", async () => {
                path.push(variable.get());
                await variable.run("L3", async () => {
                    path.push(variable.get());
                    await delay(5);
                    path.push(variable.get());
                });
                path.push(variable.get());
            });
            path.push(variable.get());
        });
        expect(path).toEqual(["L1", "L2", "L3", "L3", "L2", "L1"]);
    });

    it("keeps the context at each of ten recursive levels", async () => {
        const variable = new Variable<string>();
        const path : string[] = [];
        const nest = async (level : number) : Promise<void> => {
            if (level > 10) {
                return;
            }
            await variable.run(`L${level}`, async () => {
                await delay(1);
                path.push(`in ${variable.get() ?? "none"}`);
                await nest(level + 1);
                path.push(`out ${variable.get() ?? "none"}`);
            });
        };
        await nest(1);
        const levels = Array.from({ length : 10 }, (_, index) => index + 1);
        expect(path).toEqual([...levels.map((level) => `in L${level}`), ...levels.reverse().map((level) => `out L${level}`)]);
    });

    it("keeps the contexts in the pattern run(), then(), run()", async () => {
        const variable = new Variable<string>();
        const sequence : (string | undefined)[] = [];
        await variable.run("outer", async () => {
            sequence.push(variable.get());
            await Promise.resolve().then(async () => {
                sequence.push(variable.get());
                await variable.run("inner", async () => {
                    sequence.push(variable.get());
                    await delay(5);
                    sequence.push(variable.get());
                });
                sequence.push(variable.get());
            });
            sequence.push(variable.get());
        });
        expect(sequence).toEqual(["outer", "outer", "inner", "inner", "outer", "outer"]);
    });

    it("keeps the contexts in the pattern run(), async function, run()", async () => {
        const variable = new Variable<string>();
        const sequence : (string | undefined)[] = [];
        await variable.run("level-1", async () => {
            const step = async () : Promise<void> => {
                sequence.push(variable.get());
                await delay(5);
                sequence.push(variable.get());
                await variable.run("level-2", async () => {
                    sequence.push(variable.get());
                    await delay(5);
                    sequence.push(variable.get());
                });
                sequence.push(variable.get());
            };
            await step();
            sequence.push(variable.get());
        });
        expect(sequence).toEqual(["level-1", "level-1", "level-2", "level-2", "level-1", "level-1"]);
    });

    it("keeps the contexts in the pattern then(), run(), then()", async () => {
        const variable = new Variable<string>();
        const sequence : (string | undefined)[] = [];
        const result = await variable.run("root", () => Promise.resolve("start")
            .then(async (value) => {
                sequence.push(variable.get());
                await variable.run("nested", async () => {
                    sequence.push(variable.get());
                    await delay(5);
                    sequence.push(variable.get());
                });
                sequence.push(variable.get());
                return `${value}-middle`;
            })
            .then(async (value) => {
                sequence.push(variable.get());
                await delay(5);
                sequence.push(variable.get());
                return `${value}-end`;
            }));
        expect(result).toBe("start-middle-end");
        expect(sequence).toEqual(["root", "nested", "nested", "root", "root", "root"]);
    });

    it("keeps the contexts of two branches that mix then() and run()", async () => {
        const variable = new Variable<string>();
        const sequence : (string | undefined)[] = [];
        await variable.run("root", async () => {
            await Promise.resolve().then(async () => {
                await variable.run("branch-1", async () => {
                    sequence.push(variable.get());
                    await variable.run("branch-1-nested", async () => {
                        sequence.push(variable.get());
                    });
                    sequence.push(variable.get());
                });
            });
            await variable.run("branch-2", async () => {
                sequence.push(variable.get());
                await Promise.resolve().then(async () => {
                    sequence.push(variable.get());
                    await variable.run("branch-2-nested", async () => {
                        sequence.push(variable.get());
                    });
                    sequence.push(variable.get());
                });
            });
            sequence.push(variable.get());
        });
        expect(sequence).toEqual(["branch-1", "branch-1-nested", "branch-1", "branch-2", "branch-2", "branch-2-nested", "branch-2", "root"]);
    });

    it("keeps the contexts when synchronous and async runs alternate", async () => {
        const variable = new Variable<string>();
        const sequence : (string | undefined)[] = [];
        await variable.run("async-1", async () => {
            sequence.push(variable.get());
            sequence.push(variable.run("sync-1", () => variable.get()));
            await variable.run("async-2", async () => {
                sequence.push(variable.get());
                await delay(5);
                sequence.push(variable.run("sync-2", () => variable.get()));
                sequence.push(variable.get());
            });
            sequence.push(variable.get());
        });
        expect(sequence).toEqual(["async-1", "sync-1", "async-2", "sync-2", "async-2", "async-1"]);
    });

    it("keeps the contexts of a synchronous run() inside each of five nested async levels", async () => {
        const variable = new Variable<string>();
        const sequence : string[] = [];
        const nest = async (level : number) : Promise<void> => {
            if (level > 5) {
                return;
            }
            await variable.run(`async-${level}`, async () => {
                if (level < 5) {
                    await delay(2);
                }
                sequence.push(variable.run(`sync-${level}`, () => variable.get() ?? "none"));
                await nest(level + 1);
                sequence.push(variable.get() ?? "none");
            });
        };
        await nest(1);
        expect(sequence).toEqual(["sync-1", "sync-2", "sync-3", "sync-4", "sync-5", "async-5", "async-4", "async-3", "async-2", "async-1"]);
    });

    it("records each context of rapid synchronous and async transitions", async () => {
        const variable = new Variable<string>();
        const transitions : (string | undefined)[] = [];
        await variable.run("start", async () => {
            transitions.push(variable.get());
            for (let index = 0; index < 5; index++) {
                variable.run(`sync-${index}`, () => {
                    transitions.push(variable.get());
                });
                const other = busyOther(variable, "other");
                await variable.run(`async-${index}`, async () => {
                    transitions.push(variable.get());
                    await delay(1);
                    transitions.push(variable.get());
                });
                await other;
                transitions.push(variable.get());
            }
        });
        const expected : string[] = ["start"];
        for (let index = 0; index < 5; index++) {
            expected.push(`sync-${index}`, `async-${index}`, `async-${index}`, "start");
        }
        expect(transitions).toEqual(expected);
    });

    it("keeps the context at 100 nested levels with ten parallel tasks at each level", async () => {
        const variable = new Variable<string>();
        const wrong : string[] = [];
        const nest = async (level : number) : Promise<number> => {
            if (level >= 100) {
                return level;
            }
            return variable.run(`level-${level}`, async () => {
                await Promise.all(Array.from({ length : 10 }, async () => {
                    await null;
                    if (variable.get() !== `level-${level}`) {
                        wrong.push(`${level}: ${variable.get() ?? "none"}`);
                    }
                }));
                return nest(level + 1);
            });
        };
        expect(await nest(0)).toBe(100);
        expect(wrong).toEqual([]);
    });
});
