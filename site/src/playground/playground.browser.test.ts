import { describe, expect, it } from "vitest";
import { compilePlayground } from "./compile";
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
});
