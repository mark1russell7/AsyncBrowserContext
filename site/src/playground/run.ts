import { bindGenerator, coroutine } from "async-browser-context/runtime";
import {
    AsyncContext,
    AsyncLocalStorage,
    createGuardedTrace,
    fetchUser,
    log,
    PlaygroundStop,
    save,
    sleep,
    Snapshot,
    untransformedLoad,
    Variable,
    type ContextMode,
} from "../debugger/instrumented";
import { traceCode } from "../debugger/run";
import type { Trace } from "../debugger/trace";
import { PLAYGROUND_GLOBAL } from "./compile";

/** The most steps that one run of the playground can make. */
const STEP_LIMIT = 4000;

// The playground stops code after its run. The stop is an error, but not a problem of the page.
if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
        if (event.reason instanceof PlaygroundStop) event.preventDefault();
    });
}

/**
 * This function starts the compiled code of the playground (refer to
 * `compilePlayground`) with the context implementation `mode`, and gives the
 * trace. Each run loads the module again, with a new trace object that stops
 * the code after the run.
 */
export function tracePlayground(code : string, mode : ContextMode) : Promise<Trace> {
    let stop = () : void => undefined;
    const trace = traceCode(async () => {
        const guard = createGuardedTrace(STEP_LIMIT);
        stop = guard.stop;
        (globalThis as unknown as Record<string, unknown>)[PLAYGROUND_GLOBAL] = {
            AsyncLocalStorage, AsyncContext, Variable, Snapshot,
            log, sleep, fetchUser, save, untransformedLoad,
            __trace : guard.trace,
            coroutine, bindGenerator,
        };
        const url = URL.createObjectURL(new Blob([code], { type : "text/javascript" }));
        try {
            return await import(/* @vite-ignore */ url) as { default : () => Promise<void> };
        } finally {
            URL.revokeObjectURL(url);
        }
    }, mode);
    return trace.finally(() => stop());
}
