import path from "node:path";

/**
 * This function gives the filter of the modules that the library transforms:
 * the modules in `src/` and `content/` of the site. The module of the
 * "untransformed dependency" demonstration stays as it is. The filter
 * compares absolute paths, so a folder with the same name in another place
 * (for example "/other/site/src/") does not match.
 */
export function siteModuleFilter(siteDir : string, platform : NodeJS.Platform = process.platform) : (id : string) => boolean {
    const pathOf = platform === "win32" ? path.win32 : path.posix;
    // Windows paths do not use the case of the letters.
    const key = (file : string) : string => (platform === "win32" ? file.toLowerCase() : file);
    const folders = ["src", "content"].map(folder => key(pathOf.resolve(siteDir, folder) + pathOf.sep));
    const untransformed = key(pathOf.resolve(siteDir, "src", "explore", "untransformed-dependency"));
    return (id : string) : boolean => {
        if (id.startsWith("\0")) return false;
        const file = key(pathOf.resolve(id.split("?", 1)[0] ?? id));
        return folders.some(folder => file.startsWith(folder)) && !file.startsWith(untransformed);
    };
}
