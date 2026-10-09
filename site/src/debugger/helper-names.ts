/**
 * The functions that a debugger scenario can use without an import. The
 * module `instrumented.ts` exports them, and the build adds the import to
 * each scenario.
 */
export const HELPER_NAMES = ["log", "sleep", "fetchUser", "save", "untransformedLoad"] as const;
