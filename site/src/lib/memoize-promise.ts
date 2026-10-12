/**
 * This function gives a function that starts `load` one time and then
 * gives the same promise. If the promise rejects, the next use tries again.
 */
export function memoizePromise<T>(load : () => Promise<T>) : () => Promise<T> {
    let pending : Promise<T> | undefined;
    return () => {
        if (!pending) {
            const attempt = load();
            pending = attempt;
            attempt.catch(() => {
                if (pending === attempt) pending = undefined;
            });
        }
        return pending;
    };
}
