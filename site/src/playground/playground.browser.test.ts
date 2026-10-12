import { describe, expect, it } from "vitest";
import { compilePlayground } from "./compile";
import { PlaygroundStop } from "../debugger/instrumented";
import { tracePlayground } from "./run";

const TWO_REQUESTS = [
    "import { AsyncLocalStorage } from \"async-browser-context\";",
    "const requestId = new AsyncLocalStorage();",
    "async function handle(id, user) {",
    "    await requestId.run(id, async () => {",
    "        const name = await fetchUser(user);",
    "        log(requestId.getStore(), name);",
    "    });",
    "}",
    "await Promise.all([handle(\"r-1\", \"ada\"), handle(\"r-2\", \"grace\")]);",
].join("\n");

describe("the playground", () => {
    it("compiles the code in the browser and starts it with the library", async () => {
        const trace = await tracePlayground(compilePlayground(TWO_REQUESTS), "library");
        expect(trace.error).toBeUndefined();
        expect(trace.logs.map(log => log.text)).toEqual(["r-2 Grace", "r-1 Ada"]);
        expect(trace.frames.map(frame => frame.value)).toContain("\"r-1\"");
    });

    it("starts the same code with a global variable", async () => {
        const trace = await tracePlayground(compilePlayground(TWO_REQUESTS), "global-kept");
        expect(trace.logs.map(log => log.text)).toEqual(["r-2 Grace", "r-2 Ada"]);
    });

    it("stops a loop without an end", async () => {
        const trace = await tracePlayground(compilePlayground("let turns = 0;\nwhile (true) {}\n"), "library");
        expect(trace.error).toMatch(/more than 4000 steps/);
    });

    it("gives the error of the code in the trace", async () => {
        const trace = await tracePlayground(compilePlayground("throw new Error(\"no\");\n"), "library");
        expect(trace.error).toBe("no");
    });

    it("starts an async generator with the runtime of the library", async () => {
        const code = [
            "import { AsyncLocalStorage } from \"async-browser-context\";",
            "const requestId = new AsyncLocalStorage();",
            "async function* ticks() {",
            "    await sleep(1);",
            "    yield requestId.getStore();",
            "    await sleep(1);",
            "    yield requestId.getStore();",
            "}",
            "await requestId.run(\"r-1\", async () => {",
            "    for await (const tick of ticks()) log(tick);",
            "});",
        ].join("\n");
        const trace = await tracePlayground(compilePlayground(code), "library");
        expect(trace.error).toBeUndefined();
        expect(trace.logs.map(log => log.text)).toEqual(["r-1", "r-1"]);
    });

    it("gives the context to a timer callback, and stops the timers of the code after the run", async () => {
        const stops : unknown[] = [];
        const onError = (event : ErrorEvent) : void => {
            if (event.error instanceof PlaygroundStop) stops.push(event.error);
        };
        window.addEventListener("error", onError);
        try {
            const code = [
                "import { AsyncLocalStorage } from \"async-browser-context\";",
                "const requestId = new AsyncLocalStorage();",
                "requestId.run(\"r-1\", () => {",
                "    setTimeout(() => log(requestId.getStore()), 1);",
                "});",
                "setInterval(() => { requestId.getStore(); }, 1);",
                "await new Promise(resolve => setTimeout(resolve, 20));",
            ].join("\n");
            const trace = await tracePlayground(compilePlayground(code), "library");
            expect(trace.error).toBeUndefined();
            expect(trace.logs.map(log => log.text)).toEqual(["r-1"]);
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(stops).toEqual([]);
        } finally {
            window.removeEventListener("error", onError);
        }
    });
});
