import vm from "node:vm";
import { transformAsync } from "@babel/core";
import { describe, expect, it } from "vitest";
import preset, { METADATA_KEY } from "./preset.js";

interface Output {
    readonly code : string;
    readonly changed : boolean;
}

/** Transforms `code` with the preset. A script loads the runtime with `require`. */
async function transform(code : string, sourceType : "module" | "script" = "script") : Promise<Output> {
    const result = await transformAsync(code, {
        filename : "input.js",
        babelrc : false,
        configFile : false,
        sourceType,
        presets : [preset],
    });
    return {
        code : result?.code ?? "",
        changed : (result?.metadata as Record<string, unknown> | undefined)?.[METADATA_KEY] === true,
    };
}

/** Starts a script that the preset changed, and gives the value of the global `result`. */
async function run(code : string) : Promise<unknown> {
    const runtime = await import("../runtime.js");
    const sandbox : { require : () => unknown; result? : unknown } = { require : () => runtime };
    vm.runInNewContext(code, sandbox);
    return sandbox.result;
}

/** The parameters of each inner generator of the output: `_bindGenerator(function* (x) {`. */
function innerParameters(code : string) : string[] {
    return [...code.matchAll(/_bindGenerator\(function\* \(([^)]*)\)/g)].map((match) => match[1] as string);
}

describe("the binding of generators", () => {
    it("binds a generator that is not the first argument of coroutine", async () => {
        const output = await transform("_coroutine(other, function* () { yield 1; }); _asyncGenerator(other, function* () { yield 2; });");
        expect(output.code.match(/_bindGenerator\(/g)).toHaveLength(2);
    });

    it("does not bind the first argument of coroutine and asyncGenerator", async () => {
        const output = await transform("_coroutine(function* () { yield 1; }); _asyncGenerator(function* () { yield 2; });");
        expect(output.code).not.toContain("_bindGenerator(");
        expect(output.changed).toBe(false);
    });

    it("imports bindGenerator one time for all generators", async () => {
        const output = await transform("export function* a() { yield 1; } export function* b() { yield 2; }", "module");
        expect(output.code.match(/import \{ bindGenerator as _bindGenerator \} from "async-browser-context\/runtime";/g)).toHaveLength(1);
        expect(output.code.match(/_bindGenerator\(function\*/g)).toHaveLength(2);
        expect(output.code).not.toContain("_bindGenerator2");
    });

    it("gives the inner generator only the parameters that its own var or function declarations declare again", async () => {
        const input = [
            "function* a(x) { function h() { var x = 2; return x; } yield h(); { let x = 3; } var y = x + 1; yield y; }",
            "function* b(x, { y }, ...z) { var x, y; var w = 1; yield [x, y, z, w]; }",
            "function* c(x) { yield typeof x; { function x() {} } }",
            "function* d(x) { yield (function x() { return 1; })(); }",
            "function* e() { var x = 1; yield x; }",
            "result = [[...a(1)], [...b(1, { y : 2 }, 3)], [...c(1)], [...d(1)], [...e()]];",
        ].join("\n");
        const output = await transform(input);
        expect(innerParameters(output.code)).toEqual(["", "x, y", "x", "", ""]);
        expect(await run(output.code)).toEqual([[2, 2], [[1, 2, [3], 1]], ["number"], [1], [1]]);
    });

    it("keeps a generator declaration of a sloppy script at the top level and in a function body as a declaration", async () => {
        const input = "function* top() { yield 1; } function outer(g) { function* g() { yield 2; } return [...g()]; } result = [[...top()], outer(5), typeof globalThis.top];";
        const output = await transform(input);
        expect(output.code).toMatch(/^function top\(\) \{/m);
        expect(output.code).toMatch(/function outer\(g\) \{\s*function g\(\) \{/);
        expect(output.code).not.toContain("let ");
        expect(await run(output.code)).toEqual([[1], [2], "function"]);
    });

    it("keeps a generator declaration of a block of a sloppy script in the block", async () => {
        const output = await transform("var g = 'outer'; { function* g() { yield 1; } result = [...g()]; } result.push(typeof g);");
        expect(output.code).toMatch(/\{\s*let g = function g\(\) \{/);
        expect(output.code.match(/function g\(/g)).toHaveLength(1);
        expect(await run(output.code)).toEqual([1, "string"]);
    });

    it("keeps a generator declaration of a block of strict code as a declaration", async () => {
        const output = await transform("{ function* g() { yield 1; } use(g); }", "module");
        expect(output.code).toMatch(/\{\s*function g\(\) \{/);
        expect(output.code).not.toContain("let g");
    });

    it("does not bind a generator in a function with the directive of the runtime, and tells that it changed nothing", async () => {
        const output = await transform("export const drive = async function () { 'async-browser-context runtime'; function* inner() { yield 1; } return inner; };", "module");
        expect(output.code).toContain("function* inner()");
        expect(output.code).not.toContain("_bindGenerator");
        expect(output.changed).toBe(false);
    });
});
