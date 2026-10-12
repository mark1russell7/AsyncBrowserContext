import { execFileSync } from "node:child_process";

/** The commit dates of the files, from `gitLastModified`. */
export type LastModified = {
    /** The date of the last commit of each file, in ISO 8601 format. The key is the path of the file, relative to the folder `cwd` of `gitLastModified`. */
    dates : Map<string, string>;
    /** The reason when there are no dates, for example a shallow clone. */
    problem? : string;
};

/** This function starts git with `args` in the folder `cwd`, and gives its output. */
export type RunGit = (cwd : string, args : readonly string[]) => string;

const runGit : RunGit = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding : "utf8", stdio : ["ignore", "pipe", "pipe"] });

/** The separator before each commit in the output of `git log` (refer to `gitLastModified`). */
const COMMIT = "\u0000";

/**
 * This function reads the output of `git log --format=%x00%cI --name-only`.
 * The log starts with the newest commit, so the first date of a file is the
 * date of its last commit.
 */
export function parseGitLog(output : string) : Map<string, string> {
    const dates = new Map<string, string>();
    for (const commit of output.split(COMMIT)) {
        const [date, ...files] = commit.split(/\r?\n/).map(line => line.trim());
        if (date === undefined || date === "") continue;
        for (const file of files) {
            if (file !== "" && !dates.has(file)) dates.set(file, date);
        }
    }
    return dates;
}

/**
 * This function gives the date of the last commit of each file below
 * `paths`, from git. A shallow clone (for example `actions/checkout` with the
 * default `fetch-depth: 1`) has only the last commit, and git gives each file
 * the date of that commit. Thus, in a shallow clone and without git, the
 * function gives no dates and the reason.
 */
export function gitLastModified(cwd : string, paths : readonly string[], run : RunGit = runGit) : LastModified {
    try {
        if (run(cwd, ["rev-parse", "--is-shallow-repository"]).trim() === "true") {
            return { dates : new Map(), problem : "the git clone is shallow, so it does not have the dates of the files (fetch the full history, for example with fetch-depth: 0)" };
        }
        return { dates : parseGitLog(run(cwd, ["log", "--format=%x00%cI", "--name-only", "--relative", "--", ...paths])) };
    } catch (error) {
        return { dates : new Map(), problem : `git did not give the dates of the files: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
    }
}

/**
 * The newest date of the files at `paths` and below them. A path can be a file
 * or a folder. The result is `undefined` if no file has a date.
 */
export function newestDate(dates : ReadonlyMap<string, string>, paths : readonly string[]) : string | undefined {
    let newest : { date : string; time : number } | undefined;
    for (const [file, date] of dates) {
        if (!paths.some(item => file === item || file.startsWith(`${item}/`))) continue;
        const time = Date.parse(date);
        if (Number.isNaN(time)) continue;
        if (newest === undefined || time > newest.time) newest = { date, time };
    }
    return newest?.date;
}
