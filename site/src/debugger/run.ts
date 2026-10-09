import scenarios, { type DebuggerScenario } from "virtual:debugger-scenarios";
import { setSession, type ContextMode } from "./instrumented";
import { Tracer, type Trace } from "./trace";

export type { DebuggerScenario };
export { scenarios };

/** The longest time that a scenario can operate. */
const TIMEOUT_MS = 5000;
/** The time after the scenario, for timers that the scenario did not wait for. */
const SETTLE_MS = 40;

let queue : Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<Trace>>();

async function startTraced(scenario : DebuggerScenario, mode : ContextMode) : Promise<Trace> {
    const module = await scenario.load();
    const tracer = new Tracer();
    setSession({ tracer, mode });
    try {
        let timer : ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`The scenario did not end in ${TIMEOUT_MS} ms.`)), TIMEOUT_MS);
        });
        try {
            await Promise.race([module.default(), timeout]);
        } finally {
            clearTimeout(timer);
        }
        await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
    } catch (error) {
        tracer.fail(error);
    } finally {
        setSession(undefined);
    }
    return tracer.result();
}

/**
 * This function starts `scenario` with the context implementation `mode` and
 * gives the trace. Only one scenario operates at a time, because the traced
 * library records into one tracer. The function keeps each trace, because a
 * scenario gives the same steps each time.
 */
export function traceScenario(scenario : DebuggerScenario, mode : ContextMode = "library") : Promise<Trace> {
    const key = `${scenario.id}:${mode}`;
    let trace = cache.get(key);
    if (trace === undefined) {
        trace = queue.then(() => startTraced(scenario, mode));
        queue = trace.catch(() => undefined);
        cache.set(key, trace);
    }
    return trace;
}

export function scenarioById(id : string) : DebuggerScenario {
    return scenarios.find(scenario => scenario.id === id) ?? scenarios[0]!;
}
