import { describe, expect, it } from "vitest";
import { keptGlobalImplementation, libraryImplementation, restoredGlobalImplementation } from "./implementations";
import { summarize } from "./recorder";
import { startScenario } from "./run-scenario";
import { SCENARIOS, scenarioById } from "./scenarios";

describe("context timeline scenarios", () => {
    it.each(SCENARIOS.filter(scenario => scenario.id !== "untransformed-dependency").map(scenario => [scenario.id, scenario] as const))(
        "gives the expected context to each read of %s with the library",
        async (_id, scenario) => {
            const run = await startScenario(scenario, libraryImplementation);
            expect(run.reads.length).toBeGreaterThan(0);
            expect(run.reads.filter(read => read.status !== "correct")).toEqual([]);
        },
    );

    it("gives the root context, and not the context of B, to the callback in the untransformed dependency", async () => {
        const run = await startScenario(scenarioById("untransformed-dependency"), libraryImplementation);
        const callback = run.reads.find(read => read.task === "A");
        expect(callback?.status).toBe("lost");
        expect(run.reads.filter(read => read.status === "wrong")).toEqual([]);
    });

    it("shows wrong contexts with a global variable that run() does not set back", async () => {
        const run = await startScenario(scenarioById("await-in-expression"), keptGlobalImplementation);
        expect(summarize(run.reads).wrong).toBeGreaterThan(0);
    });

    it("shows lost contexts with a global variable that run() sets back", async () => {
        const run = await startScenario(scenarioById("await-in-expression"), restoredGlobalImplementation);
        expect(summarize(run.reads).lost).toBe(run.reads.length);
    });

    it("records the reads in the order in which they occur", async () => {
        const run = await startScenario(scenarioById("await-in-expression"), libraryImplementation);
        expect(run.reads.map(read => read.order)).toEqual(run.reads.map((_, index) => index + 1));
        // Task B continues first after each await, so the first read is a read of B
        expect(run.reads[0]?.task).toBe("B");
    });
});
