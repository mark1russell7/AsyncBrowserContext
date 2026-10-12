import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gitLastModified, newestDate, parseGitLog, type RunGit } from "./lastmod";

const LOG = [
    "\u00002026-10-12T17:00:00+02:00",
    "",
    "content/docs/api.mdx",
    "src/home/HomePage.tsx",
    "\u00002026-10-10T09:00:00+00:00",
    "",
    "content/docs/api.mdx",
    "content/docs/index.mdx",
    "index.html",
    "",
].join("\n");

describe("the dates of the sitemap", () => {
    it("gives each file the date of its newest commit", () => {
        expect(parseGitLog(LOG)).toEqual(new Map([
            ["content/docs/api.mdx", "2026-10-12T17:00:00+02:00"],
            ["src/home/HomePage.tsx", "2026-10-12T17:00:00+02:00"],
            ["content/docs/index.mdx", "2026-10-10T09:00:00+00:00"],
            ["index.html", "2026-10-10T09:00:00+00:00"],
        ]));
        expect(parseGitLog("")).toEqual(new Map());
    });

    it("gives the newest date of a file or of the files in a folder", () => {
        const dates = parseGitLog(LOG);
        expect(newestDate(dates, ["index.html", "src/home"])).toBe("2026-10-12T17:00:00+02:00");
        expect(newestDate(dates, ["content/docs/index.mdx"])).toBe("2026-10-10T09:00:00+00:00");
        expect(newestDate(dates, ["content/docs/new.mdx"])).toBeUndefined();
        expect(newestDate(dates, ["src/ho"])).toBeUndefined();
    });

    it("gives no dates in a shallow clone, because git gives each file the date of the last commit", () => {
        const calls : string[][] = [];
        const shallow : RunGit = (_cwd, args) => {
            calls.push([...args]);
            return args[0] === "rev-parse" ? "true\n" : LOG;
        };
        const result = gitLastModified("/site", ["content"], shallow);
        expect(result.dates.size).toBe(0);
        expect(result.problem).toMatch(/shallow/);
        expect(calls).toEqual([["rev-parse", "--is-shallow-repository"]]);
    });

    it("reads the log of the files in a full clone, and gives no dates when git fails", () => {
        const full : RunGit = (_cwd, args) => (args[0] === "rev-parse" ? "false\n" : LOG);
        expect(gitLastModified("/site", ["content"], full).dates.get("index.html")).toBe("2026-10-10T09:00:00+00:00");
        const failing : RunGit = () => {
            throw new Error("fatal: not a git repository\nmore text");
        };
        expect(gitLastModified("/site", ["content"], failing)).toEqual({ dates : new Map(), problem : "git did not give the dates of the files: fatal: not a git repository" });
    });

    it("starts git in the site folder, with paths relative to it", () => {
        const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
        const result = gitLastModified(site, ["content/docs"]);
        // A shallow clone (for example in CI) has no dates. A full clone has a date for each committed page.
        if (result.problem === undefined) expect(result.dates.get("content/docs/api.mdx")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        else expect(result.problem).toMatch(/shallow|git/);
    });
});
