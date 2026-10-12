import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import { addNamed } from "@babel/helper-module-imports";
import { isRuntimeCallee, isRuntimeFunction } from "./runtime-calls.js";

/** The options of the plugin. */
export interface BindGeneratorsOptions {
    /** The module that exports `bindGenerator`. */
    readonly runtime : string;
}

/** The key of the file metadata that tells if the preset changed the file. */
export const METADATA_KEY = "asyncBrowserContext";

type FunctionPath = NodePath<types.Function>;

/**
 * This function gives `true` if `path` is the generator that a driver of the runtime operates:
 * the argument of `coroutine` or `asyncGenerator`. The driver keeps the context itself, so the
 * plugin does not bind it. This is the case when the preset transforms its own output again.
 * The generator of a Babel helper, for example `_wrapAsyncGenerator`, gets a binding.
 */
function isDriverArgument(path : FunctionPath, runtime : string) : boolean {
    const call = path.parentPath;
    if (call === null || !call.isCallExpression() || call.node.arguments[0] !== path.node) {
        return false;
    }
    const callee = call.get("callee");
    return isRuntimeCallee(callee, runtime, "coroutine") || isRuntimeCallee(callee, runtime, "asyncGenerator");
}

/** This function gives `true` if this plugin already changed the generator: `bindGenerator((function* () {...})())`. */
function isAlreadyBound(path : FunctionPath, runtime : string) : boolean {
    // A function and a call always have a parent path: at least the program
    const call = path.parentPath as NodePath;
    const outer = call.parentPath as NodePath;
    return call.isCallExpression() && call.node.callee === path.node
        && outer.isCallExpression() && isRuntimeCallee(outer.get("callee"), runtime, "bindGenerator");
}

/**
 * This function gives the names of the parameters that the body declares again with `var`. In
 * the original function, such a variable starts with the value of the parameter. The inner
 * function gets these names as its parameters, so the values stay the same.
 */
function redeclaredParameters(path : FunctionPath) : string[] {
    const parameters = new Set<string>();
    for (const parameter of path.node.params) {
        for (const name of Object.keys(types.getBindingIdentifiers(parameter as types.Node))) {
            parameters.add(name);
        }
    }
    if (parameters.size === 0) {
        return [];
    }
    const redeclared = new Set<string>();
    path.get("body").traverse({
        Function(inner) {
            inner.skip();
        },
        VariableDeclaration(declaration) {
            if (declaration.node.kind !== "var") {
                return;
            }
            for (const name of Object.keys(declaration.getBindingIdentifiers())) {
                if (parameters.has(name)) {
                    redeclared.add(name);
                }
            }
        },
    });
    return [...redeclared];
}

/**
 * This function changes one generator function. The function keeps its name and its
 * parameters, so a declaration stays hoisted and `length` does not change. It becomes a plain
 * function: `fn.constructor` is `Function`, not `GeneratorFunction`. The body moves into an
 * inner generator, and the function gives `bindGenerator(inner())`:
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
    const passed = redeclaredParameters(path);
    const inner = types.functionExpression(null, passed.map((name) => types.identifier(name)), types.blockStatement(body.body), true, node.async);
    node.body = types.blockStatement(
        [types.returnStatement(types.callExpression(bindGenerator, [types.callExpression(inner, passed.map((name) => types.identifier(name)))]))],
        body.directives,
    );
    node.generator = false;
    node.async = false;
    const innerPath = path.get("body.body.0.argument.arguments.0.callee") as NodePath<types.FunctionExpression>;
    innerPath.unwrapFunctionEnvironment();
}

/**
 * A generator declaration in a block of a script (sloppy mode) is not hoisted out of the block,
 * but a plain function declaration is (Annex B.3.3). The changed declaration thus becomes a
 * `let` at the start of its block, with the same name.
 */
function keepBlockScope(path : FunctionPath) : void {
    const block = path.parentPath;
    if (!path.isFunctionDeclaration() || block === null || !block.isBlockStatement() || block.parentPath?.isFunction() === true || path.isInStrictMode()) {
        return;
    }
    const { id, params, body } = path.node;
    if (id === null || id === undefined) {
        return;
    }
    const declaration = types.variableDeclaration("let", [
        types.variableDeclarator(types.identifier(id.name), types.functionExpression(types.identifier(id.name), params, body)),
    ]);
    path.remove();
    block.unshiftContainer("body", declaration);
}

/**
 * The Babel plugin that binds sync generators to the context of their creation
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
                        if (isRuntimeFunction(node)) {
                            // The native async functions of the runtime stay native (skip-runtime.ts)
                            path.skip();
                            return;
                        }
                        if (node.async) {
                            // The async transforms change this function
                            changed = true;
                        }
                        // The driver of the runtime keeps the context of an async generator (asyncGenerator)
                        if (!node.generator || node.async || isDriverArgument(path, runtime) || isAlreadyBound(path, runtime)) {
                            return;
                        }
                        changed = true;
                        bindGeneratorFunction(path, bindGenerator());
                        keepBlockScope(path);
                    },
                });
                if (changed) {
                    (state.file.metadata as unknown as Record<string, unknown>)[METADATA_KEY] = true;
                }
            },
        },
    };
}
