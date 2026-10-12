import type { NodePath, PluginObject, PluginPass, types } from "@babel/core";

/**
 * The directive that marks a native async function of the runtime. If the
 * preset changes that function, the function uses `coroutine` to operate
 * `coroutine`, without end. A directive stays in the code after TypeScript,
 * esbuild (also in the dependency bundles of the Vite dev server), Rollup and
 * webpack, but a comment does not.
 */
export const RUNTIME_DIRECTIVE = "async-browser-context runtime";

function isRuntimeFunction(node : types.Function) : boolean {
    return node.body.type === "BlockStatement" && node.body.directives.some((directive) => directive.value.value === RUNTIME_DIRECTIVE);
}

/**
 * The first plugin of the preset. It skips each function with the directive,
 * so that no other plugin of the preset changes it. Bundlers that apply the
 * preset to `node_modules` thus do not change the runtime.
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
