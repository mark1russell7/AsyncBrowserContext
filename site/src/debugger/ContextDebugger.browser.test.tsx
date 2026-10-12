import "../styles/global.css";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextDebugger, type DebuggerSource } from "./ContextDebugger";
import { setSession, sleep } from "./instrumented";
import { scenarioById, traceScenario, type DebuggerScenario } from "./run";
import { Tracer } from "./trace";

let container : HTMLDivElement;
let root : Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
});

function render(source? : DebuggerSource) : void {
    flushSync(() => root.render(<MemoryRouter>{source === undefined ? <ContextDebugger /> : <ContextDebugger source={source} />}</MemoryRouter>));
}

const liveRegions = () : HTMLElement[] => [...container.querySelectorAll<HTMLElement>("[aria-live]:not([aria-live='off'])")];

async function waitForSteps() : Promise<void> {
    await vi.waitFor(() => {
        if (!container.textContent?.includes("Step 1 of")) throw new Error("No steps yet");
    }, { timeout : 15_000, interval : 50 });
}

describe("the context debugger", () => {
    it("has one live region, and it tells a step only after the reader moves to it", async () => {
        render();
        await waitForSteps();
        const regions = liveRegions();
        expect(regions).toHaveLength(1);
        expect(regions[0]?.textContent).toBe("");
        flushSync(() => container.querySelector<HTMLButtonElement>("button[aria-label='Next step']")?.click());
        expect(regions[0]?.textContent).toMatch(/^Step 2 of \d+\. Line \d+/);
        flushSync(() => container.querySelector<HTMLButtonElement>("button[aria-label='Play the steps']")?.click());
        expect(regions[0]?.textContent).toBe("");
    });

    it("leaves the arrow keys to a select in the debugger", async () => {
        render();
        await waitForSteps();
        const select = [...container.querySelectorAll("select")].find(candidate => candidate.closest("label")?.textContent?.includes("Speed"));
        if (!select) throw new Error("No speed select");
        flushSync(() => select.dispatchEvent(new KeyboardEvent("keydown", { key : "ArrowRight", bubbles : true })));
        expect(container.textContent).toContain("Step 1 of");
        const stage = container.querySelector<HTMLElement>("[role='group'][tabindex='0']");
        flushSync(() => stage?.dispatchEvent(new KeyboardEvent("keydown", { key : "ArrowRight", bubbles : true })));
        expect(container.textContent).toContain("Step 2 of");
    });

    it("shows an error with a button that starts the trace again", async () => {
        const scenario = scenarioById("nested");
        let calls = 0;
        const source : DebuggerSource = {
            id : "failing-source",
            title : "failing.js",
            lines : scenario.lines,
            trace(mode) {
                calls++;
                return calls === 1 ? Promise.reject(new Error("The chunk did not load.")) : traceScenario(scenario, mode);
            },
        };
        render(source);
        await vi.waitFor(() => {
            if (!container.querySelector("[role='alert']")?.textContent?.includes("The chunk did not load.")) throw new Error("No error yet");
        });
        expect(container.querySelector("[data-loading]")).toBeNull();
        const retry = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Try again");
        retry?.click();
        await waitForSteps();
        expect(calls).toBe(2);
    });
});

describe("the runs of the debugger", () => {
    it("do not keep a trace that did not load, so a second request tries again", async () => {
        const scenario = scenarioById("nested");
        let loads = 0;
        const flaky : DebuggerScenario = {
            ...scenario,
            id : "flaky-scenario",
            load() {
                loads++;
                return loads === 1 ? Promise.reject(new Error("The chunk did not load.")) : scenario.load();
            },
        };
        await expect(traceScenario(flaky)).rejects.toThrow("The chunk did not load.");
        await new Promise(resolve => setTimeout(resolve, 0));
        const trace = await traceScenario(flaky);
        expect(trace.error).toBeUndefined();
        expect(loads).toBe(2);
    });

    it("do not continue a sleeper of an earlier session in a new session", async () => {
        let continued = false;
        setSession({ tracer : new Tracer(), mode : "library" });
        void sleep(1000).then(() => { continued = true; });
        setSession({ tracer : new Tracer(), mode : "library" });
        await sleep(5);
        await new Promise(resolve => setTimeout(resolve, 50));
        setSession(undefined);
        expect(continued).toBe(false);
    });
});
