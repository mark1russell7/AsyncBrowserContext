/**
 * File discovery: glob patterns to files.
 *
 * The glob syntax:
 *
 * - `*` matches characters in one path segment
 * - `**` matches zero or more segments
 * - `?` matches one character
 * - `{a,b}` matches one of the alternatives
 * - `[abc]` or `[!abc]` matches one character of a set.
 *
 * Patterns use `/` on all platforms. In an include pattern, `*`, `**` and
 * `?` do not match a dot at the start of a segment, so `*.md` does not
 * match `.notes.md`. Write the dot to match these names, for example
 * `.github/*.md`. In an ignore pattern, they also match a dot.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const GLOB_CHARS = /[*?[\]{}]/;

/** True when `pattern` has glob characters. */
export function isGlob(pattern : string) : boolean {
    return GLOB_CHARS.test(pattern);
}

export type GlobOptions = {
    /** True when `*`, `**` and `?` also match a dot at the start of a segment. The default is false. */
    readonly dot? : boolean;
};

function escape(char : string) : string {
    return /[.+^$()|\\[\]{}]/.test(char) ? `\\${char}` : char;
}

/** The index of the `}` that closes the `{` at `open`, or -1. */
function closingBrace(glob : string, open : number) : number {
    let depth = 0;
    for (let i = open; i < glob.length; i++) {
        if (glob[i] === "{") depth++;
        if (glob[i] === "}" && --depth === 0) return i;
    }
    return -1;
}

/** The alternatives of a `{...}` group. A comma in a nested group does not divide alternatives. */
function splitAlternatives(body : string) : string[] {
    const parts : string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        if (body[i] === "{") depth++;
        if (body[i] === "}") depth--;
        if (body[i] === "," && depth === 0) {
            parts.push(body.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(body.slice(start));
    return parts;
}

/** The regular expression source of `glob`. `startsSegment` is true when the glob starts at the start of a path segment. */
function globSource(glob : string, dot : boolean, startsSegment : boolean) : string {
    // A segment that `*`, `**` or `?` matches must not start with a dot.
    const noDot = dot ? "" : "(?!\\.)";
    let source = "";
    let i = 0;
    while (i < glob.length) {
        const char = glob[i]!;
        const atSegmentStart = i === 0 ? startsSegment : glob[i - 1] === "/";
        if (char === "*") {
            if (glob[i + 1] === "*") {
                const atEnd = i + 2 === glob.length || glob[i + 2] === "/";
                if (atSegmentStart && atEnd) {
                    if (glob[i + 2] === "/") {
                        source += dot ? "(?:.*/)?" : "(?:(?!\\.)[^/]*/)*";
                        i += 3;
                    } else {
                        source += dot ? ".*" : "(?:(?!\\.)[^/]*(?:/(?!\\.)[^/]*)*)?";
                        i += 2;
                    }
                    continue;
                }
            }
            source += `${atSegmentStart ? noDot : ""}[^/]*`;
            i++;
            while (glob[i] === "*") i++;
            continue;
        }
        if (char === "?") {
            source += atSegmentStart && !dot ? "[^/.]" : "[^/]";
            i++;
            continue;
        }
        if (char === "[") {
            const close = glob.indexOf("]", i + 1);
            if (close !== -1) {
                let set = glob.slice(i + 1, close);
                if (set.startsWith("!")) set = "^" + set.slice(1);
                source += `[${set.replace(/\\/g, "\\\\")}]`;
                i = close + 1;
                continue;
            }
        }
        if (char === "{") {
            const close = closingBrace(glob, i);
            if (close !== -1) {
                const alternatives = splitAlternatives(glob.slice(i + 1, close)).map((alternative) => globSource(alternative, dot, atSegmentStart));
                source += `(?:${alternatives.join("|")})`;
                i = close + 1;
                continue;
            }
        }
        source += escape(char);
        i++;
    }
    return source;
}

/** This function converts a glob pattern to a regular expression that matches a whole relative path. */
export function globToRegExp(glob : string, options : GlobOptions = {}) : RegExp {
    const normalized = glob.replace(/\\/g, "/").replace(/^\.\//, "");
    return new RegExp(`^${globSource(normalized, options.dot ?? false, true)}$`);
}

/** The part of a pattern before the first segment with glob characters. The walk starts in that directory. */
export function globBase(glob : string) : string {
    const segments = glob.replace(/\\/g, "/").split("/");
    const base : string[] = [];
    for (const segment of segments.slice(0, -1)) {
        if (isGlob(segment)) break;
        base.push(segment);
    }
    const joined = base.join("/");
    // The base of "/*.md" is the root directory.
    return joined === "" && glob.startsWith("/") ? "/" : joined;
}

function toPosix(path : string) : string {
    return path.split(sep).join("/");
}

/** Directories that the walk does not enter. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

export type FindOptions = {
    /** The directory that the include patterns are relative to. */
    readonly root : string;
    readonly include : readonly string[];
    readonly ignore : readonly string[];
    /** The directory that the ignore patterns are relative to. The default is `root`. */
    readonly ignoreRoot? : string;
};

/**
 * This function finds the files that match the include patterns and no
 * ignore pattern. An include pattern can be relative to `root`, or
 * absolute. A pattern without glob characters is a file name or a
 * directory. The ignore patterns do not apply to a file name. A directory
 * gives all files in it and in its subdirectories, as the pattern
 * `directory/**` does. The result has absolute paths, in sorted order,
 * without duplicates.
 */
export function findFiles(options : FindOptions) : string[] {
    const root = resolve(options.root);
    const ignoreRoot = resolve(options.ignoreRoot ?? options.root);
    const ignore = options.ignore.map((pattern) => globToRegExp(pattern, { dot : true }));
    const isIgnored = (path : string, directory : boolean) : boolean => {
        const relativePath = toPosix(relative(ignoreRoot, path));
        // A pattern such as "**/dist/**" matches the files in a directory, so test the directory with a "/" after it.
        return ignore.some((pattern) => pattern.test(relativePath) || (directory && pattern.test(`${relativePath}/`)));
    };
    const found = new Set<string>();

    /** This function adds the files under `base` whose path relative to `base` matches `matcher`. */
    const walk = (base : string, matcher : RegExp) : void => {
        const visit = (directory : string) : void => {
            for (const entry of readdirSync(directory, { withFileTypes : true })) {
                const path = join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (SKIPPED_DIRECTORIES.has(entry.name) || isIgnored(path, true)) continue;
                    visit(path);
                } else if (entry.isFile() && matcher.test(toPosix(relative(base, path))) && !isIgnored(path, false)) {
                    found.add(path);
                }
            }
        };
        visit(base);
    };

    for (const pattern of options.include) {
        const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
        if (!isGlob(normalized)) {
            const path = resolve(root, normalized);
            if (!existsSync(path)) continue;
            const stats = statSync(path);
            if (stats.isFile()) found.add(path);
            else if (stats.isDirectory()) walk(path, globToRegExp("**/*"));
            continue;
        }
        // The matcher gets the path relative to the base directory. Thus a relative pattern and an absolute pattern work the same way.
        const base = globBase(normalized);
        const rest = base === "" ? normalized : normalized.slice(base.endsWith("/") ? base.length : base.length + 1);
        const baseDirectory = resolve(root, base);
        if (!existsSync(baseDirectory) || !statSync(baseDirectory).isDirectory()) continue;
        walk(baseDirectory, globToRegExp(rest));
    }
    return [...found].sort();
}
