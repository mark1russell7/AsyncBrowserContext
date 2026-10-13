import vm from "node:vm";
import { transformAsync } from "@babel/core";
import { describe, expect, it } from "vitest";
import preset from "./preset.js";

/** Transforms a script with the preset. The output loads the runtime with `require`. */
async function transform(code : string, names = true) : Promise<string> {
    const result = await transformAsync(code, {
        filename : "input.js",
        babelrc : false,
        configFile : false,
        sourceType : "script",
        presets : [[preset, { names }]],
    });
    return result?.code ?? "";
}

/** Starts the output of `transform` and gives the value of the global `result`, after its promise settles. */
async function run(code : string) : Promise<unknown> {
    const runtime = await import("../runtime.js");
    const sandbox : { require : () => unknown; result? : unknown } = { require : () => runtime };
    vm.runInNewContext(code, sandbox);
    return await sandbox.result;
}

/** The number of static private methods that the plugin adds. */
function movedCount(code : string) : number {
    return code.match(/static #asyncContext\d+\(\)/g)?.length ?? 0;
}

describe("the static members with async arrow functions", () => {
    for (const names of [true, false]) {
        it(`keep the this of the class and the name of the field (names: ${names})`, async () => {
            const output = await transform("class A { static load = async () => { await null; return this; }; } result = A.load().then((self) => ({ name : A.load.name, self : self === A }));", names);
            expect(movedCount(output)).toBe(1);
            expect(await run(output)).toEqual({ name : "load", self : true });
        });
    }

    it("get an object property with the key of the field, which gives the name to the function", async () => {
        const input = [
            "class A {",
            "    static load = async () => { await null; return this; };",
            "    static #hidden = async () => { await null; return this; };",
            "    static 'a b' = async () => { await null; return this; };",
            "    static 42 = async () => { await null; return this; };",
            "}",
        ].join("\n");
        const output = await transform(input, false);
        expect(movedCount(output)).toBe(4);
        for (const key of ["load", "#hidden", "a b", "42"]) {
            expect(output).toContain(`}["${key}"];`);
        }
    });

    it("do not get the identifier of a computed key as their name", async () => {
        const output = await transform("const key = 'dynamic'; class A { static [key] = async () => { await null; return this; }; } result = A.dynamic().then((self) => ({ name : A.dynamic.name, self : self === A }));", false);
        expect(movedCount(output)).toBe(1);
        expect(output).not.toContain("[\"key\"]");
        const value = await run(output) as { name : string; self : boolean };
        expect(value.self).toBe(true);
        expect(value.name).not.toBe("key");
    });

    it("stay in place when no async arrow function uses the this of the class", async () => {
        const input = [
            "class A {",
            "    static empty;",
            "    static plain = 1;",
            "    static arrow = () => 1;",
            "    static nested = wrap(() => 1);",
            "    static method = async function () { await null; return this; };",
            "    static object = { async m() { await null; return this; } };",
            "    static factory = wrap(function () { return async () => { await null; return this; }; });",
            "    static inner = wrap(class { static load = async () => { await null; return this; }; });",
            "    instance = async () => { await null; return this; };",
            "    static { this.x = 1; }",
            "}",
        ].join("\n");
        const output = await transform(input);
        // Only the static field of the inner class moves, into a method of the inner class
        expect(movedCount(output)).toBe(1);
        expect(output).toMatch(/static inner = wrap\(class \{\s*static load = this\.#asyncContext1\(\);/);
        for (const kept of ["static empty;", "static plain = 1;", "static arrow = () => 1;", "static nested = wrap(() => 1);", "static method = _coroutine(", "static object = {", "static factory = wrap(function () {"]) {
            expect(output).toContain(kept);
        }
        expect(output).toMatch(/static \{\s*this\.x = 1;\s*\}/);
    });

    it("move a static block with an async arrow function", async () => {
        const output = await transform("class A { static { this.load = async () => { await null; return this; }; } } result = A.load().then((value) => value === A);");
        expect(movedCount(output)).toBe(1);
        expect(output).toMatch(/static \{\s*this\.#asyncContext1\(\);\s*\}/);
        expect(await run(output)).toBe(true);
    });

    it("give the static private method a name that the class does not use", async () => {
        const input = "class A { static #asyncContext1 = 'own'; static load = async () => { await null; return this.#asyncContext1; }; } result = A.load();";
        const output = await transform(input);
        expect(output).toContain("static load = this.#asyncContext2();");
        expect(await run(output)).toBe("own");
    });
});
