import type { NodePath, PluginAPI, PluginObject, PluginPass, types, Visitor } from "@babel/core";
import { isRuntimeFunction } from "./runtime-calls.js";

export { RUNTIME_DIRECTIVE } from "./runtime-calls.js";

/** The visitor that skips each function with the directive of the runtime. */
const SKIP_RUNTIME : Visitor<PluginPass> = {
    Function(functionPath : NodePath<types.Function>) {
        if (isRuntimeFunction(functionPath.node)) {
            functionPath.skip();
        }
    },
};

/**
 * The first plugin of the preset. It skips each function with the directive of the runtime
 * (runtime-calls.ts), so that the plugins of the main traversal do not change it. The plugins
 * of the preset with their own traversal also skip it (refer to `withRuntimeSkipped`). Bundlers that
 * apply the preset to `node_modules` thus do not change the runtime.
 */
export function skipRuntimePlugin() : PluginObject<PluginPass> {
    return {
        name : "async-browser-context/skip-runtime",
        visitor : SKIP_RUNTIME,
    };
}

/** A Babel plugin: a function that gets the API of Babel, the options and the folder. */
export type PluginFactory = (api : PluginAPI, options : object, dirname : string) => PluginObject<PluginPass>;

/**
 * The plugin of Babel for async generators changes the async generators and the `for await`
 * loops in its own traversal. It starts that traversal in its `Program` visitor. The skip of the main
 * traversal does not apply to that traversal. This function gives a plugin that operates as
 * `factory`. But it puts `SKIP_RUNTIME` in front of each traversal that the `Program` visitor
 * starts.
 *
 * The function uses the traversal of the Babel that loads the plugin (`api.traverse`).
 * If the plugin has no `Program` function, it stays as it is.
 */
export function withRuntimeSkipped(factory : PluginFactory) : PluginFactory {
    return function runtimeSkipped(api, options, dirname) {
        const plugin = factory(api, options, dirname);
        const program = plugin.visitor?.Program;
        if (typeof program !== "function") {
            return plugin;
        }
        const visitor = {
            ...plugin.visitor,
            Program(this : PluginPass, path : NodePath<types.Program>, state : PluginPass) : void {
                const ownTraverse = path.traverse;
                // An own property of this path object hides the method of the prototype during the visitor
                path.traverse = function (this : NodePath, inner : Visitor<unknown>, innerState? : unknown) : void {
                    Reflect.apply(ownTraverse, this, [api.traverse.visitors.merge([SKIP_RUNTIME as Visitor<unknown>, inner]), innerState]);
                } as typeof path.traverse;
                try {
                    Reflect.apply(program, this, [path, state]);
                } finally {
                    delete (path as { traverse? : unknown }).traverse;
                }
            },
        } as Visitor<PluginPass>;
        return { ...plugin, visitor };
    };
}
