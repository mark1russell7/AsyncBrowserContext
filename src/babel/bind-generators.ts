import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import { addNamed } from "@babel/helper-module-imports";

/** The options of the plugin. */
export interface BindGeneratorsOptions {
    /** The module that exports `bindGenerator`. */
    readonly runtime : string;
}

/** The key of the file metadata that tells if the preset changed the file. */
export const METADATA_KEY = "asyncBrowserContext";

/**
 * The local names of the async generator helper: `wrapAsyncGenerator` of
 * `@babel/plugin-transform-async-generator-functions`, or `asyncGenerator` of the runtime,
 * which the preset gives in its place. Babel gives them an underscore.
 */
const ASYNC_GENERATOR_HELPER = /^_(wrapAsyncGenerator|asyncGenerator)\d*$/;
/** The local names that `addNamed` gives to `bindGenerator`. */
const BIND_GENERATOR_NAME = /^_bindGenerator\d*$/;

type FunctionPath = NodePath<types.Function>;

/** This function gives `true` if `path` is the generator that Babel gives to its async generator helper. */
function isAsyncGeneratorHelperArgument(path : FunctionPath) : boolean {
    const parent = path.parent;
    if (!types.isCallExpression(parent)) {
        return false;
    }
    if (types.isIdentifier(parent.callee)) {
        return ASYNC_GENERATOR_HELPER.test(parent.callee.name);
    }
    // CommonJS output of the preset: _runtime.asyncGenerator or (0, _runtime.asyncGenerator)
    const member = types.isSequenceExpression(parent.callee) ? parent.callee.expressions.at(-1) : parent.callee;
    return types.isMemberExpression(member) && types.isIdentifier(member.property, { name : "asyncGenerator" });
}

/**
 * This function gives `true` if `callee` is the `bindGenerator` function of
 * the runtime: an import, or `_runtime.bindGenerator` in CommonJS output,
 * also in the form `(0, _runtime.bindGenerator)`.
 */
function isBindGeneratorCallee(callee : types.Node, path : NodePath, runtime : string) : boolean {
    if (types.isIdentifier(callee)) {
        // Stryker disable next-line StringLiteral: referencesImport with an empty name accepts each import of the runtime, which gives the same result here
        return BIND_GENERATOR_NAME.test(callee.name) || path.referencesImport(runtime, "bindGenerator");
    }
    // Stryker disable next-line UnaryOperator: the sequence (0, _runtime.bindGenerator) has two expressions, so at(1) gives the same expression
    const member = types.isSequenceExpression(callee) ? callee.expressions.at(-1) : callee;
    return types.isMemberExpression(member) && types.isIdentifier(member.property, { name : "bindGenerator" });
}

/** This function gives `true` if this plugin already changed the generator: `bindGenerator((function* () {...})())`. */
function isAlreadyBound(path : FunctionPath, runtime : string) : boolean {
    // A function and a call always have a parent path: at least the program
    const call = path.parentPath as NodePath;
    const outer = call.parentPath as NodePath;
    return call.isCallExpression() && call.node.callee === path.node
        && outer.isCallExpression() && isBindGeneratorCallee(outer.node.callee, outer.get("callee"), runtime);
}

/**
 * This function changes one generator function. The function stays the same kind of
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
    // A generator function always has a block body: an arrow function cannot be a generator
    const body = node.body as types.BlockStatement;
    const inner = types.functionExpression(null, [], types.blockStatement(body.body), true, node.async);
    node.body = types.blockStatement(
        [types.returnStatement(types.callExpression(bindGenerator, [types.callExpression(inner, [])]))],
        body.directives,
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
                        // The driver of the runtime keeps the context of an async generator (asyncGenerator)
                        if (!node.generator || node.async || isAsyncGeneratorHelperArgument(path) || isAlreadyBound(path, runtime)) {
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
