import { parseSync, transformAsync, transformFromAstAsync, type PluginObject, type PluginPass } from "@babel/core";
import { describe, expect, it } from "vitest";
import preset, { METADATA_KEY } from "./preset.js";
import { isServerDirective, withServerCodeSkipped } from "./server-code.js";
import type { PluginFactory } from "./skip-runtime.js";

interface Output {
    readonly code : string;
    readonly changed : boolean;
}

async function transform(code : string, plugins : PluginObject[] = []) : Promise<Output> {
    const result = await transformAsync(code, {
        filename : "input.js",
        babelrc : false,
        configFile : false,
        sourceType : "module",
        plugins : plugins.map((plugin) => () => plugin),
        presets : [preset],
    });
    return {
        code : result?.code ?? "",
        changed : (result?.metadata as Record<string, unknown> | undefined)?.[METADATA_KEY] === true,
    };
}

/** The text of the runtime in the output: an import or a call of a function of the runtime. */
const RUNTIME = /async-browser-context|_coroutine|_bindGenerator|_asyncGenerator|_awaitAsyncGenerator|_asyncGeneratorDelegate/;

describe("server directives", () => {
    it("knows the directives of Next.js: use server, use cache and use cache: <kind>", () => {
        expect(isServerDirective("use server")).toBe(true);
        expect(isServerDirective("use cache")).toBe(true);
        expect(isServerDirective("use cache: remote")).toBe(true);
        expect(isServerDirective("use cache: private")).toBe(true);
        expect(isServerDirective("use cache:remote")).toBe(false);
        expect(isServerDirective("use client")).toBe(false);
        expect(isServerDirective("use strict")).toBe(false);
        expect(isServerDirective("use servers")).toBe(false);
    });

    for (const directive of ["\"use server\"", "'use server'", "\"use cache\"", "\"use cache: remote\""]) {
        it(`does not change a file with the directive ${directive}`, async () => {
            const output = await transform(`${directive};
export async function save(form) { await db.write(form); return this ?? arguments.length; }
export const remove = async (id) => { await db.remove(id); };
export default async function () { await null; }
function* ids() { yield 1; }
async function* rows() { for await (const row of source()) yield row; }
class Store { static load = async () => { await null; return this; }; }`);
            expect(output.changed).toBe(false);
            expect(output.code).not.toMatch(RUNTIME);
            expect(output.code).toContain("export async function save(form)");
            expect(output.code).toContain("export const remove = async id =>");
            expect(output.code).toContain("export default async function ()");
            expect(output.code).toContain("function* ids()");
            expect(output.code).toContain("async function* rows()");
            expect(output.code).toContain("for await (const row of source())");
            expect(output.code).toContain("static load = async () =>");
        });
    }

    it("does not change a server action in a function, but changes the function around it", async () => {
        const output = await transform(`export default async function Page() {
    const data = await load();
    async function act(form) {
        "use server";
        await db.write(form);
    }
    return [data, act];
}`);
        expect(output.changed).toBe(true);
        expect(output.code).toContain("_coroutine(function* ()");
        expect(output.code).toMatch(/async function act\(form\) \{\s*"use server";\s*await db\.write\(form\);\s*\}/);
        expect(output.code.split("_coroutine(")).toHaveLength(2);
    });

    it("does not change a use cache function, but changes the other async functions of the file", async () => {
        const output = await transform(`export async function cached(id) {
    "use cache: private";
    return await fetch(id);
}
export async function plain(id) {
    return await fetch(id);
}`);
        expect(output.changed).toBe(true);
        expect(output.code).toMatch(/export async function cached\(id\) \{\s*"use cache: private";\s*return await fetch\(id\);\s*\}/);
        expect(output.code).toContain("export function plain(");
        expect(output.code).toContain("_coroutine(function* (id)");
    });

    it("does not change the generators, the async generators, the classes and the using declarations in a server function", async () => {
        const output = await transform(`export async function act() {
    "use server";
    await using resource = open();
    function* ids() { yield 1; }
    async function* rows() { for await (const row of source()) yield row; }
    class Store { static load = async () => { await null; return this; }; }
    const run = async () => { await null; };
    return [ids, rows, Store, run, resource];
}`);
        expect(output.changed).toBe(false);
        expect(output.code).not.toMatch(RUNTIME);
        expect(output.code).toContain("await using resource = open();");
        expect(output.code).toContain("function* ids()");
        expect(output.code).toContain("async function* rows()");
        expect(output.code).toContain("for await (const row of source())");
        expect(output.code).toContain("static load = async () =>");
        expect(output.code).toContain("const run = async () =>");
    });

    it("does not change server methods of objects and classes", async () => {
        const output = await transform(`export const actions = { async save() { "use server"; await null; } };
export class Data { static async load() { "use cache"; await null; } }`);
        expect(output.changed).toBe(false);
        expect(output.code).not.toMatch(RUNTIME);
        expect(output.code).toContain("async save()");
        expect(output.code).toContain("static async load()");
    });

    it("does not move a server arrow function of a static class field, but moves the other async arrow functions", async () => {
        const output = await transform(`export class Data {
    static save = async () => { "use server"; await null; };
    static load = async () => { await null; return this; };
}`);
        expect(output.code).toMatch(/static save = async \(\) => \{\s*"use server";\s*await null;\s*\};/);
        expect(output.code).toContain("static load = this.#asyncContext1();");
        expect(output.code.split("#asyncContext")).toHaveLength(3);
    });

    it("changes a function with a server text that is not a directive, and a use client file", async () => {
        const late = await transform("async function f() { await null; \"use server\"; }");
        const client = await transform("\"use client\";\nexport async function f() { await null; }");
        expect(late.code).toContain("_coroutine(");
        expect(client.code).toContain("_coroutine(");
    });

    it("does not stop the other plugins of the pass in server code", async () => {
        // As @babel/preset-typescript and @babel/preset-react do: a plugin in the same traversal
        const rename : PluginObject = {
            visitor : {
                Identifier(path) {
                    if (path.node.name === "secret") {
                        path.node.name = "renamed";
                    }
                },
            },
        };
        const file = await transform("\"use server\";\nexport async function act() { await secret(); }", [rename]);
        const inline = await transform("export async function act() { \"use server\"; await secret(); }", [rename]);
        expect(file.code).toContain("await renamed();");
        expect(inline.code).toContain("await renamed();");
        expect(file.code).not.toMatch(RUNTIME);
        expect(inline.code).not.toMatch(RUNTIME);
    });

    it("finds a server directive also without the text of the file (transformFromAst)", async () => {
        const code = "\"use server\";\nexport async function act() { await null; }";
        const ast = parseSync(code, { babelrc : false, configFile : false, sourceType : "module", filename : "input.js" });
        // Without the text, Babel gives the file the code ""
        const result = await transformFromAstAsync(ast as NonNullable<typeof ast>, "", {
            filename : "input.js",
            babelrc : false,
            configFile : false,
            presets : [preset],
        });
        expect(result?.code).toContain("export async function act()");
        expect(result?.code).not.toMatch(RUNTIME);
    });
});

describe("withServerCodeSkipped", () => {
    /** A plugin that counts the calls of each visitor form: a function, an array of functions, and enter and exit. */
    function countingPlugin(calls : Record<string, number>, keys : Record<string, unknown> = {}) : PluginFactory {
        const count = (name : string) => () : void => {
            calls[name] = (calls[name] ?? 0) + 1;
        };
        return () => ({
            visitor : {
                ...keys,
                StringLiteral : count("function"),
                NumericLiteral : { enter : [count("enter array")], exit : count("exit") },
                "Identifier|ThisExpression" : { enter : count("enter") },
            },
        }) as unknown as PluginObject<PluginPass>;
    }

    // Babel accepts these keys only in the visitor of path.traverse, not in a plugin. Thus this test does not start Babel.
    it("keeps the keys that are not visitor functions, for example the marks of a prepared visitor", () => {
        const shouldSkip = () : boolean => false;
        const keys = { noScope : true, shouldSkip, _exploded : true, _verified : true };
        const plugin = withServerCodeSkipped(countingPlugin({}, keys))({} as never, {}, "");
        const visitor = plugin.visitor as Record<string, unknown>;
        expect(visitor["noScope"]).toBe(true);
        expect(visitor["shouldSkip"]).toBe(shouldSkip);
        expect(visitor["_exploded"]).toBe(true);
        expect(visitor["_verified"]).toBe(true);
    });

    it("gives a plugin without a visitor as it is", () => {
        const plugin : PluginObject<PluginPass> = { name : "empty" };
        expect(withServerCodeSkipped(() => plugin)({} as never, {}, "")).toBe(plugin);
    });

    it("operates each visitor form outside server code, and none in server code", async () => {
        const run = async (code : string) : Promise<Record<string, number>> => {
            const calls : Record<string, number> = {};
            await transformAsync(code, {
                filename : "input.js",
                babelrc : false,
                configFile : false,
                plugins : [withServerCodeSkipped(countingPlugin(calls))],
            });
            return calls;
        };
        // The identifiers f, a and a
        const body = "export function f(a) { return ['x', 1, a]; }";
        expect(await run(body)).toEqual({ "function" : 1, "enter array" : 1, "exit" : 1, "enter" : 3 });
        expect(await run(`"use server";\n${body}`)).toEqual({});
        // Only the identifiers g, b and b are outside the server function. Its name f is in its node.
        expect(await run("function g(b) { async function f(a) { \"use server\"; return ['x', 1, a, this]; } return b; }")).toEqual({ "enter" : 3 });
    });
});
