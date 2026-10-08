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
        expect(await handler(ASYNC_CODE, "\0virtual:module")).toBeNull();
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
});
