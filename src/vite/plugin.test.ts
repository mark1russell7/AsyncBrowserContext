import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asyncContext, type AsyncContextPluginOptions } from "./plugin.js";

type Handler = (code : string, id : string, options? : { ssr? : boolean }) => Promise<{ code : string; map : string | null } | null>;

function handlerOf(options? : AsyncContextPluginOptions) : Handler {
    const plugin = asyncContext(options);
    const transform = plugin.transform as { handler : Handler };
    return transform.handler.bind({});
}

const ASYNC_CODE = "export async function load() { await null; return 1; }";

describe("the Vite plugin", () => {
    it("has a name, runs after the other plugins and filters the code", () => {
        const plugin = asyncContext();
        expect(plugin.name).toBe("async-browser-context");
        expect(plugin.enforce).toBe("post");
        const filter = (plugin.transform as { filter : { code : RegExp } }).filter.code;
        expect(filter.test("async function f() {}")).toBe(true);
        expect(filter.test("function* g() {}")).toBe(true);
        expect(filter.test("const value = 1;")).toBe(false);
    });

    it("transforms a module with an async function and gives a source map", async () => {
        const result = await handlerOf()(ASYNC_CODE, "/app/src/load.ts");
        expect(result?.code).toContain("async-browser-context/runtime");
        expect(result?.code).not.toContain("async function");
        expect(JSON.parse(result?.map ?? "{}")).toHaveProperty("mappings");
    });

    it("transforms the modules in node_modules and the modules with a query", async () => {
        const handler = handlerOf();
        expect(await handler(ASYNC_CODE, "/app/node_modules/dependency/index.js")).not.toBeNull();
        expect(await handler(ASYNC_CODE, "/app/node_modules/.vite/deps/dependency.js?v=1234")).not.toBeNull();
    });

    it("does not transform virtual modules, other file types and its own runtime", async () => {
        const handler = handlerOf();
        expect(await handler(ASYNC_CODE, "\0virtual:module.js")).toBeNull();
        expect(await handler(ASYNC_CODE, "/app/src/data.json")).toBeNull();
        expect(await handler(ASYNC_CODE, "/app/src/load.ts.map")).toBeNull();
        expect(await handler(ASYNC_CODE, "/app/src/style.css")).toBeNull();
        expect(await handler(ASYNC_CODE, "/app/node_modules/async-browser-context/dist/runtime.js")).toBeNull();
    });

    it("does not transform SSR modules unless the options tell it to", async () => {
        expect(await handlerOf()(ASYNC_CODE, "/app/src/load.ts", { ssr : true })).toBeNull();
        expect(await handlerOf({ ssr : true })(ASYNC_CODE, "/app/src/load.ts", { ssr : true })).not.toBeNull();
    });

    it("applies the include and exclude options, as regular expressions or functions", async () => {
        const onlySource = handlerOf({ include : /\/src\//, exclude : (id) => id.endsWith(".skip.ts") });
        expect(await onlySource(ASYNC_CODE, "/app/src/load.ts")).not.toBeNull();
        expect(await onlySource(ASYNC_CODE, "/app/node_modules/dependency/index.js")).toBeNull();
        expect(await onlySource(ASYNC_CODE, "/app/src/load.skip.ts")).toBeNull();
    });

    it("gives null when the module has the word async but no async function", async () => {
        expect(await handlerOf()("export const label = 'async';", "/app/src/label.ts")).toBeNull();
    });

    it("imports the runtime of the options", async () => {
        const result = await handlerOf({ runtime : "/custom/runtime.js" })(ASYNC_CODE, "/app/src/load.ts");
        expect(result?.code).toContain("/custom/runtime.js");
    });

    it("imports the runtime in a module without import or export, for example a worker", async () => {
        const result = await handlerOf()("self.onmessage = async (event) => { await fetch(event.data); };", "/app/src/worker.ts");
        expect(result?.code).toContain(`from "async-browser-context/runtime"`);
        expect(result?.code).not.toContain("require(");
    });

    it("uses require in a CommonJS module of a dependency, which Rollup or Rolldown changes", async () => {
        const result = await handlerOf()("const fs = require('fs'); module.exports = async function read() { await fs.promises.stat('.'); };", "/app/node_modules/dep/index.js");
        expect(result?.code).toContain(`require("async-browser-context/runtime")`);
        expect((await handlerOf()(ASYNC_CODE, "/app/node_modules/dep/index.cjs"))?.code).toContain("async-browser-context/runtime");
    });

    it("transforms the JavaScript of Vue, Svelte, Astro and MDX components, but not their styles", async () => {
        const handler = handlerOf();
        for (const id of ["/app/src/App.vue", "/app/src/App.vue?vue&type=script&setup=true&lang.ts", "/app/src/Card.svelte", "/app/src/page.astro", "/app/src/post.mdx"]) {
            expect(await handler(ASYNC_CODE, id)).not.toBeNull();
        }
        expect(await handler(ASYNC_CODE, "/app/src/App.vue?vue&type=style&index=0&lang.css")).toBeNull();
        expect(await handler(ASYNC_CODE, "/app/src/Card.svelte?svelte&type=style&lang.scss")).toBeNull();
    });

    it("gives no input source map to Babel, so the map describes the code that the plugin gets", async () => {
        const code = `${ASYNC_CODE}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify({ version : 3, sources : ["../src/original.ts"], names : [], mappings : "AAAA" })).toString("base64")}`;
        const result = await handlerOf()(code, "/app/node_modules/dep/index.js");
        expect(JSON.parse(result?.map ?? "{}").sources).not.toContain("../src/original.ts");
    });

    it("gives the names of the async functions to the preset, unless the option names is false", async () => {
        expect((await handlerOf()(ASYNC_CODE, "/app/src/load.ts"))?.code).toContain(`}, "load")`);
        const result = await handlerOf({ names : false })(ASYNC_CODE, "/app/src/load.ts");
        expect(result?.code).toContain("_coroutine(function*");
        expect(result?.code).not.toContain(`"load"`);
    });

    it("transforms .mjs, .cjs, .jsx and .tsx modules", async () => {
        const handler = handlerOf();
        for (const id of ["/app/a.mjs", "/app/b.cjs", "/app/c.jsx", "/app/d.tsx", "/app/e.mts"]) {
            expect(await handler(ASYNC_CODE, id)).not.toBeNull();
        }
    });

    it("finds a generator with a space between function and the star", async () => {
        const plugin = asyncContext();
        const filter = (plugin.transform as { filter : { code : RegExp } }).filter.code;
        expect(filter.test("const g = function * () { };")).toBe(true);
        expect(await handlerOf()("export const g = function * () { };", "/app/src/g.js")).not.toBeNull();
    });

    it("ignores the Babel configuration files of the project", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "async-browser-context-babel-"));
        fs.writeFileSync(path.join(directory, "babel.config.json"), JSON.stringify({ plugins : ["a-plugin-that-does-not-exist"] }));
        fs.writeFileSync(path.join(directory, ".babelrc"), JSON.stringify({ plugins : ["another-plugin-that-does-not-exist"] }));
        try {
            expect(await handlerOf()(ASYNC_CODE, path.join(directory, "load.js"))).not.toBeNull();
        } finally {
            fs.rmSync(directory, { recursive : true, force : true });
        }
    });
});
