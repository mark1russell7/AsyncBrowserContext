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

/** Counts the occurrences of `word` in `text`. */
function count(text : string, word : string) : number {
    return text.split(word).length - 1;
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
        const output = await transform("const asyncLabel = 'async'; function plain() { return 1; }");
        expect(output.changed).toBe(false);
    });

    it("binds a generator one time when it transforms its own output again", async () => {
        const first = await transform("function* g() { yield 1; } async function* h() { yield 2; }");
        const second = await transform(first.code);
        expect(count(second.code, "bindGenerator(")).toBe(count(first.code, "bindGenerator("));
    });

    it("keeps the hoisting of a generator declaration", async () => {
        const output = await transform("use(g()); function* g() { yield 1; }");
        expect(output.code).toMatch(/function g\(/);
    });
});
