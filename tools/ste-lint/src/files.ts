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
 * Patterns use `/` on all platforms.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const GLOB_CHARS = /[*?[\]{}]/;

/** True when `pattern` has glob characters. */
export function isGlob(pattern : string) : boolean {
    return GLOB_CHARS.test(pattern);
}

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

function globSource(glob : string) : string {
    let source = "";
    let i = 0;
    while (i < glob.length) {
        const char = glob[i]!;
        if (char === "*") {
            if (glob[i + 1] === "*") {
                const atStart = i === 0 || glob[i - 1] === "/";
                const atEnd = i + 2 === glob.length || glob[i + 2] === "/";
                if (atStart && atEnd) {
                    if (glob[i + 2] === "/") {
                        source += "(?:.*/)?";
                        i += 3;
                    } else {
                        source += ".*";
                        i += 2;
                    }
                    continue;
                }
            }
            source += "[^/]*";
            i++;
            while (glob[i] === "*") i++;
            continue;
        }
        if (char === "?") {
            source += "[^/]";
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
                source += `(?:${splitAlternatives(glob.slice(i + 1, close)).map(globSource).join("|")})`;
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
export function globToRegExp(glob : string) : RegExp {
    const normalized = glob.replace(/\\/g, "/").replace(/^\.\//, "");
    return new RegExp(`^${globSource(normalized)}$`);
}

/** The part of a pattern before the first segment with glob characters. The walk starts in that directory. */
export function globBase(glob : string) : string {
    const segments = glob.replace(/\\/g, "/").split("/");
    const base : string[] = [];
    for (const segment of segments.slice(0, -1)) {
        if (isGlob(segment)) break;
        base.push(segment);
    }
    return base.join("/");
}

function toPosix(path : string) : string {
    return path.split(sep).join("/");
}

/** Directories that the walk does not enter. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

export type FindOptions = {
    /** The directory that the patterns are relative to. */
    readonly root : string;
    readonly include : readonly string[];
    readonly ignore : readonly string[];
};

/**
 * This function finds the files that match the include patterns and no
 * ignore pattern. A pattern without glob characters is a file name, and
 * the ignore patterns do not apply to it. The result has absolute paths,
 * in sorted order, without duplicates.
 */
export function findFiles(options : FindOptions) : string[] {
    const root = resolve(options.root);
    const ignore = options.ignore.map(globToRegExp);
    const isIgnored = (relativePath : string) : boolean => ignore.some((pattern) => pattern.test(relativePath));
    const found = new Set<string>();

    for (const pattern of options.include) {
        const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
        if (!isGlob(normalized)) {
            const path = resolve(root, normalized);
            if (existsSync(path) && statSync(path).isFile()) found.add(path);
            continue;
        }
        const matcher = globToRegExp(normalized);
        const base = resolve(root, globBase(normalized));
        if (!existsSync(base)) continue;
        const walk = (directory : string) : void => {
            for (const entry of readdirSync(directory, { withFileTypes : true })) {
                const path = join(directory, entry.name);
                const relativePath = toPosix(relative(root, path));
                if (entry.isDirectory()) {
                    // A pattern such as "**/dist/**" matches the files in a directory, so test the directory with a "/" after it.
                    if (SKIPPED_DIRECTORIES.has(entry.name) || isIgnored(relativePath) || isIgnored(`${relativePath}/`)) continue;
                    walk(path);
                } else if (entry.isFile() && matcher.test(relativePath) && !isIgnored(relativePath)) {
                    found.add(path);
                }
            }
        };
        walk(base);
    }
    return [...found].sort();
}
