import fs from "node:fs";
import { parseSync, transformAsync, traverse, types, type NodePath, type PluginObject } from "@babel/core";
import { describe, expect, it } from "vitest";
import preset, { DEFAULT_RUNTIME, METADATA_KEY, supportsResourceManagement } from "./preset.js";

interface Output {
    readonly code : string;
    readonly changed : boolean;
}

async function transform(code : string, options : { runtime? : string; names? : boolean; sourceType? : "module" | "script" | "unambiguous" } = {}) : Promise<Output> {
    const result = await transformAsync(code, {
        filename : "input.js",
        babelrc : false,
        configFile : false,
        sourceType : options.sourceType ?? "module",
        presets : [[preset, { ...(options.runtime === undefined ? {} : { runtime : options.runtime }), ...(options.names === undefined ? {} : { names : options.names }) }]],
    });
    return {
        code : result?.code ?? "",
        changed : (result?.metadata as Record<string, unknown> | undefined)?.[METADATA_KEY] === true,
    };
}

/** Counts the calls of the runtime function `bindGenerator`, also with a local name such as `_bindGenerator2`. */
function countBindCalls(text : string) : number {
    return text.match(/(?:\b_bindGenerator\d*|\.bindGenerator\))\(/g)?.length ?? 0;
}

/** The inputs of the output snapshots. Each input shows one form of async function or generator. */
const FIXTURES : Readonly<Record<string, string>> = {
    "async-function-declaration" : "async function load(id) { const data = await fetch(id); return { data, at: await now() }; }",
    "async-arrow-with-this" : "class A { m() { return async () => { await this.x(); return arguments.length; }; } }",
    "async-method-with-super" : "class B extends A { async m() { await null; return super.m(); } }",
    "for-await" : "async function f(items) { for await (const [a, b] of items) { if (a) break; use(b); } }",
    "top-level-for-await" : "for await (const value of source()) use(value);",
    "generator-declaration" : "function* numbers(limit) { 'use strict'; for (let i = 0; i < limit; i++) yield i; }",
    "generator-default-parameter" : "function* numbers({ limit } = { limit: 3 }) { for (let i = 0; i < limit; i++) yield i; }",
    "generator-exported" : "export function* one() { yield 1; } export default function* () { yield 2; }",
    "generator-expression" : "const gen = function* named() { yield arguments[0]; };",
    "generator-object-method-with-super" : "const o = { __proto__: base, *m() { yield super.m(); } };",
    "generator-class-methods" : "class C { static *s() { yield 1; } *#p() { yield this; } async *a() { await null; yield 2; } }",
};

describe("the Babel preset", () => {
    for (const [name, input] of Object.entries(FIXTURES)) {
        it(`transforms ${name} (output snapshot)`, async () => {
            const output = await transform(input);
            // Babel keeps a top-level for await, so that file does not change
            expect(output.changed).toBe(name !== "top-level-for-await");
            await expect(`// Input:\n// ${input}\n\n${output.code}\n`).toMatchFileSnapshot(`./__snapshots__/${name}.js.txt`);
        });
    }

    it("imports coroutine and bindGenerator from the default runtime", async () => {
        const output = await transform("async function f() { await null; } function* g() { yield 1; }");
        expect(output.code).toContain(`from "${DEFAULT_RUNTIME}"`);
        expect(output.code).toContain("coroutine");
        expect(output.code).toContain("bindGenerator");
        expect(output.code).not.toMatch(/\basync function\b|function\*\s*g\b/);
    });

    it("imports the runtime functions from the runtime of the options", async () => {
        const output = await transform("async function f() { await null; }", { runtime : "./my-runtime.js" });
        expect(output.code).toContain("from \"./my-runtime.js\"");
    });

    it("uses require in a CommonJS script", async () => {
        const output = await transform("const x = require('x'); module.exports = async function f() { await x(); };", { sourceType : "unambiguous" });
        expect(output.code).toContain(`require("${DEFAULT_RUNTIME}")`);
        expect(output.code).not.toContain("import ");
    });

    it("tells that it changed nothing in a file without async functions, generators or for await", async () => {
        const output = await transform("const asyncLabel = 'async'; function plain() { for (const x of [1]) use(x); }");
        expect(output.changed).toBe(false);
    });

    it("writes the change into the metadata key asyncBrowserContext", async () => {
        const result = await transformAsync("async function f() { await null; }", {
            filename : "input.js",
            babelrc : false,
            configFile : false,
            presets : [preset],
        });
        expect(result?.metadata).toHaveProperty("asyncBrowserContext", true);
        expect(METADATA_KEY).toBe("asyncBrowserContext");
    });

    it("tells that it did not change a file with only a top-level for await, which Babel keeps", async () => {
        const output = await transform("for await (const value of source()) use(value);");
        expect(output.changed).toBe(false);
    });

    it("binds a generator one time when it transforms its own output again, and gives an async generator to the driver", async () => {
        const first = await transform("function* g() { yield 1; } async function* h() { yield 2; }");
        const second = await transform(first.code);
        // The driver of the runtime keeps the context of the async generator, so bindGenerator does not wrap it
        expect(countBindCalls(first.code)).toBe(1);
        expect(countBindCalls(second.code)).toBe(1);
        expect(second.code.split("_asyncGenerator(")).toHaveLength(2);
    });

    it("binds a generator one time when it transforms its own CommonJS output again", async () => {
        const first = await transform("module.exports = function* g() { yield 1; };", { sourceType : "script" });
        const second = await transform(first.code, { sourceType : "script" });
        expect(countBindCalls(first.code)).toBe(1);
        expect(countBindCalls(second.code)).toBe(1);
    });

    it("does not bind the generator of the driver when it transforms its own CommonJS output again", async () => {
        const first = await transform("module.exports = async function* g() { await null; yield 1; };", { sourceType : "script" });
        const second = await transform(first.code, { sourceType : "script" });
        expect(first.code).toContain("_asyncGenerator(function* ()");
        expect(countBindCalls(first.code)).toBe(0);
        expect(countBindCalls(second.code)).toBe(0);
    });

    it("gives the async generators to the helpers of the runtime, in place of the Babel helpers", async () => {
        const output = await transform("export async function* g(items) { for await (const item of items) { yield* item; } }");
        for (const name of ["asyncGenerator", "awaitAsyncGenerator", "asyncGeneratorDelegate"]) {
            expect(output.code).toMatch(new RegExp(`import \\{[^}]*${name} as _${name}[^}]*\\} from "async-browser-context/runtime"`));
        }
        expect(output.code).not.toMatch(/function AsyncGenerator\(|function _wrapAsyncGenerator\(|function _OverloadYield\(|function _awaitAsyncGenerator\(|function _asyncGeneratorDelegate\(/);
    });

    it("keeps the helpers of the runtime for async generators when @babel/plugin-transform-runtime gives the other helpers", async () => {
        // As @babel/plugin-transform-runtime does: each helper from @babel/runtime
        const transformRuntime = () : PluginObject => ({
            pre(file) {
                file.set("helperGenerator", (name : string) => types.identifier(`RUNTIME_${name}`));
            },
        });
        const result = await transformAsync("export async function* g(items) { await null; for await (const item of items) yield* item; }", {
            filename : "input.js",
            babelrc : false,
            configFile : false,
            plugins : [transformRuntime],
            presets : [preset],
        });
        const code = result?.code ?? "";
        expect(code).toContain("_asyncGenerator(function* (items)");
        expect(code).toContain("_awaitAsyncGenerator(null)");
        expect(code).toContain("_asyncGeneratorDelegate(");
        expect(code).not.toMatch(/RUNTIME_(wrapAsyncGenerator|awaitAsyncGenerator|asyncGeneratorDelegate|OverloadYield)/);
        // The other helpers still come from the earlier plugin
        expect(code).toContain("RUNTIME_asyncIterator(items)");
    });

    it("keeps the helperGenerator of an earlier plugin for the other helpers", async () => {
        const earlier = () : PluginObject => ({
            pre(file) {
                file.set("helperGenerator", (name : string) => (name === "asyncIterator" ? types.identifier("customAsyncIterator") : undefined));
            },
        });
        const result = await transformAsync("export async function* g(items) { for await (const item of items) yield item; }", {
            filename : "input.js",
            babelrc : false,
            configFile : false,
            plugins : [earlier],
            presets : [preset],
        });
        expect(result?.code).toContain("customAsyncIterator(items)");
        expect(result?.code).toContain("_asyncGenerator(function* (items)");
    });

    it("does not bind a generator again that an import of bindGenerator with another name binds", async () => {
        const input = "import { bindGenerator as bind } from 'async-browser-context/runtime'; export const it = bind((function* () { yield 1; })());";
        const output = await transform(input);
        expect(countBindCalls(output.code)).toBe(0);
    });

    it("binds generators that functions with names like the helpers get", async () => {
        const input = "my_wrapAsyncGenerator(function* () { yield 1; }); wrapAsyncGeneratorLike(function* () { yield 2; }); wrapAsyncGenerator(function* () { yield 3; }); notbindGenerator((function* () { yield 4; })()); _bindGeneratorLike((function* () { yield 5; })());";
        const output = await transform(input);
        expect(countBindCalls(output.code)).toBe(5);
    });

    it("does not bind a generator again that the CommonJS output of another tool binds", async () => {
        const input = [
            "const _runtime = require('async-browser-context/runtime');",
            "exports.a = function a() { return (0, _runtime.bindGenerator)((function* () { yield 1; })()); };",
            "exports.b = function b() { return _runtime.bindGenerator((function* () { yield 2; })()); };",
        ].join("\n");
        const output = await transform(input, { sourceType : "script" });
        expect(output.code.match(/\.bindGenerator\)?\(/g)?.length).toBe(2);
        expect(output.code).not.toMatch(/_bindGenerator\d*\(/);
    });

    it("binds a generator that is an argument, not the callee, inside a bindGenerator call", async () => {
        const input = "import { bindGenerator as bind } from 'async-browser-context/runtime'; export const it = bind(use(function* () { yield 1; }));";
        const output = await transform(input);
        expect(output.code).toMatch(/_bindGenerator\(/);
    });

    it("binds generators that functions with other names close to the helper names get", async () => {
        const input = "_wrapAsyncGeneratorLike(function* () { yield 1; }); x_wrapAsyncGenerator(function* () { yield 2; }); x_bindGenerator((function* () { yield 3; })());";
        const output = await transform(input);
        expect(output.code.match(/\b_bindGenerator\(/g)?.length).toBe(3);
    });

    it("binds generators that member calls get, also as an immediate call", async () => {
        const input = "service.register(function* () { yield 1; }); service.other((function* () { yield 2; })()); service.bindGeneratorLike((function* () { yield 3; })());";
        const output = await transform(input);
        expect(output.code.match(/\b_bindGenerator\(/g)?.length).toBe(3);
    });

    it("binds a generator that an immediate call makes", async () => {
        const output = await transform("use((function* () { yield 1; })());");
        expect(countBindCalls(output.code)).toBe(1);
    });

    it("asks Babel for version 7.22 or 8, and names its plugins", () => {
        const ranges : string[] = [];
        const config = preset({ assertVersion : (range : string) => { ranges.push(range); } } as never);
        expect(ranges).toEqual(["^7.22.0 || ^8.0.0"]);
        const [first, second] = config.plugins ?? [];
        expect((first as () => { name : string })().name).toBe("async-browser-context/skip-runtime");
        const [plugin, options] = second as [(api : unknown, options : object) => { name : string }, object];
        expect(plugin({}, options).name).toBe("async-browser-context/bind-generators");
    });

    it("keeps the hoisting of a generator declaration", async () => {
        const output = await transform("use(g()); function* g() { yield 1; }");
        expect(output.code).toMatch(/function g\(/);
    });

    it("names its third plugin, which names the coroutines", () => {
        const config = preset({ assertVersion : () => undefined } as never);
        const [, , third] = config.plugins ?? [];
        const [plugin, options] = third as [(api : unknown, options : object) => { name : string }, object];
        expect(plugin({}, options).name).toBe("async-browser-context/name-coroutines");
    });

    it("does not change a function with the directive of the runtime, and changes the other functions", async () => {
        const input = [
            "export const drive = async () => { 'async-browser-context runtime'; await null; };",
            "export const other = async () => { await null; };",
        ].join("\n");
        const output = await transform(input);
        expect(output.code).toContain("drive = async () =>");
        expect(coroutineNames(output.code)).toEqual(["other"]);
    });

    // Mutation testing instruments the source files, so a directive is not the first statement of its function there
    const RUNTIME_FILES = ["../core/coroutine.ts", "../core/async-generator.ts", "../node/runtime.ts"]
        .map((file) => [file, fs.readFileSync(new URL(file, import.meta.url), "utf8")] as const);
    const instrumented = RUNTIME_FILES.some(([, source]) => source.includes("stryMutAct_"));

    it.skipIf(instrumented)("does not change the runtime of the library, which has native async functions (not in the copy of mutation testing)", async () => {
        for (const [file, source] of RUNTIME_FILES) {
            const result = await transformAsync(source, {
                filename : file.replace("../", "src/"),
                babelrc : false,
                configFile : false,
                parserOpts : { plugins : ["typescript"] },
                presets : [preset],
            });
            // The native async functions of the syntax tree, not the words of the comments
            const asyncFunctions = (code : string) : number => {
                let count = 0;
                const ast = parseSync(code, { filename : file, babelrc : false, configFile : false, parserOpts : { plugins : ["typescript"] } });
                if (ast === null) throw new Error(`Babel did not parse ${file}`);
                traverse(ast, {
                    Function(path : NodePath<types.Function>) {
                        if (path.node.async) count++;
                    },
                });
                return count;
            };
            expect(asyncFunctions(source), file).toBeGreaterThan(0);
            expect(asyncFunctions(result?.code ?? ""), file).toBe(asyncFunctions(source));
            expect(result?.code).not.toMatch(/_coroutine\(/);
        }
    });

    it("gives the wrapper of a field named _ref the name, and its reference a new name, so the wrapper does not start itself", async () => {
        const output = await transform("class A { _ref = async (x) => x + 1; eval = async (y) => y; }");
        const wrapper = /return function _ref\((\w+)\) \{\s*return (\w+)\.apply\(this, arguments\);/.exec(output.code);
        expect(wrapper?.[2]).toBeDefined();
        expect(wrapper?.[2]).not.toBe("_ref");
        // A function expression cannot have the name eval in strict code: the name goes to the name property
        expect(output.code).not.toContain("function eval(");
        expect(output.code).toMatch(/Object\.defineProperty\(function \(\w+\) \{[\s\S]*?\}, "name", \{\s*value: "eval",\s*configurable: true\s*\}\)/);
    });

    it("does not change an async generator or a for await loop in a function with the directive of the runtime", async () => {
        const output = await transform([
            "const prototype = async function* () { \"async-browser-context runtime\"; };",
            "async function drain(items) { \"async-browser-context runtime\"; for await (const item of items) { await item; } }",
            "async function* user() { yield 1; }",
        ].join("\n"));
        expect(output.code).toContain("async function* () {");
        expect(output.code).toContain("for await (const item of items)");
        expect(output.code).toContain("async function drain(items)");
        // The other async generator changes as usual
        expect(output.code).not.toContain("async function* user");
        expect(output.code).toContain("_asyncGenerator(");
    });

    it("changes await using in an async generator before the plugin of async generators, so the output is valid", async () => {
        const output = await transform("export async function* g(resource) { await using handle = resource(); yield handle; }");
        expect(output.code).not.toContain("await using");
        // An await in the generator of the transform is a SyntaxError: the dispose call is an await of the driver
        expect(() => parseSync(output.code, { babelrc : false, configFile : false, sourceType : "module" })).not.toThrow();
        expect(output.code).toMatch(/_awaitAsyncGenerator\(_usingCtx\w*\.d\(\)\)/);
    });

    it("changes await using before the async transform, so the output has no await using in a generator", async () => {
        const output = await transform("export async function f(resource) { await using handle = resource(); await null; return handle; }");
        expect(output.code).not.toContain("await using");
        expect(output.code).toMatch(/_usingCtx/);
        expect(output.code).toContain("_coroutine(function* (resource)");
    });

    it("uses the plugin of explicit resource management only with Babel 7.23.9 and later", () => {
        expect(supportsResourceManagement("7.22.20")).toBe(false);
        expect(supportsResourceManagement("7.23.8")).toBe(false);
        expect(supportsResourceManagement("7.23.9")).toBe(true);
        expect(supportsResourceManagement("7.29.7")).toBe(true);
        expect(supportsResourceManagement("8.0.0-rc.1")).toBe(true);
        expect(supportsResourceManagement(undefined)).toBe(false);
    });

    it("binds the generator that a Babel helper of a compiled dependency gets", async () => {
        const output = await transform("function _wrapAsyncGenerator(e) { return e; } export const g = _wrapAsyncGenerator(function* () { yield 1; });");
        expect(countBindCalls(output.code)).toBe(1);
    });

    it("does not bind the generator of coroutine when it transforms its own output again", async () => {
        const first = await transform("export async function load() { await null; }");
        const second = await transform(first.code);
        expect(countBindCalls(second.code)).toBe(0);
        expect(second.code).not.toMatch(/import \{[^}]*bindGenerator/);
    });

    it("keeps a generator declaration of a block of a script in the block", async () => {
        const output = await transform("var g = 'outer'; { function* g() { yield 1; } } module.exports = typeof g;", { sourceType : "script" });
        expect(output.code).toMatch(/\{\s*let g = function g\(\)/);
    });

    it("moves a static field with an async arrow function into a static private method", async () => {
        const output = await transform("class A extends B { static load = async () => { await null; return super.x(); }; }");
        expect(output.code).toContain("static load = this.#asyncContext1();");
        expect(output.code).toMatch(/static #asyncContext1\(\) \{/);
        expect(output.code).not.toMatch(/^var _superprop/m);
    });
});

/** The names that the output gives to the coroutine calls, in the order of the output: `_coroutine(function* () {...}, "name")`. */
function coroutineNames(code : string) : string[] {
    return [...code.matchAll(/\}, "([^"]*)"\)/g)].map((match) => match[1] as string);
}

describe("the names of the async functions (for the callback hooks)", () => {
    const CASES : readonly (readonly [string, string, readonly string[]])[] = [
        ["a declaration", "async function load() { await null; }", ["load"]],
        ["an arrow function in a variable", "const load = async () => { await null; };", ["load"]],
        ["an anonymous function expression in a variable", "const load = async function () { await null; };", ["load"]],
        ["a function expression with its own name", "const x = async function inner() { await null; };", ["inner"]],
        ["an object method", "const o = { async m() { await null; } };", ["m"]],
        ["an arrow function in an object property", "const o = { m: async () => { await null; } };", ["m"]],
        ["a string key", "const o = { 'a b': async () => { await null; } };", ["a b"]],
        ["a computed string key", "const o = { async ['lit']() { await null; } };", ["lit"]],
        ["a numeric key", "const o = { async 42() { await null; } };", ["42"]],
        ["a static class method", "class C { static async s() { await null; } }", ["s"]],
        ["a private class method", "class C { async #p() { await null; } }", ["#p"]],
        ["a class field", "class C { f = async () => { await null; }; }", ["f"]],
        ["a private class field", "class C { #f = async () => { await null; }; }", ["#f"]],
        ["an assignment", "let a; a = async () => { await null; };", ["a"]],
        ["a logical assignment", "let a; a ??= async () => { await null; };", ["a"]],
        ["a default parameter", "function f(cb = async () => { await null; }) { return cb; }", ["cb"]],
        ["a default export", "export default async function () { await null; }", ["default"]],
        ["an async function in an async method", "class C { async m() { const inner = async () => { await null; }; await inner(); } }", ["inner", "m"]],
    ];
    for (const [name, input, expected] of CASES) {
        it(`gives the name of ${name}`, async () => {
            const output = await transform(input);
            expect(coroutineNames(output.code).toSorted()).toEqual([...expected].toSorted());
        });
    }

    it("gives no name to an anonymous async function", async () => {
        const output = await transform("use(async () => { await null; }); const o = { async [key]() { await null; } };");
        expect(output.code).toMatch(/_coroutine\(/);
        expect(coroutineNames(output.code)).toEqual([]);
    });

    it("gives the name of an async generator to asyncGenerator", async () => {
        const output = await transform("async function* numbers() { await null; yield 1; } const o = { async *rows() { yield 1; } };");
        expect(coroutineNames(output.code).toSorted()).toEqual(["numbers", "rows"]);
    });

    it("gives the name through a TypeScript wrapper and to an accessor field", async () => {
        const result = await transformAsync("const h = (async () => { await null; }) as Handler; class C { accessor a = async () => { await null; }; }", {
            filename : "input.ts",
            babelrc : false,
            configFile : false,
            parserOpts : { plugins : ["typescript", "decoratorAutoAccessors"] },
            presets : [preset],
        });
        expect(coroutineNames(result?.code ?? "").toSorted()).toEqual(["a", "h"]);
    });

    it("does not record names in a function with the directive of the runtime", async () => {
        const output = await transform("export const drive = async () => { 'async-browser-context runtime'; const inner = async () => { await null; }; await inner(); };");
        expect(output.code).not.toContain("_coroutine");
    });

    it("gives the name in CommonJS output", async () => {
        const output = await transform("const x = require('x'); module.exports = async function f() { await x(); };", { sourceType : "unambiguous" });
        expect(coroutineNames(output.code)).toEqual(["f"]);
    });

    it("gives the name one time when it transforms its own output again", async () => {
        const first = await transform("async function load() { await null; }");
        const second = await transform(first.code);
        expect(coroutineNames(second.code)).toEqual(["load"]);
        expect(second.code).not.toMatch(/"load", "load"/);
    });

    it("gives no names with the option names: false, and changes the code in the same way", async () => {
        const input = "async function load() { await null; } const o = { async m() { await null; } };";
        const output = await transform(input, { names : false });
        expect(coroutineNames(output.code)).toEqual([]);
        expect(output.code).toMatch(/_coroutine\(function\* \(\) \{/);
        expect(output.changed).toBe(true);
        expect(output.code).toBe((await transform(input)).code.replace(/, "(load|m)"\)/g, ")"));
    });
});
