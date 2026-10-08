import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import { addNamed } from "@babel/helper-module-imports";

/** The options of the plugin. */
export interface BindGeneratorsOptions {
    /** The module that exports `bindGenerator`. */
    readonly runtime : string;
}

/** The key of the file metadata that tells if the preset changed the file. */
export const METADATA_KEY = "asyncBrowserContext";

/** The names of the helper of `@babel/plugin-transform-async-generator-functions`. */
const ASYNC_GENERATOR_HELPER = /^_?wrapAsyncGenerator\d*$/;
/** The local names that `addNamed` gives to `bindGenerator`. */
const BIND_GENERATOR_NAME = /^_?bindGenerator\d*$/;

type FunctionPath = NodePath<types.Function>;

/** Gives `true` if `path` is the generator that Babel gives to its async generator helper. */
function isAsyncGeneratorHelperArgument(path : FunctionPath) : boolean {
    const parent = path.parentPath;
    if (parent === null || !parent.isCallExpression()) {
        return false;
    }
    const callee = parent.node.callee;
    return types.isIdentifier(callee) && ASYNC_GENERATOR_HELPER.test(callee.name);
}

function isBindGeneratorCallee(callee : types.Node, path : NodePath, runtime : string) : boolean {
    if (types.isIdentifier(callee)) {
        return BIND_GENERATOR_NAME.test(callee.name) || path.referencesImport(runtime, "bindGenerator");
    }
    return types.isMemberExpression(callee) && types.isIdentifier(callee.property) && callee.property.name === "bindGenerator";
}

/** Gives `true` if this plugin already changed the generator: `bindGenerator((function* () {...})())`. */
function isAlreadyBound(path : FunctionPath, runtime : string) : boolean {
    const call = path.parentPath;
    if (call === null || !call.isCallExpression() || call.node.callee !== path.node) {
        return false;
    }
    const outer = call.parentPath;
    if (outer === null || !outer.isCallExpression()) {
        return false;
    }
    return isBindGeneratorCallee(outer.node.callee, outer.get("callee"), runtime);
}

/**
 * Changes one generator function. The function stays the same kind of
 * function, with the same name and parameters, so declarations stay hoisted
 * and `length` does not change. The body moves into an inner generator, and
 * the function gives `bindGenerator(inner())`:
 *
 * ```js
 * function* numbers(limit) { ...body... }
 * // becomes
 * function numbers(limit) { return _bindGenerator((function* () { ...body... })()); }
 * ```
 *
 * `unwrapFunctionEnvironment` keeps `this`, `arguments`, `super` and
 * `new.target` of the original function.
 */
function bindGeneratorFunction(path : FunctionPath, bindGenerator : types.Expression) : void {
    const node = path.node;
    if (!types.isBlockStatement(node.body)) {
        return;
    }
    const inner = types.functionExpression(null, [], types.blockStatement(node.body.body), true, node.async);
    node.body = types.blockStatement(
        [types.returnStatement(types.callExpression(bindGenerator, [types.callExpression(inner, [])]))],
        node.body.directives,
    );
    node.generator = false;
    node.async = false;
    const innerPath = path.get("body.body.0.argument.arguments.0.callee") as NodePath<types.FunctionExpression>;
    innerPath.unwrapFunctionEnvironment();
}

/**
 * The Babel plugin that binds generators to the context of their creation
 * (rule C5). It changes the code in `Program` enter, before the async
 * generator transform changes the async generators.
 */
export function bindGeneratorsPlugin(_api : unknown, options : object) : PluginObject<PluginPass> {
    const { runtime } = options as BindGeneratorsOptions;
    return {
        name : "async-browser-context/bind-generators",
        visitor : {
            Program(programPath, state) {
                let helper : types.Expression | undefined;
                const bindGenerator = () : types.Expression => {
                    helper ??= addNamed(programPath, "bindGenerator", runtime, { nameHint : "bindGenerator" }) as types.Expression;
                    return types.cloneNode(helper);
                };
                let changed = false;
                programPath.traverse({
                    Function(path) {
                        const node = path.node;
                        if (node.async) {
                            changed = true;
                        }
                        if (!node.generator || isAsyncGeneratorHelperArgument(path) || isAlreadyBound(path, runtime)) {
                            return;
                        }
                        changed = true;
                        bindGeneratorFunction(path, bindGenerator());
                    },
                    ForOfStatement(path) {
                        if (path.node.await) {
                            changed = true;
                        }
                    },
                });
                if (changed) {
                    (state.file.metadata as unknown as Record<string, unknown>)[METADATA_KEY] = true;
                }
            },
        },
    };
}
