import vm from "node:vm";
import { template, transformAsync, type InputOptions, type PluginObject, type types } from "@babel/core";
import { describe, expect, it } from "vitest";
import { keyName } from "./name-coroutines.js";
import preset from "./preset.js";

/** Transforms `code` with the preset. A script loads the runtime with `require`. */
async function transform(code : string, options : { filename? : string; sourceType? : "module" | "script"; parserOpts? : InputOptions["parserOpts"] } = {}) : Promise<string> {
    const result = await transformAsync(code, {
        filename : options.filename ?? "input.js",
        babelrc : false,
        configFile : false,
        sourceType : options.sourceType ?? "module",
        presets : [preset],
        ...(options.parserOpts === undefined ? {} : { parserOpts : options.parserOpts }),
    });
    return result?.code ?? "";
}

/** The names that the output gives to the calls of coroutine and asyncGenerator: `_coroutine(function* () {...}, "name")`. */
function coroutineNames(code : string) : string[] {
    return [...code.matchAll(/\}, "([^"]*)"\)/g)].map((match) => match[1] as string).toSorted();
}

/** Starts a script that the preset changed, and gives the value of the global `result`. */
async function run(code : string) : Promise<unknown> {
    const runtime = await import("../runtime.js");
    const sandbox : { require : () => unknown; result? : unknown } = { require : () => runtime };
    vm.runInNewContext(code, sandbox);
    return sandbox.result;
}

describe("the names of the async functions", () => {
    const CASES : readonly (readonly [string, string, readonly string[]])[] = [
        ["the logical assignments", "let a, b, c; a &&= async () => { await null; }; b ||= async () => { await null; }; c ??= async () => { await null; };", ["a", "b", "c"]],
        ["the default values of destructuring", "const { a = async () => { await null; } } = {}; let b; [b = async () => { await null; }] = [];", ["a", "b"]],
        ["a nested type wrapper", "const h = ((async () => { await null; }) as A) satisfies B;", ["h"]],
        ["bigint keys, also hexadecimal and computed ones", "const o = { 1n: async () => { await null; }, 0x10n: async () => { await null; }, [3n]: async () => { await null; } };", ["1", "16", "3"]],
    ];
    for (const [name, input, expected] of CASES) {
        it(`come from ${name}`, async () => {
            expect(coroutineNames(await transform(input, { filename : "input.ts", parserOpts : { plugins : ["typescript"] } }))).toEqual(expected);
        });
    }

    it("come through each TypeScript wrapper", async () => {
        const input = "const a = (async () => { await null; }) as A; const b = (async () => { await null; }) satisfies B; const c = (async () => { await null; })!; const d = <D>(async () => { await null; });";
        expect(coroutineNames(await transform(input, { filename : "input.ts", parserOpts : { plugins : ["typescript"] } }))).toEqual(["a", "b", "c", "d"]);
    });

    it("come through a Flow type cast and through parentheses", async () => {
        expect(coroutineNames(await transform("const a = (async () => { await null; }: A);", { parserOpts : { plugins : ["flow"] } }))).toEqual(["a"]);
        expect(coroutineNames(await transform("const a = (async () => { await null; });", { parserOpts : { createParenthesizedExpressions : true } }))).toEqual(["a"]);
    });

    it("do not come from other assignments, other targets, other parents or computed keys", async () => {
        const input = [
            "let a; a += async () => { await null; };",
            "o.b = async () => { await null; };",
            "({ c: o.c = async () => { await null; } } = {});",
            "const { d } = async () => { await null; };",
            "class E extends (async () => { await null; }) {}",
            "const f = { [async () => { await null; }]: 1 };",
            "class G { [async () => { await null; }] = 1; }",
            "use(async () => { await null; });",
            "const h = [async () => { await null; }];",
            "const i = { [key]: async () => { await null; } };",
            "class J { [key] = async () => { await null; }; }",
        ].join("\n");
        const output = await transform(input);
        expect(output.match(/_coroutine\(function\*/g)).toHaveLength(11);
        expect(coroutineNames(output)).toEqual([]);
    });

    it("do not come from a sync method around an anonymous async function", async () => {
        const output = await transform("class C { m() { return async () => { await null; return this; }; } } const o = { n() { return async function () { await null; }; } };");
        expect(output.match(/_coroutine\(function\*/g)).toHaveLength(2);
        expect(coroutineNames(output)).toEqual([]);
    });

    it("go only to the call of the driver in an async method, not to the calls that another plugin adds", async () => {
        // A plugin that adds calls to each method after the async transforms, which change the methods in the main traversal
        const adder = () : PluginObject => ({
            visitor : {
                Program : {
                    exit(path) {
                        path.traverse({
                            ClassMethod(method) {
                                method.get("body").unshiftContainer("body", template.statements.ast`
                                    _coroutine(function* () {}, 2);
                                    _coroutine(generator);
                                    _coroutine(function () {});
                                    trace(function* () {});
                                `);
                            },
                        });
                    },
                },
            },
        });
        const result = await transformAsync("class C { async m() { await null; } }", { filename : "input.js", babelrc : false, configFile : false, plugins : [adder], presets : [preset] });
        const output = result?.code ?? "";
        expect(output).toMatch(/_coroutine\(function\* \(\) \{\}, 2\);\s*_coroutine\(generator\);\s*_coroutine\(function \(\) \{\}\);\s*trace\(function\* \(\) \{\}\);/);
        expect(output).toMatch(/\}, "m"\)\(\);/);
        expect(coroutineNames(output)).toEqual(["m"]);
    });

    it("do not change the call of a default export, which is not a wrapper", async () => {
        const output = await transform("export default async function () { await null; }");
        expect(coroutineNames(output)).toEqual(["default"]);
        expect(output).not.toContain("defineProperty");
    });

    it("do not go to a call of coroutine in a method with the directive of the runtime, or in a method inside such a function", async () => {
        const input = [
            "class R { async m() { 'async-browser-context runtime'; return _coroutine(function* () { yield 1; }); } }",
            "async function drive() { 'async-browser-context runtime'; return { async n() { return _coroutine(function* () { yield 2; }); } }; }",
        ].join("\n");
        const output = await transform(input);
        expect(output).toContain("async m() {");
        expect(output).toContain("async n() {");
        expect(output.match(/return _coroutine\(function\* \(\) \{/g)).toHaveLength(2);
        expect(coroutineNames(output)).toEqual([]);
    });

    it("do not come from a key of another type, for example a decimal literal of Babel 7", () => {
        expect(keyName({ type : "DecimalLiteral", value : "1" } as unknown as types.Node, false)).toBeUndefined();
    });

    it("do not come from the empty key", async () => {
        const output = await transform("const o = { '': async () => { await null; } }; class C { ''() {} async ''() { await null; } }");
        expect(output).toMatch(/_coroutine\(/);
        expect(coroutineNames(output)).toEqual([]);
    });
});

describe("the names of the wrappers of the async transform", () => {
    it("are the names of the class fields, also when the name is not an identifier", async () => {
        const input = [
            "class A { field = async (x) => { await null; return x; }; 'my-handler' = async (y) => y; arguments = async (z) => z; _ref = async (w) => w; }",
            "const a = new A();",
            "const functions = [a.field, a['my-handler'], a.arguments, a._ref];",
            "result = Promise.all(functions.map((fn, index) => fn(index))).then((values) => functions.map((fn, index) => [fn.name, fn.length, values[index]]));",
        ].join("\n");
        const output = await transform(input, { sourceType : "script" });
        expect(await run(output)).toEqual([["field", 1, 0], ["my-handler", 1, 1], ["arguments", 1, 2], ["_ref", 1, 3]]);
    });

    it("do not use a local Object for a name that is not an identifier", async () => {
        const output = await transform("const Object = {}; class A { 'my-handler' = async (y) => y; }");
        expect(output).not.toContain("Object.defineProperty");
        expect(coroutineNames(output)).toEqual(["my-handler"]);
    });

    it("keep the name of a named function expression", async () => {
        const output = await transform("class A { named = async function inner(x) { await null; return x; }; } result = new A().named.name;", { sourceType : "script" });
        expect(await run(output)).toBe("inner");
    });
});
