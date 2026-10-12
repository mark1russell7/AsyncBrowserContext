import type { NodePath, PluginObject, PluginPass, types } from "@babel/core";
import { isRuntimeFunction } from "./runtime-calls.js";

export { RUNTIME_DIRECTIVE } from "./runtime-calls.js";

/**
 * The first plugin of the preset. It skips each function with the directive of the runtime
 * (runtime-calls.ts), so that the plugins of the main traversal do not change it. The plugins
 * of the preset with their own traversal also skip it. Bundlers that apply the preset to
 * `node_modules` thus do not change the runtime. A function with the directive must not be
 * an async generator or contain `for await`: Babel changes these in its own traversal.
 */
export function skipRuntimePlugin() : PluginObject<PluginPass> {
    return {
        name : "async-browser-context/skip-runtime",
        visitor : {
            Function(functionPath : NodePath<types.Function>) {
                if (isRuntimeFunction(functionPath.node)) {
                    functionPath.skip();
                }
            },
        },
    };
}
