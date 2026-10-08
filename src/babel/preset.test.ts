import { transformAsync } from "@babel/core";
import { describe, expect, it } from "vitest";
import preset, { DEFAULT_RUNTIME, METADATA_KEY } from "./preset.js";

interface Output {
    readonly code : string;
    readonly changed : boolean;
}

async function transform(code : string, options : { runtime? : string; sourceType? : "module" | "script" | "unambiguous" } = {}) : Promise<Output> {
    const result = await transformAsync(code, {
        filename : "input.js",
        babelrc : false,
        configFile : false,
        sourceType : options.sourceType ?? "module",
        presets : [[preset, options.runtime === undefined ? {} : { runtime : options.runtime }]],
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
            expect(output.changed).toBe(true);
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

    it("tells that it changed a file with only a top-level for await", async () => {
        const output = await transform("for await (const value of source()) use(value);");
        expect(output.changed).toBe(true);
    });

    it("binds a generator one time when it transforms its own output again", async () => {
        const first = await transform("function* g() { yield 1; } async function* h() { yield 2; }");
        const second = await transform(first.code);
        expect(countBindCalls(first.code)).toBe(2);
        expect(countBindCalls(second.code)).toBe(2);
    });

    it("binds a generator one time when it transforms its own CommonJS output again", async () => {
        const first = await transform("module.exports = function* g() { yield 1; };", { sourceType : "script" });
        const second = await transform(first.code, { sourceType : "script" });
        expect(countBindCalls(first.code)).toBe(1);
        expect(countBindCalls(second.code)).toBe(1);
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

    it("binds a generator that an immediate call makes", async () => {
        const output = await transform("use((function* () { yield 1; })());");
        expect(countBindCalls(output.code)).toBe(1);
    });

    it("asks Babel for version 7.22 or 8, and names its plugin", () => {
        const ranges : string[] = [];
        const config = preset({ assertVersion : (range : string) => { ranges.push(range); } } as never);
        expect(ranges).toEqual(["^7.22.0 || ^8.0.0"]);
        const [first] = config.plugins ?? [];
        const [plugin, options] = first as [(api : unknown, options : object) => { name : string }, object];
        expect(plugin({}, options).name).toBe("async-browser-context/bind-generators");
    });

    it("keeps the hoisting of a generator declaration", async () => {
        const output = await transform("use(g()); function* g() { yield 1; }");
        expect(output.code).toMatch(/function g\(/);
    });
});
