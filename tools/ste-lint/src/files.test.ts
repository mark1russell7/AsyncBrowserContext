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

    it("does not match a dot at the start of a name with *, ** or ?, unless the option dot is true", () => {
        expect(matches("*.md", ".notes.md")).toBe(false);
        expect(matches("docs/**/*.md", "docs/.cache/a.md")).toBe(false);
        expect(matches("docs/**", "docs/.cache/a.md")).toBe(false);
        expect(matches("?notes.md", ".notes.md")).toBe(false);
        expect(matches("{*.md,x}", ".a.md")).toBe(false);
        expect(matches("a*.md", "a.md")).toBe(true);
        expect(matches(".github/*.yml", ".github/ci.yml")).toBe(true);
        expect(matches("**/.*", "docs/.notes")).toBe(true);
        expect(globToRegExp("docs/**/*.md", { dot : true }).test("docs/.cache/.a.md")).toBe(true);
        expect(globToRegExp("**/dist/**", { dot : true }).test(".out/dist/")).toBe(true);
    });

    it("escapes regular expression characters and accepts ./ and backslashes", () => {
        expect(matches("a+b.(c)", "a+b.(c)")).toBe(true);
        expect(matches("./docs\\*.md", "docs/a.md")).toBe(true);
    });

    it("finds the static base directory of a pattern", () => {
        expect(globBase("packages/*/src/**/*.ts")).toBe("packages");
        expect(globBase("docs/**/*.md")).toBe("docs");
        expect(globBase("*.md")).toBe("");
        expect(globBase("/*.md")).toBe("/");
        expect(globBase("C:\\docs\\*.md")).toBe("C:/docs");
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
        expect(find(["packages/a/src/index.test.ts", "missing.md", "missing", "nothing/**/*.md"])).toEqual(["packages/a/src/index.test.ts"]);
    });

    it("gives all files of a directory, without the ignored files", () => {
        expect(find(["docs"])).toEqual(["docs/deep/page.mdx", "docs/guide.md"]);
        expect(find(["packages/a/"])).toEqual(["packages/a/src/index.ts"]);
    });

    it("accepts absolute patterns", () => {
        const absolute = root.split(sep).join("/");
        expect(find([`${absolute}/docs/**/*.md`, `${absolute}/README.md`])).toEqual(["README.md", "docs/guide.md"]);
        expect(find([`${root}${sep}packages${sep}*${sep}src${sep}*.ts`])).toEqual(["packages/a/src/index.ts"]);
    });

    it("applies the ignore patterns relative to ignoreRoot", () => {
        const fromDocs = findFiles({ root : join(root, "docs"), include : ["**/*.{md,mdx}"], ignore : ["docs/deep/**"], ignoreRoot : root });
        expect(fromDocs.map((file) => relative(root, file).split(sep).join("/"))).toEqual(["docs/guide.md"]);
    });

    it("does not match names that start with a dot with *, ** or ?, but the ignore patterns do", () => {
        for (const file of ["docs/.hidden.md", "docs/.cache/page.md", ".github/notes.md"]) {
            mkdirSync(join(root, file, ".."), { recursive : true });
            writeFileSync(join(root, file), "x");
        }
        expect(find(["docs/**/*.md"])).toEqual(["docs/guide.md"]);
        expect(find(["**/*.md"])).toEqual(["README.md", "docs/guide.md"]);
        expect(find([".github/*.md", "docs/.*.md"])).toEqual([".github/notes.md", "docs/.hidden.md"]);
        expect(find(["**/*.md", "docs/.*.md"], ["**/*hidden*"])).toEqual(["README.md", "docs/guide.md"]);
    });
});
