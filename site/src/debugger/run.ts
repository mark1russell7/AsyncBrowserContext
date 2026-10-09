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

/** This function starts `scenario` with the tracer and the mode of a new session, and gives the trace. */
async function startTraced(scenario : () => Promise<void>, mode : ContextMode) : Promise<Trace> {
    const tracer = new Tracer();
    setSession({ tracer, mode });
    try {
        let timer : ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`The code did not end in ${TIMEOUT_MS} ms.`)), TIMEOUT_MS);
        });
        try {
            await Promise.race([scenario(), timeout]);
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
 * This function puts `job` in the queue of traced runs. Only one run operates
 * at a time, because the traced library records into one tracer.
 */
export function enqueueTraced<T>(job : () => Promise<T>) : Promise<T> {
    const result = queue.then(job);
    queue = result.catch(() => undefined);
    return result;
}

/** This function starts the code of `load` in a traced run, and gives the trace. */
export function traceCode(load : () => Promise<{ default : () => Promise<void> }>, mode : ContextMode) : Promise<Trace> {
    return enqueueTraced(async () => {
        const module = await load();
        return startTraced(module.default, mode);
    });
}

/**
 * This function starts `scenario` with the context implementation `mode` and
 * gives the trace. The function keeps each trace, because a scenario gives
 * the same steps each time.
 */
export function traceScenario(scenario : DebuggerScenario, mode : ContextMode = "library") : Promise<Trace> {
    const key = `${scenario.id}:${mode}`;
    let trace = cache.get(key);
    if (trace === undefined) {
        trace = traceCode(() => scenario.load(), mode);
        cache.set(key, trace);
    }
    return trace;
}

export function scenarioById(id : string) : DebuggerScenario {
    return scenarios.find(scenario => scenario.id === id) ?? scenarios[0]!;
}
