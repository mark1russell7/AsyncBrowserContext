import type { ContextImplementation } from "./implementations";
import { createRecorder, type Read } from "./recorder";
import type { Scenario } from "./scenarios";

/** The reads of one scenario with one implementation. */
export type ScenarioRun = {
    scenario : Scenario;
    implementation : ContextImplementation;
    reads : readonly Read[];
};

/** This function starts `scenario` with a new variable of `implementation`, and gives the reads when the scenario ends. */
export async function startScenario(scenario : Scenario, implementation : ContextImplementation) : Promise<ScenarioRun> {
    const variable = implementation.createVariable("requestId");
    const recorder = createRecorder(variable);
    await scenario.start(variable, recorder.record);
    return { scenario, implementation, reads : [...recorder.reads()] };
}
