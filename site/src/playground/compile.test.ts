import { describe, expect, it } from "vitest";
import { CompileError, compilePlayground, PLAYGROUND_GLOBAL } from "./compile";

const errorOf = (source : string) : CompileError => {
    try {
        compilePlayground(source);
    } catch (error) {
        if (error instanceof CompileError) return error;
        throw error;
    }
    throw new Error("The code compiled without an error.");
};

describe("compilePlayground", () => {
    it("gives a module without imports that reads the global object of the playground", () => {
        const code = compilePlayground("import { AsyncLocalStorage } from \"async-browser-context\";\nconst id = new AsyncLocalStorage();\nawait id.run(\"a\", async () => {\n    await sleep(1);\n    log(id.getStore());\n});\n");
        expect(code).not.toMatch(/^import /m);
        expect(code).toContain(`globalThis.${PLAYGROUND_GLOBAL}`);
        expect(code).toMatch(/export default function scenario\(/);
        expect(code).toContain("__trace.after(");
        expect(code).toContain("coroutine");
    });

    it("gives the line of a syntax error", () => {
        const error = errorOf("const a = 1;\nconst = 2;\n");
        expect(error.line).toBe(2);
        expect(error.message).not.toContain("unknown file");
    });

    it("accepts only named imports of the library, and no exports", () => {
        expect(errorOf("import x from \"lodash\";\n")).toMatchObject({ line : 1, message : expect.stringContaining("cannot import \"lodash\"") });
        expect(errorOf("\nimport library from \"async-browser-context\";\n")).toMatchObject({ line : 2, message : expect.stringContaining("named imports") });
        expect(errorOf("export const a = 1;\n")).toMatchObject({ line : 1, message : expect.stringContaining("cannot export") });
    });
});
