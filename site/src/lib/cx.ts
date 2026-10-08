/** Joins class names and drops the empty ones. */
export function cx(...classes : ReadonlyArray<string | false | null | undefined>) : string {
    return classes.filter(Boolean).join(" ");
}
