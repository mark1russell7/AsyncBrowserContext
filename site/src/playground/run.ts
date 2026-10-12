import { asyncGenerator, bindGenerator, coroutine, OverloadYield } from "async-browser-context/runtime";
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
    window.addEventListener("error", (event) => {
        if (event.error instanceof PlaygroundStop) event.preventDefault();
    });
}

type TimerId = number;

/**
 * The timer functions of one run. The code of the playground gets these
 * functions instead of the global functions (refer to `PLAYGROUND_TIMERS`).
 * They record each timer, and `clear()` stops the timers that remain after
 * the run. Thus an interval of the code does not continue after its run.
 */
export function createRunTimers() {
    const timers = new Set<TimerId>();
    return {
        globals : {
            setTimeout(handler : TimerHandler, timeout? : number, ...args : unknown[]) : TimerId {
                const id = window.setTimeout(handler, timeout, ...args);
                timers.add(id);
                return id;
            },
            setInterval(handler : TimerHandler, timeout? : number, ...args : unknown[]) : TimerId {
                const id = window.setInterval(handler, timeout, ...args);
                timers.add(id);
                return id;
            },
            clearTimeout(id? : TimerId) : void {
                if (id !== undefined) timers.delete(id);
                window.clearTimeout(id);
            },
            clearInterval(id? : TimerId) : void {
                if (id !== undefined) timers.delete(id);
                window.clearInterval(id);
            },
        },
        clear() : void {
            // In a browser, clearInterval also stops a timeout: the two types of timers use one list.
            for (const id of timers) window.clearInterval(id);
            timers.clear();
        },
    };
}

/**
 * This function starts the compiled code of the playground (refer to
 * `compilePlayground`) with the context implementation `mode`, and gives the
 * trace. Each run loads the module again, with a new trace object that stops
 * the code after the run.
 */
export function tracePlayground(code : string, mode : ContextMode) : Promise<Trace> {
    let stop = () : void => undefined;
    const timers = createRunTimers();
    const trace = traceCode(async () => {
        const guard = createGuardedTrace(STEP_LIMIT);
        stop = guard.stop;
        (globalThis as unknown as Record<string, unknown>)[PLAYGROUND_GLOBAL] = {
            AsyncLocalStorage, AsyncContext, Variable, Snapshot,
            log, sleep, fetchUser, save, untransformedLoad,
            ...timers.globals,
            __trace : guard.trace,
            coroutine, bindGenerator, asyncGenerator, OverloadYield,
        };
        const url = URL.createObjectURL(new Blob([code], { type : "text/javascript" }));
        try {
            return await import(/* @vite-ignore */ url) as { default : () => Promise<void> };
        } finally {
            URL.revokeObjectURL(url);
        }
    }, mode);
    return trace.finally(() => {
        stop();
        timers.clear();
    });
}
