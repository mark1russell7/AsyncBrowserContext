import type { NodePath, PluginObject, PluginPass, types } from "@babel/core";
import { isRuntimeFunction } from "./runtime-calls.js";
import type { PluginFactory } from "./skip-runtime.js";

/**
 * The plugin of Babel for `using` declarations changes the blocks of an async function when it
 * visits the function in the main traversal. But the plugin of Babel for async generators
 * changes each async generator before, in its own traversal from `Program`. The block of an
 * async generator then got `await _usingCtx.d()` in a generator, which is a `SyntaxError`.
 *
 * This function gives a plugin that changes the `using` declarations of each async generator
 * in `Program` enter, with the visitor of `resources`. The preset puts it after the plugin of
 * `using` declarations and before the plugin of async generators. The functions with the
 * directive of the runtime stay as they are.
 */
export function asyncGeneratorResources(resources : PluginFactory) : PluginFactory {
    return function asyncGeneratorResourcesPlugin(api, options, dirname) : PluginObject<PluginPass> {
        const visitor = resources(api, options, dirname).visitor;
        return {
            name : "async-browser-context/async-generator-resources",
            visitor : {
                Program(programPath, state) {
                    if (visitor === undefined) {
                        return;
                    }
                    programPath.traverse({
                        Function(functionPath : NodePath<types.Function>) {
                            if (isRuntimeFunction(functionPath.node)) {
                                functionPath.skip();
                                return;
                            }
                            if (functionPath.node.async && functionPath.node.generator) {
                                // A second visit of a changed block finds no using declaration, so nested async generators are no problem
                                functionPath.traverse(visitor, state);
                            }
                        },
                    }, state);
                },
            },
        };
    };
}
