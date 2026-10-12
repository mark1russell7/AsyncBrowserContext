import path from "node:path";

/**
 * The functions of `node:path` that the filters use. The tests give
 * `path.posix` or `path.win32`, thus they examine the paths of each platform
 * on each platform.
 */
export type PathFunctions = Pick<typeof path, "relative" | "isAbsolute">;

/**
 * This function gives the path of the module `id` relative to the folder
 * `root`, with forward slashes. It gives `undefined` if the module is not in
 * `root`. Vite gives the ids with forward slashes, also on Windows
 * (`C:/project/src/x.ts`), but `root` comes from `node:path` and has
 * backslashes on Windows. `path.win32.relative` accepts the two forms and
 * ignores the case of the letters.
 */
export function pathInRoot(id : string, root : string, paths : PathFunctions = path) : string | undefined {
    const relative = paths.relative(root, id).replaceAll("\\", "/");
    if (relative === ".." || relative.startsWith("../") || paths.isAbsolute(relative)) {
        return undefined;
    }
    return relative;
}

/**
 * This function gives true if the module `id` is a test file of the
 * repository in `root`: a file in `test/`, or a file that ends with
 * `.test.ts`. Only the path in `root` counts. Thus, a repository in a folder
 * such as `/home/test/project` does not make each source file a test file.
 */
export function isTestFile(id : string, root : string, paths : PathFunctions = path) : boolean {
    const relative = pathInRoot(id, root, paths);
    return relative !== undefined && (relative.startsWith("test/") || relative.endsWith(".test.ts"));
}

/**
 * This function gives true if the module `id` is a fixture that stays
 * untransformed (`test/fixtures/untransformed*`), as a dependency that the
 * application does not transform.
 */
export function isUntransformedFixture(id : string, root : string, paths : PathFunctions = path) : boolean {
    return pathInRoot(id, root, paths)?.startsWith("test/fixtures/untransformed") === true;
}
