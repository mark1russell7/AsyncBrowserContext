import { Variable } from "async-browser-context";

/** The label of the root context, the context without a value. */
export const ROOT = "(root)";

/** A variable with one string value in each context. */
export type ContextVariable = {
    run<R>(value : string, fn : () => R) : R;
    /** The value in the current context, or `ROOT` if no context sets a value. */
    get() : string;
};

export type ImplementationId = "library" | "global-restored" | "global-kept";

/** A way to keep a value for each context. The timeline compares the library with two global variables. */
export type ContextImplementation = {
    id : ImplementationId;
    label : string;
    /** One sentence that tells how the implementation keeps the value. */
    description : string;
    createVariable(name : string) : ContextVariable;
};

/** The library: `AsyncContext.Variable` of `async-browser-context`. */
export const libraryImplementation : ContextImplementation = {
    id : "library",
    label : "async-browser-context",
    description : "The real Variable class of the library, in this page. The Vite plugin of the library transforms the code of the scenarios.",
    createVariable(name) {
        const variable = new Variable<string>({ name });
        return {
            run : (value, fn) => variable.run(value, fn),
            get : () => variable.get() ?? ROOT,
        };
    },
};

/**
 * A global variable that `run()` sets, and sets back to the previous value
 * when `fn` ends. After the first `await`, the value is gone.
 */
export const restoredGlobalImplementation : ContextImplementation = {
    id : "global-restored",
    label : "Global variable, set back",
    description : "One global value. run() sets the value and sets the previous value again when fn returns. Code after await gets no value.",
    createVariable() {
        let current : string | undefined;
        return {
            run(value, fn) {
                const previous = current;
                current = value;
                try {
                    return fn();
                } finally {
                    current = previous;
                }
            },
            get : () => current ?? ROOT,
        };
    },
};

/**
 * A global variable that `run()` sets and does not set back. The last
 * `run()` wins, so code gets the value of a different operation. The old
 * runtime of this library had this problem after each `await`.
 */
export const keptGlobalImplementation : ContextImplementation = {
    id : "global-kept",
    label : "Global variable, not set back",
    description : "One global value. run() sets the value and does not set it back. Code gets the value of the last run(), also from a different operation.",
    createVariable() {
        let current : string | undefined;
        return {
            run(value, fn) {
                current = value;
                return fn();
            },
            get : () => current ?? ROOT,
        };
    },
};

export const IMPLEMENTATIONS : readonly ContextImplementation[] = [
    libraryImplementation,
    restoredGlobalImplementation,
    keptGlobalImplementation,
];

export function implementationById(id : ImplementationId) : ContextImplementation {
    return IMPLEMENTATIONS.find(implementation => implementation.id === id) ?? libraryImplementation;
}
