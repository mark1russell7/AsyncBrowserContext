import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";
import { isRuntimeCallee, isRuntimeFunction } from "./runtime-calls.js";

/** The options of the plugin. */
export interface NameCoroutinesOptions {
    /** The module that exports `coroutine` and `asyncGenerator`. */
    readonly runtime : string;
}

/** The assignment operators that give a name to an anonymous function, as in the specification (NamedEvaluation). */
const NAMING_OPERATORS = new Set(["=", "&&=", "||=", "??="]);

/** This function gives the name of a property key, or `undefined` if the name is known only at run time. */
function keyName(key : types.Node, computed : boolean) : string | undefined {
    if (types.isStringLiteral(key)) {
        return key.value;
    }
    if (types.isNumericLiteral(key)) {
        return String(key.value);
    }
    if (computed) {
        return undefined;
    }
    if (types.isIdentifier(key)) {
        return key.name;
    }
    return types.isPrivateName(key) ? `#${key.id.name}` : undefined;
}

/** This function gives `true` for a TypeScript or Flow wrapper of an expression, which does not change the name of a function. */
function isTypeWrapper(path : NodePath) : boolean {
    return path.isTSAsExpression() || path.isTSSatisfiesExpression() || path.isTSNonNullExpression()
        || path.isTSTypeAssertion() || path.isTypeCastExpression() || path.isParenthesizedExpression();
}

/**
 * This function gives the `name` that JavaScript gives to the function, or
 * `undefined` if the name is not known before run time.
 */
export function functionName(path : NodePath<types.Function>) : string | undefined {
    const node = path.node;
    if ((types.isFunctionDeclaration(node) || types.isFunctionExpression(node)) && node.id) {
        return node.id.name;
    }
    if (types.isObjectMethod(node) || types.isClassMethod(node) || types.isClassPrivateMethod(node)) {
        return keyName(node.key, node.computed === true);
    }
    // `const h = (async () => {}) as Handler` names the function `h`
    let child : types.Node = node;
    let parentPath : NodePath | null = path.parentPath;
    while (parentPath !== null && isTypeWrapper(parentPath)) {
        child = parentPath.node;
        parentPath = parentPath.parentPath;
    }
    const parent = parentPath?.node;
    if (types.isVariableDeclarator(parent) && parent.init === child && types.isIdentifier(parent.id)) {
        return parent.id.name;
    }
    if (types.isAssignmentExpression(parent) && parent.right === child && NAMING_OPERATORS.has(parent.operator) && types.isIdentifier(parent.left)) {
        return parent.left.name;
    }
    if (types.isAssignmentPattern(parent) && parent.right === child && types.isIdentifier(parent.left)) {
        return parent.left.name;
    }
    if ((types.isObjectProperty(parent) || types.isClassProperty(parent) || types.isClassPrivateProperty(parent) || types.isClassAccessorProperty(parent)) && parent.value === child) {
        return keyName(parent.key, "computed" in parent && parent.computed === true);
    }
    return types.isExportDefaultDeclaration(parent) ? "default" : undefined;
}

/**
 * Where the async transform has no name for the function, for example in a class field or as
 * an argument, it gives an anonymous wrapper:
 *
 * ```js
 * function () { var _ref = _coroutine(function* (value) {...}, "save"); return function (_x) { return _ref.apply(this, arguments); }; }()
 * ```
 *
 * This function gives that wrapper the name of the source, so `fn.name` stays the same. The
 * wrapper uses only `_ref`, `this` and `arguments`, so its new name hides no other binding.
 */
function nameReturnedWrapper(call : NodePath<types.CallExpression>, name : string) : void {
    if (!types.isValidIdentifier(name)) {
        return;
    }
    const declarator = call.parentPath;
    const declaration = declarator?.parentPath;
    if (declarator?.isVariableDeclarator() !== true || declaration?.isVariableDeclaration() !== true || !declaration.inList) {
        return;
    }
    const next = declaration.getSibling((declaration.key as number) + 1);
    if (!next.isReturnStatement()) {
        return;
    }
    const returned = next.node.argument;
    if (types.isFunctionExpression(returned) && (returned.id === null || returned.id === undefined)) {
        returned.id = types.identifier(name);
    }
}

/** The key of the names of one file in the plugin state. */
const NAMES_KEY = "async-browser-context/coroutine-names";

/**
 * The Babel plugin that gives the name of each async function to `coroutine`:
 * `_coroutine(function* () {...}, "load")`, and of each async generator to
 * `asyncGenerator`. The generator function of the Babel transforms has no name,
 * and the callback hooks of the runtime show the name of the function.
 *
 * In `Program` enter, before the async transforms, the plugin records the
 * name of each async function. In `Program` exit, it adds the name to each
 * call of `coroutine` or `asyncGenerator`. For a plain function, the async
 * transform keeps the function node as the argument of the call. For a method,
 * the call is in the body of the method.
 */
export function nameCoroutinesPlugin(_api : unknown, options : object) : PluginObject<PluginPass> {
    const { runtime } = options as NameCoroutinesOptions;
    return {
        name : "async-browser-context/name-coroutines",
        visitor : {
            Program : {
                enter(programPath, state) {
                    const names = new WeakMap<types.Node, string>();
                    programPath.traverse({
                        Function(path) {
                            if (isRuntimeFunction(path.node)) {
                                // The native async functions of the runtime stay native (skip-runtime.ts)
                                path.skip();
                                return;
                            }
                            if (!path.node.async) {
                                return;
                            }
                            const name = functionName(path);
                            if (name !== undefined && name !== "") {
                                names.set(path.node, name);
                            }
                        },
                    });
                    state.set(NAMES_KEY, names);
                },
                exit(programPath, state) {
                    const names = state.get(NAMES_KEY) as WeakMap<types.Node, string>;
                    programPath.traverse({
                        CallExpression(path) {
                            const { arguments : args } = path.node;
                            const [body] = args;
                            if (args.length !== 1 || !types.isFunctionExpression(body) || !body.generator) {
                                return;
                            }
                            const callee = path.get("callee");
                            if (!isRuntimeCallee(callee, runtime, "coroutine") && !isRuntimeCallee(callee, runtime, "asyncGenerator")) {
                                return;
                            }
                            const parent = path.getFunctionParent()?.node;
                            const name = names.get(body) ?? (types.isMethod(parent) ? names.get(parent) : undefined);
                            if (name !== undefined) {
                                args.push(types.stringLiteral(name));
                                nameReturnedWrapper(path, name);
                            }
                        },
                    });
                },
            },
        },
    };
}
