import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findFiles, globBase, globToRegExp, isGlob } from "./files.js";

describe("globToRegExp", () => {
    const matches = (glob : string, path : string) : boolean => globToRegExp(glob).test(path);

    it("matches *, ** and ?", () => {
        expect(matches("*.md", "README.md")).toBe(true);
        expect(matches("*.md", "docs/a.md")).toBe(false);
        expect(matches("docs/**/*.md", "docs/a.md")).toBe(true);
        expect(matches("docs/**/*.md", "docs/x/y/a.md")).toBe(true);
        expect(matches("**/node_modules/**", "node_modules/a/b.js")).toBe(true);
        expect(matches("**/node_modules/**", "packages/x/node_modules/a.js")).toBe(true);
        expect(matches("**/dist/**", "packages/x/dist/")).toBe(true);
        expect(matches("a?.ts", "ab.ts")).toBe(true);
        expect(matches("a?.ts", "a/.ts")).toBe(false);
        expect(matches("src/**", "src/a/b.ts")).toBe(true);
        expect(matches("a**b", "axxb")).toBe(true);
    });

    it("matches alternatives and character sets", () => {
        expect(matches("packages/*/src/**/*.{ts,tsx}", "packages/lag/src/a/b.tsx")).toBe(true);
        expect(matches("packages/*/src/**/*.{ts,tsx}", "packages/lag/src/a.js")).toBe(false);
        expect(matches("*.{md,{mdx,markdown}}", "a.markdown")).toBe(true);
        expect(matches("file[0-9].md", "file3.md")).toBe(true);
        expect(matches("file[!0-9].md", "file3.md")).toBe(false);
        expect(matches("a{b", "a{b")).toBe(true);
        expect(matches("a[b", "a[b")).toBe(true);
    });

    it("escapes regular expression characters and accepts ./ and backslashes", () => {
        expect(matches("a+b.(c)", "a+b.(c)")).toBe(true);
        expect(matches("./docs\\*.md", "docs/a.md")).toBe(true);
    });

    it("finds the static base directory of a pattern", () => {
        expect(globBase("packages/*/src/**/*.ts")).toBe("packages");
        expect(globBase("docs/**/*.md")).toBe("docs");
        expect(globBase("*.md")).toBe("");
        expect(isGlob("README.md")).toBe(false);
        expect(isGlob("*.md")).toBe(true);
    });
});

describe("findFiles", () => {
    let root : string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "ste-files-"));
        const files = [
            "README.md",
            "docs/guide.md",
            "docs/deep/page.mdx",
            "packages/a/src/index.ts",
            "packages/a/src/index.test.ts",
            "packages/a/dist/index.js",
            "packages/a/node_modules/x/index.ts",
            "packages/b/src/view.tsx",
        ];
        for (const file of files) {
            mkdirSync(join(root, file, ".."), { recursive : true });
            writeFileSync(join(root, file), "x");
        }
    });

    afterEach(() => {
        rmSync(root, { recursive : true, force : true });
    });

    const find = (include : string[], ignore : string[] = ["**/*.test.ts", "**/dist/**"]) : string[] =>
        findFiles({ root, include, ignore }).map((file) => relative(root, file).split(sep).join("/"));

    it("finds the files that match, without ignored files, node_modules or duplicates, in order", () => {
        expect(find(["README.md", "docs/**/*.{md,mdx}", "packages/*/src/**/*.{ts,tsx}", "docs/guide.md"])).toEqual([
            "README.md",
            "docs/deep/page.mdx",
            "docs/guide.md",
            "packages/a/src/index.ts",
            "packages/b/src/view.tsx",
        ]);
    });

    it("lints a named file even when an ignore pattern matches it, and skips a missing file or directory", () => {
        expect(find(["packages/a/src/index.test.ts", "missing.md", "docs", "nothing/**/*.md"])).toEqual(["packages/a/src/index.test.ts"]);
    });
});
