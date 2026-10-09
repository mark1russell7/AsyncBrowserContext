import { describe, expect, it } from "vitest";
import { scenarioById, scenarios, traceScenario } from "./run";

const texts = async (id : string, mode? : "global-kept" | "global-restored") : Promise<string[]> =>
    (await traceScenario(scenarioById(id), mode)).logs.map(log => log.text);

describe("the scenarios of the context debugger", () => {
    it("end without an error and record steps", async () => {
        for (const scenario of scenarios) {
            const trace = await traceScenario(scenario);
            expect(trace.error, scenario.id).toBeUndefined();
            expect(trace.steps.length, scenario.id).toBeGreaterThan(3);
        }
    });

    it("give each request its own ID with the library, and the ID of the other request with a global variable", async () => {
        expect(await texts("two-requests")).toEqual([
            "[r-1] load ada",
            "[r-2] load grace",
            "[r-2] hello, Grace",
            "[r-2] saved Grace",
            "[r-1] hello, Ada",
            "[r-1] saved Ada",
        ]);
        expect(await texts("two-requests", "global-kept")).toContain("[r-2] hello, Ada");
        expect(await texts("two-requests", "global-restored")).toContain("[undefined] hello, Ada");
    });

    it("record the search of a read from the current frame up to the frame with the value", async () => {
        const trace = await traceScenario(scenarioById("nested"));
        const lookups = trace.steps.flatMap(step => step.lookups);
        expect(lookups).toContainEqual({ variable : "requestId", value : "\"r-1\"", holderId : "F1", path : ["F2", "F1"] });
        expect(lookups).toContainEqual({ variable : "requestId", value : "undefined", holderId : undefined, path : ["root"] });
        expect(await texts("nested")).toEqual(["outer: r-1 u-7", "inner: r-1a u-7", "outer again: r-1", "after run(): undefined"]);
    });

    it("give a callback the context of its registration, and a listener the context of the dispatch (rule C13)", async () => {
        expect(await texts("timers-and-events")).toEqual(["click: r-2", "click: r-1", "microtask: r-1", "timer: r-1"]);
    });

    it("keep the context of a generator and of a snapshot", async () => {
        expect(await texts("generators")).toEqual(["first step in r-1", "second step in r-1"]);
        expect(await texts("snapshot")).toEqual(["now: r-2", "in the snapshot: r-1"]);
    });

    it("give the root frame to code without the transform after a native await (rule C7)", async () => {
        expect(await texts("untransformed")).toEqual(["in the dependency: undefined", "after the await: r-1"]);
    });
});
