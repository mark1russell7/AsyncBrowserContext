import { describe, expect, it } from "vitest";
import { instrumentScenario, splitScenario } from "./instrument";

const OPTIONS = { library : "/traced.ts", helpers : ["log", "sleep"] };

describe("instrumentScenario", () => {
    it("records a step before each statement, with the line of the statement", () => {
        const code = instrumentScenario("const a = 1;\nlog(a);\n", OPTIONS);
        expect(code).toMatch(/__trace\.at\(1\);\s*const a = 1;/);
        expect(code).toMatch(/__trace\.at\(2\);\s*log\(a\);/);
    });

    it("records the step after each await", () => {
        const code = instrumentScenario("async function f() {\n    const x = await sleep(1);\n}\n", OPTIONS);
        expect(code).toContain("__trace.after(await sleep(1), 2)");
    });

    it("gives an arrow function with an expression body a step", () => {
        const code = instrumentScenario("run(() => log(1));\n", OPTIONS);
        expect(code).toMatch(/\(\) => \{\s*__trace\.at\(1\);\s*return log\(1\);\s*\}/);
    });

    it("does not record a step for a function declaration", () => {
        const code = instrumentScenario("function f() {\n    log(1);\n}\n", OPTIONS);
        expect(code.match(/__trace\.at\(/g)).toHaveLength(1);
        expect(code).toContain("__trace.at(2)");
    });

    it("changes the import of the library and imports the helpers that the scenario does not declare", () => {
        const code = instrumentScenario("import { AsyncLocalStorage } from \"async-browser-context\";\nfunction sleep() {}\n", OPTIONS);
        expect(code).toContain("import { AsyncLocalStorage } from \"/traced.ts\";");
        expect(code).toContain("import { __trace, log } from \"/traced.ts\";");
    });

    it("puts the statements into the default export, an async function", () => {
        const code = instrumentScenario("await sleep(1);\n", OPTIONS);
        expect(code).toMatch(/export default async function scenario\(\) \{/);
    });

    it("gives a new variable the name of its declaration", () => {
        const code = instrumentScenario("const requestId = new AsyncLocalStorage();\nconst user = new AsyncContext.Variable();\nconst other = new AsyncLocalStorage({ name : \"x\" });\n", OPTIONS);
        expect(code).toContain("new AsyncLocalStorage({\n    name: \"requestId\"\n  })");
        expect(code).toContain("new AsyncContext.Variable({\n    name: \"user\"\n  })");
        expect(code).toContain("name: \"x\"");
    });
});

describe("splitScenario", () => {
    it("reads the metadata comment and gives the code after it", () => {
        const file = "/**\n * @title Two requests\n * @summary One line.\n *   A second line.\n * @order 3\n */\nconst a = 1;\n";
        expect(splitScenario(file, "x")).toEqual({
            meta : { title : "Two requests", summary : "One line. A second line.", order : 3 },
            source : "const a = 1;\n",
        });
    });

    it("needs the metadata comment", () => {
        expect(() => splitScenario("const a = 1;\n", "x")).toThrow(/no metadata comment/);
    });
});
