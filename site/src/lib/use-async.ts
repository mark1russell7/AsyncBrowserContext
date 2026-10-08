import { useEffect, useState, type DependencyList } from "react";

export type AsyncState<T> =
    | { status : "loading" }
    | { status : "ready"; value : T }
    | { status : "error"; error : Error };

function toError(reason : unknown) : Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * This hook starts `load` when the dependencies change, and it gives its
 * state. The hook ignores a result that arrives after the dependencies
 * changed (or after the unmount).
 */
export function useAsync<T>(load : () => Promise<T>, deps : DependencyList) : AsyncState<T> {
    const [state, setState] = useState<AsyncState<T>>({ status : "loading" });

    useEffect(() => {
        let current = true;
        setState({ status : "loading" });
        load().then(
            (value) => { if (current) setState({ status : "ready", value }); },
            (reason : unknown) => { if (current) setState({ status : "error", error : toError(reason) }); },
        );
        return () => { current = false; };
        // The caller owns the dependency list, as with useEffect.
    }, deps);

    return state;
}
