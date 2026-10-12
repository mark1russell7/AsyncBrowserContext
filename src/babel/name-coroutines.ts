import { types, type NodePath, type PluginObject, type PluginPass } from "@babel/core";

/** The options of the plugin. */
export interface NameCoroutinesOptions {
    /** The module that exports `coroutine`. */
    readonly runtime : string;
}

/** The local names that Babel gives to the import of `coroutine`. */
const COROUTINE_NAME = /^_coroutine\d*$/;

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
    const parent = path.parent;
    if (types.isVariableDeclarator(parent) && parent.init === node && types.isIdentifier(parent.id)) {
        return parent.id.name;
    }
    if (types.isAssignmentExpression(parent) && parent.right === node && NAMING_OPERATORS.has(parent.operator) && types.isIdentifier(parent.left)) {
        return parent.left.name;
    }
    if (types.isAssignmentPattern(parent) && parent.right === node && types.isIdentifier(parent.left)) {
        return parent.left.name;
    }
    if ((types.isObjectProperty(parent) || types.isClassProperty(parent) || types.isClassPrivateProperty(parent)) && parent.value === node) {
        return keyName(parent.key, "computed" in parent && parent.computed === true);
    }
    return types.isExportDefaultDeclaration(parent) ? "default" : undefined;
}

/** This function gives `true` if `callee` is the `coroutine` function of the runtime, also in CommonJS output. */
function isCoroutineCallee(callee : types.Node, path : NodePath, runtime : string) : boolean {
    if (types.isIdentifier(callee)) {
        return COROUTINE_NAME.test(callee.name) || path.referencesImport(runtime, "coroutine");
    }
    const member = types.isSequenceExpression(callee) ? callee.expressions.at(-1) : callee;
    return types.isMemberExpression(member) && types.isIdentifier(member.property, { name : "coroutine" });
}

/** The key of the names of one file in the plugin state. */
const NAMES_KEY = "async-browser-context/coroutine-names";

/**
 * The Babel plugin that gives the name of each async function to `coroutine`:
 * `_coroutine(function* () {...}, "load")`. The generator function of
 * `@babel/plugin-transform-async-to-generator` has no name, and the callback
 * hooks of the runtime show the name of the async function.
 *
 * In `Program` enter, before the async transform, the plugin records the
 * name of each async function. In `Program` exit, it adds the name to each
 * `coroutine` call. For a plain function, the async transform keeps the
 * function node as the argument of `coroutine`. For a method, the call is in
 * the body of the method.
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
                            if (!path.node.async || path.node.generator) {
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
                            const { callee, arguments : args } = path.node;
                            const [body] = args;
                            if (args.length !== 1 || !types.isFunctionExpression(body) || !body.generator) {
                                return;
                            }
                            if (!isCoroutineCallee(callee, path.get("callee"), runtime)) {
                                return;
                            }
                            const parent = path.getFunctionParent()?.node;
                            const name = names.get(body) ?? (types.isMethod(parent) ? names.get(parent) : undefined);
                            if (name !== undefined) {
                                args.push(types.stringLiteral(name));
                            }
                        },
                    });
                },
            },
        },
    };
}
